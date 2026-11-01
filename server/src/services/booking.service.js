import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Event from '../models/Event.js';
import Seat from '../models/Seat.js';
import { httpError } from '../errors/httpError.js';

// Read at call time so tests (or a changed .env) can override it. Default: 5 minutes.
const holdDurationMs = () => (Number(process.env.HOLD_DURATION_SECONDS) || 300) * 1000;

// What we show for booking.event and booking.seats instead of bare ids
const populateBooking = (query) =>
  query.populate('event', 'title venue city startTime').populate('seats', 'label');

// Runs `work` inside a MongoDB transaction: either every write in it is saved, or none are.
// withTransaction() also retries automatically on temporary write conflicts.
async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// Loads a booking and checks it belongs to the logged-in user
async function getOwnedBooking(id, userId) {
  const booking = await Booking.findById(id); // invalid id → CastError, handled in the controller
  if (!booking) throw httpError(404, 'Booking not found');
  if (booking.user.toString() !== userId) {
    throw httpError(403, "You don't own this booking");
  }
  return booking;
}

// Puts seats held by this booking back on sale
function releaseSeats(bookingId, session) {
  return Seat.updateMany(
    { booking: bookingId }, // only seats still linked to THIS booking, never someone else's
    { status: 'available', booking: null, holdExpiresAt: null },
    { session },
  );
}

export async function holdSeats(userId, { eventId, seatLabels, idempotencyKey }) {
  const event = await Event.findById(eventId);
  if (!event) throw httpError(404, 'Event not found');
  if (event.status !== 'scheduled' || event.startTime <= new Date()) {
    throw httpError(400, 'This event is not open for booking');
  }

  // Same key from the same user = the client is retrying, so hand back the original booking
  if (idempotencyKey) {
    const existing = await Booking.findOne({ user: userId, idempotencyKey });
    if (existing) return { booking: existing, created: false };
  }

  // One quick read of the requested seats, before any transaction
  const found = await Seat.find({ event: event._id, label: { $in: seatLabels } })
    .select('label status holdExpiresAt')
    .lean();

  // Clear 400 for labels that don't exist at all (e.g. "Z99"), instead of a misleading 409 later
  if (found.length !== seatLabels.length) {
    const foundLabels = new Set(found.map((s) => s.label));
    const missing = seatLabels.filter((label) => !foundLabels.has(label));
    throw httpError(400, `Seat(s) not found: ${missing.join(', ')}`);
  }

  // FAST FAIL: if a seat is clearly taken, say 409 now instead of opening a transaction that is
  // bound to fail. Under load (e.g. 500 people wanting one seat) this stops hundreds of doomed
  // transactions from colliding, retrying and waiting for database connections.
  //
  // This is ONLY an optimisation, never the safety check. A seat can still change between this
  // read and the update below (the read-then-write race). A seat that looks free here may be
  // taken a millisecond later, and the atomic conditional update inside the transaction is what
  // catches that. If this block were deleted, booking would still be correct, just slower.
  const now = new Date();
  const taken = found.find(
    (s) => s.status === 'booked' || (s.status === 'held' && s.holdExpiresAt > now),
  );
  if (taken) throw httpError(409, `Seat ${taken.label} is no longer available`);

  try {
    const booking = await inTransaction(async (session) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + holdDurationMs());

      // a. The booking itself (create() needs an array when passing a session)
      const [booking] = await Booking.create(
        [
          {
            user: userId,
            event: event._id,
            status: 'pending',
            expiresAt,
            amountPaise: event.pricePaise * seatLabels.length,
            idempotencyKey,
          },
        ],
        { session },
      );

      // b. Claim each seat.
      //
      // WHY "check" and "update" must be ONE atomic operation:
      // The naive way is two steps: (1) find the seat and check it's available, (2) save it as held.
      // Between those steps another request can run step (1) too. Both see "available", both save
      // "held", and the same seat ends up sold twice. That gap is a read-then-write race condition.
      //
      // findOneAndUpdate puts the condition inside the filter, so MongoDB checks AND updates the
      // seat in a single step that nothing can interrupt. If someone else got there first, the
      // filter no longer matches and we get null back. Expired holds count as free here, which is
      // why correctness never depends on the cleanup job having run.
      const seatIds = [];
      for (const label of seatLabels) {
        const seat = await Seat.findOneAndUpdate(
          {
            event: event._id,
            label,
            $or: [{ status: 'available' }, { status: 'held', holdExpiresAt: { $lt: now } }],
          },
          { status: 'held', booking: booking._id, holdExpiresAt: expiresAt },
          { returnDocument: 'after', session },
        );

        // Throwing aborts the transaction: the booking and any seats already claimed are undone
        if (!seat) throw httpError(409, `Seat ${label} is no longer available`);
        seatIds.push(seat._id);
      }

      // c. Remember which seats this booking holds
      booking.seats = seatIds;
      await booking.save({ session });
      return booking;
    });

    return { booking, created: true };
  } catch (err) {
    // Two requests with the same key at the same moment: the unique index stops the second
    // one, so return the booking the first one created instead of an error
    if (err.code === 11000 && idempotencyKey) {
      const existing = await Booking.findOne({ user: userId, idempotencyKey });
      if (existing) return { booking: existing, created: false };
    }
    throw err;
  }
}

export async function confirmBooking(id, userId) {
  const booking = await getOwnedBooking(id, userId);
  if (booking.status !== 'pending') {
    throw httpError(400, 'Only pending bookings can be confirmed');
  }

  // Too late: mark it expired and free the seats, then tell the user
  if (booking.expiresAt < new Date()) {
    await inTransaction(async (session) => {
      await Booking.updateOne(
        { _id: booking._id, status: 'pending' },
        { status: 'expired' },
        { session },
      );
      await releaseSeats(booking._id, session);
    });
    throw httpError(409, 'Hold expired');
  }

  // Payment is simulated: reaching this point counts as "paid"
  return inTransaction(async (session) => {
    // Only seats that are still held by THIS booking can become booked
    const result = await Seat.updateMany(
      { _id: { $in: booking.seats }, booking: booking._id, status: 'held' },
      { status: 'booked', holdExpiresAt: null },
      { session },
    );
    // If any seat slipped away (e.g. the hold expired and someone else took it), undo everything
    if (result.modifiedCount !== booking.seats.length) {
      throw httpError(409, 'Hold lost');
    }

    // The status condition stops a double-confirm racing with this one
    const confirmed = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'pending' },
      { status: 'confirmed' },
      { returnDocument: 'after', session },
    );
    if (!confirmed) throw httpError(409, 'Booking is no longer pending');
    return confirmed;
  });
}

export async function cancelBooking(id, userId) {
  const booking = await getOwnedBooking(id, userId);
  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw httpError(400, 'Only pending or confirmed bookings can be cancelled');
  }

  const event = await Event.findById(booking.event);
  if (event && event.startTime <= new Date()) {
    throw httpError(400, 'This event has already started');
  }

  return inTransaction(async (session) => {
    const cancelled = await Booking.findOneAndUpdate(
      { _id: booking._id, status: { $in: ['pending', 'confirmed'] } },
      { status: 'cancelled' },
      { returnDocument: 'after', session },
    );
    if (!cancelled) throw httpError(400, 'Only pending or confirmed bookings can be cancelled');

    await releaseSeats(booking._id, session);
    return cancelled;
  });
}

export function getMyBookings(userId) {
  // Newest first; uses the { user: 1, createdAt: -1 } index
  return populateBooking(Booking.find({ user: userId }).sort({ createdAt: -1 }));
}

export async function getBookingById(id, userId) {
  const booking = await populateBooking(Booking.findById(id));
  if (!booking) throw httpError(404, 'Booking not found');
  if (booking.user.toString() !== userId) {
    throw httpError(403, "You don't own this booking");
  }
  return booking;
}
