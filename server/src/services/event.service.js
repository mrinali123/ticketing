import Event from '../models/Event.js';
import Seat from '../models/Seat.js';
import Booking from '../models/Booking.js';
import { httpError } from '../errors/httpError.js';

// Loads an event and checks the logged-in organiser owns it
async function getOwnedEvent(id, userId) {
  const event = await Event.findById(id); // invalid id → CastError, handled in the controller
  if (!event) throw httpError(404, 'Event not found');

  // organiser is an ObjectId and userId is a string, so compare them as strings
  if (event.organiser.toString() !== userId) {
    throw httpError(403, "You don't own this event");
  }
  return event;
}

export async function createEvent(organiserId, data) {
  // Save the event, owned by the logged-in organiser
  const event = await Event.create({ ...data, organiser: organiserId });

  // Build one seat per row/number: rows 0,1,2... become "A","B","C"...
  const seats = [];
  for (let r = 0; r < event.rows; r++) {
    const row = String.fromCharCode(65 + r); // 65 is the char code for "A"
    for (let number = 1; number <= event.seatsPerRow; number++) {
      seats.push({ event: event._id, label: `${row}${number}`, row, number });
    }
  }

  // Save all seats in one database call instead of one call per seat
  await Seat.insertMany(seats);

  return event;
}

// Cities that have at least one upcoming event, A to Z (fills the city filter dropdown)
export async function listCities() {
  const cities = await Event.distinct('city', {
    status: 'scheduled',
    startTime: { $gte: new Date() },
  });
  return cities.sort((a, b) => a.localeCompare(b));
}

export async function listEvents({ page, limit, city }) {
  // Only upcoming events that haven't been cancelled
  const filter = { status: 'scheduled', startTime: { $gte: new Date() } };
  if (city) filter.city = city; // optional city filter

  const skip = (page - 1) * limit; // page 1 skips 0, page 2 skips `limit`, ...

  // Run both queries at the same time instead of one after the other
  const [data, total] = await Promise.all([
    Event.find(filter).sort({ startTime: 1 }).skip(skip).limit(limit), // soonest first
    Event.countDocuments(filter), // total matches, so the client knows how many pages exist
  ]);

  return { data, page, limit, total };
}

export async function listMyEvents(organiserId) {
  // All of this organiser's events, any status, newest first
  // (_id breaks ties when two events were created in the same millisecond)
  const events = await Event.find({ organiser: organiserId })
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  // Count seats per event and status in ONE database query instead of one query per event.
  // An expired hold counts as "available", the same way the event page shows it.
  const counts = await Seat.aggregate([
    { $match: { event: { $in: events.map((e) => e._id) } } },
    {
      $group: {
        _id: {
          event: '$event',
          status: {
            $cond: [
              { $and: [{ $eq: ['$status', 'held'] }, { $lt: ['$holdExpiresAt', new Date()] }] },
              'available',
              '$status',
            ],
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  // Turn the grouped rows into { eventId: { available, held, booked } }
  const byEvent = {};
  for (const { _id, count } of counts) {
    const key = _id.event.toString();
    byEvent[key] ??= { available: 0, held: 0, booked: 0 };
    byEvent[key][_id.status] = count;
  }

  return events.map((e) => ({
    ...e,
    seatCounts: byEvent[e._id.toString()] ?? { available: 0, held: 0, booked: 0 },
  }));
}

export async function getEventById(id) {
  const event = await Event.findById(id);

  if (!event) throw httpError(404, 'Event not found'); // the controller turns this into the HTTP status

  // Seat-map order (A1, A2, ... B1, ...). lean() returns plain objects we can adjust below.
  const rawSeats = await Seat.find({ event: event._id })
    .select('label row number status holdExpiresAt')
    .sort({ row: 1, number: 1 })
    .lean();

  // A hold whose time has run out is free to book (the hold query treats it that way too),
  // so show it as "available" even if the cleanup job hasn't reset it yet.
  const now = new Date();
  const seats = rawSeats.map(({ holdExpiresAt, ...seat }) =>
    seat.status === 'held' && holdExpiresAt < now ? { ...seat, status: 'available' } : seat,
  );

  return { event, seats };
}

export async function updateEvent(id, userId, updates) {
  const event = await getOwnedEvent(id, userId);

  // Copy the allowed changes onto the document, then save.
  // save() (unlike findByIdAndUpdate) runs all schema validators, e.g. price min 0.
  Object.assign(event, updates);
  await event.save();

  return event;
}

export async function cancelEvent(id, userId) {
  const event = await getOwnedEvent(id, userId);

  if (event.status === 'cancelled') {
    throw httpError(400, 'Event is already cancelled');
  }

  event.status = 'cancelled';
  await event.save();

  // Cancel every booking that was still active for this event
  const result = await Booking.updateMany(
    { event: event._id, status: { $in: ['pending', 'confirmed'] } },
    { status: 'cancelled' },
  );

  return { event, bookingsCancelled: result.modifiedCount };
}
