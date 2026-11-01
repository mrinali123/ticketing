import Booking from '../models/Booking.js';
import Seat from '../models/Seat.js';

// Housekeeping: tidy up holds whose time has run out.
//
// Correctness does NOT depend on this job. The hold query already treats a seat that is "held"
// with holdExpiresAt in the past as free, and getEventById shows it as "available". If this job
// stopped running, nobody could be blocked by an old hold; the database would just look untidy.
export async function expireHolds() {
  const now = new Date();

  const [bookings, seats] = await Promise.all([
    Booking.updateMany({ status: 'pending', expiresAt: { $lt: now } }, { status: 'expired' }),
    Seat.updateMany(
      { status: 'held', holdExpiresAt: { $lt: now } },
      { status: 'available', booking: null, holdExpiresAt: null },
    ),
  ]);

  return { bookingsExpired: bookings.modifiedCount, seatsReleased: seats.modifiedCount };
}
