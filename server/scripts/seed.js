// server/scripts/seed.js
// Fills the database with sample data for development.
// Run with: npm run seed   (WARNING: deletes existing data first!)

import 'dotenv/config'; // loads variables from .env into process.env
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import connectDB from '../src/config/db.js';
import User from '../src/models/User.js';
import Event from '../src/models/Event.js';
import Seat from '../src/models/Seat.js';

const PASSWORD = 'Password123!';
const SALT_ROUNDS = 10; // bcrypt "cost": higher = slower to hash = harder to brute-force
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SEATS_PER_ROW = 10;

// Returns a Date `days` from now at 7:00 PM, so every event is in the future
const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(19, 0, 0, 0);
  return date;
};

const seed = async () => {
  await connectDB();

  // 1. Wipe old data so the script can be run again and again
  await Promise.all([
    User.deleteMany({}),
    Event.deleteMany({}),
    Seat.deleteMany({}),
    // No Booking model yet, so we clear the raw collection directly
    mongoose.connection.collection('bookings').deleteMany({}),
  ]);

  // 2. Hash the password once and reuse it (every seeded user shares the same password)
  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  // 3. Create users: 3 organisers + 5 normal users
  const organisers = await User.insertMany([
    { name: 'Asha Organiser', email: 'asha@example.com', passwordHash, role: 'organiser' },
    { name: 'Ravi Organiser', email: 'ravi@example.com', passwordHash, role: 'organiser' },
    { name: 'Meera Organiser', email: 'meera@example.com', passwordHash, role: 'organiser' },
  ]);

  const users = await User.insertMany(
    ['Arjun', 'Priya', 'Kabir', 'Sneha', 'Rohan'].map((name) => ({
      name,
      email: `${name.toLowerCase()}@example.com`,
      passwordHash,
      role: 'user',
    })),
  );

  // 4. Create 10 events, each in a different city
  const eventData = [
    { title: 'Indie Rock Night', venue: 'Phoenix Arena', city: 'Mumbai' },
    { title: 'Stand-up Comedy Special', venue: 'Siri Fort Auditorium', city: 'Delhi' },
    { title: 'Tech Conference 2027', venue: 'BIEC Hall 1', city: 'Bengaluru' },
    { title: 'Carnatic Classical Evening', venue: 'Music Academy', city: 'Chennai' },
    { title: 'Jazz Under the Stars', venue: 'Science City Grounds', city: 'Kolkata' },
    { title: 'Bollywood Dance Fest', venue: 'HITEX Exhibition Centre', city: 'Hyderabad' },
    { title: 'EDM Sunset Party', venue: 'Vagator Beach Stage', city: 'Goa' },
    { title: 'Theatre: The Glass Menagerie', venue: 'Prithvi Hall', city: 'Pune' },
    { title: 'Sufi Music Night', venue: 'Jawahar Kala Kendra', city: 'Jaipur' },
    { title: 'Food & Music Carnival', venue: 'Riverfront Park', city: 'Ahmedabad' },
  ];

  const events = await Event.insertMany(
    eventData.map((event, i) => ({
      ...event,
      organiser: organisers[i % organisers.length]._id, // spread events across organisers
      startTime: daysFromNow(7 * (i + 1)), // one event per week, starting next week
      rows: ROWS.length,
      seatsPerRow: SEATS_PER_ROW,
      pricePaise: (500 + i * 100) * 100, // ₹500, ₹600, ... stored in paise (₹1 = 100 paise)
    })),
  );

  // 5. Build the seat map for every event: rows A–J × seats 1–10 → "A1" ... "J10"
  const seats = [];
  for (const event of events) {
    for (const row of ROWS) {
      for (let number = 1; number <= SEATS_PER_ROW; number++) {
        seats.push({ event: event._id, label: `${row}${number}`, row, number });
      }
    }
  }
  const createdSeats = await Seat.insertMany(seats); // one bulk insert is much faster than 1000 saves

  // 6. Summary
  console.log(`Organisers created: ${organisers.length}`);
  console.log(`Users created:      ${users.length}`);
  console.log(`Events created:     ${events.length}`);
  console.log(`Seats created:      ${createdSeats.length}`);
  console.log(`All accounts use password: ${PASSWORD}`);
};

seed()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect()); // always close the connection so Node can exit
