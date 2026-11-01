// server/src/models/Event.js
import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    organiser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Please add an organiser'],
    },
    title: {
      type: String,
      required: [true, 'Please add a title'],
      trim: true,
    },
    venue: {
      type: String,
      required: [true, 'Please add a venue'],
    },
    city: {
      type: String,
      required: [true, 'Please add a city'],
    },
    startTime: {
      type: Date,
      required: [true, 'Please add a start time'],
    },
    status: {
      type: String,
      enum: ['scheduled', 'cancelled'],
      default: 'scheduled',
    },
    rows: {
      type: Number,
      required: [true, 'Please add the number of rows'],
      min: [1, 'Rows must be at least 1'],
    },
    seatsPerRow: {
      type: Number,
      required: [true, 'Please add the number of seats per row'],
      min: [1, 'Seats per row must be at least 1'],
    },
    pricePaise: {
      type: Number,
      required: [true, 'Please add the price in paise'],
      min: [0, 'Price cannot be negative'],
    },
  },
  {
    timestamps: true,
  },
);

const Event = mongoose.model('Event', eventSchema);

export default Event;
