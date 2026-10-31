// server/src/models/Seat.js
import mongoose from 'mongoose';

const seatSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Please add an event reference'],
    },
    label: {
      type: String,
      required: [true, 'Please add a seat label'],
      trim: true,
    },
    row: {
      type: String,
    },
    number: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['available', 'held', 'booked'],
      default: 'available',
    },
    holdExpiresAt: {
      type: Date,
      default: null,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: prevents duplicate seats (e.g., two "A5" seats for the same event)
seatSchema.index({ event: 1, label: 1 }, { unique: true });

const Seat = mongoose.model('Seat', seatSchema);

export default Seat;