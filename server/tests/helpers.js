// Shared helpers so tests don't repeat the same setup code.
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Event from '../src/models/Event.js';
import { createEvent } from '../src/services/event.service.js';

export const PASSWORD = 'Password123!';

// supertest client for the Express app (no real server/port needed)
export const api = () => request(app);

let counter = 0;

// Creates a user directly in the DB. Low bcrypt cost keeps tests fast.
export async function createUser({ role = 'user', email, name = 'Test User' } = {}) {
  counter += 1;
  return User.create({
    name,
    email: email ?? `user${counter}@test.com`,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role,
  });
}

// Signs a token the same way the login service does
export function tokenFor(user, options = { expiresIn: '1h' }) {
  return jwt.sign({ sub: user._id, role: user.role }, process.env.JWT_SECRET, options);
}

// Creates a user and returns both the user and a ready-to-use "Bearer ..." header
export async function createUserWithToken(opts) {
  const user = await createUser(opts);
  return { user, auth: `Bearer ${tokenFor(user)}` };
}

// A date `days` from now (negative = in the past)
export const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

// A valid request body for POST /api/events
export const eventBody = (overrides = {}) => ({
  title: 'Test Concert',
  venue: 'VIT Auditorium',
  city: 'Chennai',
  startTime: daysFromNow(30).toISOString(),
  rows: 5,
  seatsPerRow: 8,
  pricePaise: 49900,
  ...overrides,
});

// Inserts an event straight into the DB (no seats), e.g. past or cancelled events for list tests
export function insertEvent(organiser, overrides = {}) {
  const { startTime, ...rest } = eventBody(overrides);
  return Event.create({ ...rest, startTime: new Date(startTime), organiser: organiser._id });
}

// Creates an event WITH its seat map, using the real service (faster than going through HTTP)
export async function createEventWithSeats(organiser, overrides = {}) {
  const { startTime, ...rest } = eventBody(overrides);
  return createEvent(organiser._id, { ...rest, startTime: new Date(startTime) });
}
