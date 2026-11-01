import {
  holdSeats,
  confirmBooking,
  cancelBooking,
  getMyBookings,
  getBookingById,
} from '../services/booking.service.js';

const MAX_SEATS_PER_BOOKING = 6;

// Shared error → response mapping for every booking endpoint
function sendError(res, err) {
  // Mongoose throws CastError when an id isn't a valid ObjectId (e.g. "abc")
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid id' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: 'Something went wrong' });
}

export async function hold(req, res) {
  try {
    // Only take the fields we need from the body (no mass assignment)
    const { eventId, seatLabels } = req.body;
    // Optional header; an empty value counts as "not sent"
    const idempotencyKey = req.get('Idempotency-Key')?.trim() || undefined;

    if (!eventId) {
      return res.status(400).json({ message: 'Please provide eventId' });
    }
    if (
      !Array.isArray(seatLabels) ||
      seatLabels.length < 1 ||
      seatLabels.length > MAX_SEATS_PER_BOOKING ||
      !seatLabels.every((label) => typeof label === 'string' && label.trim() !== '')
    ) {
      return res.status(400).json({
        message: `seatLabels must be a list of 1 to ${MAX_SEATS_PER_BOOKING} seat labels`,
      });
    }
    // A Set drops duplicates, so a smaller size means the same seat was sent twice
    if (new Set(seatLabels).size !== seatLabels.length) {
      return res.status(400).json({ message: 'seatLabels must not contain duplicates' });
    }

    const { booking, created } = await holdSeats(req.user.id, {
      eventId,
      seatLabels,
      idempotencyKey,
    });
    // 201 for a new hold, 200 when replaying an earlier request with the same key
    return res.status(created ? 201 : 200).json(booking);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function confirm(req, res) {
  try {
    const booking = await confirmBooking(req.params.id, req.user.id);
    return res.status(200).json(booking);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function cancel(req, res) {
  try {
    const booking = await cancelBooking(req.params.id, req.user.id);
    return res.status(200).json(booking);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function listMine(req, res) {
  try {
    const bookings = await getMyBookings(req.user.id);
    return res.status(200).json(bookings);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getOne(req, res) {
  try {
    const booking = await getBookingById(req.params.id, req.user.id);
    return res.status(200).json(booking);
  } catch (err) {
    return sendError(res, err);
  }
}
