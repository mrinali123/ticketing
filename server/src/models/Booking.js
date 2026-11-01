// server/src/models/Booking.js
import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Please add a user'],
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Please add an event'],
    },
    seats: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seat',
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'expired', 'cancelled'],
      default: 'pending',
    },
    amountPaise: {
      type: Number,
      required: [true, 'Please add the amount in paise'],
      min: [0, 'Amount cannot be negative'],
    },
    expiresAt: {
      type: Date, // when a pending booking's seat hold runs out
    },
    idempotencyKey: {
      type: String, // sent by the client so a retried request doesn't create a second booking
    },
  },
  {
    timestamps: true,
  },
);

// Fast "my bookings, newest first" queries
bookingSchema.index({ user: 1, createdAt: -1 });

// The same user can't reuse an idempotency key. The partial filter means the rule only
// applies to bookings that HAVE a key, so many bookings without one are still allowed.
bookingSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } },
);

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
