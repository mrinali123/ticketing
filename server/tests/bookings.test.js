import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setTimeout as sleep } from 'node:timers/promises';
import mongoose from 'mongoose';
import Booking from '../src/models/Booking.js';
import Event from '../src/models/Event.js';
import Seat from '../src/models/Seat.js';
import { expireHolds } from '../src/jobs/expireHolds.js';
import { api, createUserWithToken, createEventWithSeats, daysFromNow } from './helpers.js';

let organiser, alice, bob, event;

// Undo any vi.spyOn() so one test's fake can't leak into the next
afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  organiser = await createUserWithToken({ role: 'organiser' });
  alice = await createUserWithToken();
  bob = await createUserWithToken();
  event = await createEventWithSeats(organiser.user, {
    rows: 2,
    seatsPerRow: 5,
    pricePaise: 50000,
  });
});

// Sends POST /api/bookings/hold as `who`, optionally with an Idempotency-Key header
function hold(who, seatLabels, { eventId = event._id, key } = {}) {
  const req = api().post('/api/bookings/hold').set('Authorization', who.auth);
  if (key) req.set('Idempotency-Key', key);
  return req.send({ eventId, seatLabels });
}

// Statuses of the given seats, e.g. { A1: 'held', A2: 'available' }
async function seatStatuses(labels) {
  const seats = await Seat.find({ event: event._id, label: { $in: labels } });
  return Object.fromEntries(seats.map((s) => [s.label, s.status]));
}

// Pretends a hold ran out by moving its expiry times into the past
async function expireBooking(bookingId) {
  const past = new Date(Date.now() - 1000);
  await Booking.updateOne({ _id: bookingId }, { expiresAt: past });
  await Seat.updateMany({ booking: bookingId }, { holdExpiresAt: past });
}

describe('POST /api/bookings/hold', () => {
  it('holds the seats and creates a pending booking (201)', async () => {
    const res = await hold(alice, ['A1', 'A2']);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'pending',
      amountPaise: 100000, // 2 × 50000
      user: alice.user._id.toString(),
    });
    expect(res.body.seats).toHaveLength(2);
    // Default hold is 300 seconds
    const holdMs = new Date(res.body.expiresAt) - Date.now();
    expect(holdMs).toBeGreaterThan(290_000);
    expect(holdMs).toBeLessThanOrEqual(300_000);

    expect(await seatStatuses(['A1', 'A2', 'A3'])).toEqual({
      A1: 'held',
      A2: 'held',
      A3: 'available',
    });
  });

  it('requires a token (401)', async () => {
    const res = await api()
      .post('/api/bookings/hold')
      .send({ eventId: event._id, seatLabels: ['A1'] });

    expect(res.status).toBe(401);
  });

  it.each([
    ['no seats', []],
    ['more than 6 seats', ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2']],
    ['duplicate seats', ['A1', 'A1']],
    ['not a list', 'A1'],
  ])('rejects %s (400)', async (_name, seatLabels) => {
    const res = await hold(alice, seatLabels);

    expect(res.status).toBe(400);
    expect(await Booking.countDocuments()).toBe(0);
  });

  it('rejects a missing eventId (400)', async () => {
    const res = await api()
      .post('/api/bookings/hold')
      .set('Authorization', alice.auth)
      .send({ seatLabels: ['A1'] });

    expect(res.status).toBe(400);
  });

  it('rejects seat labels that do not exist (400)', async () => {
    const res = await hold(alice, ['A1', 'Z99']);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Z99');
  });

  it('handles an invalid (400) and unknown (404) event id', async () => {
    expect((await hold(alice, ['A1'], { eventId: 'abc' })).status).toBe(400);
    expect((await hold(alice, ['A1'], { eventId: '000000000000000000000000' })).status).toBe(404);
  });

  it('rejects cancelled and past events (400)', async () => {
    await Event.updateOne({ _id: event._id }, { status: 'cancelled' });
    expect((await hold(alice, ['A1'])).status).toBe(400);

    await Event.updateOne({ _id: event._id }, { status: 'scheduled', startTime: daysFromNow(-1) });
    expect((await hold(alice, ['A1'])).status).toBe(400);
  });

  it('is all-or-nothing: if one seat is taken, none are held (409)', async () => {
    await hold(alice, ['A2']);

    const res = await hold(bob, ['A1', 'A2', 'A3']);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Seat A2 is no longer available');
    expect(await seatStatuses(['A1', 'A3'])).toEqual({ A1: 'available', A3: 'available' });
    expect(await Booking.countDocuments({ user: bob.user._id })).toBe(0);
  });

  it('fast path: a clearly taken seat gets 409 without starting a transaction', async () => {
    await hold(alice, ['A2']);
    const startSession = vi.spyOn(mongoose, 'startSession');

    const res = await hold(bob, ['A1', 'A2']);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Seat A2 is no longer available');
    expect(startSession).not.toHaveBeenCalled();
  });

  it('still rolls back if the seat is taken AFTER the quick read (stale read)', async () => {
    await hold(alice, ['A2']);

    // Make the quick pre-check read lie: it reports every seat as free, like a read that
    // happened just before Alice's hold. Only the atomic update can catch this now.
    vi.spyOn(Seat, 'find').mockReturnValueOnce({
      select: () => ({
        lean: async () =>
          ['A1', 'A2', 'A3'].map((label) => ({ label, status: 'available', holdExpiresAt: null })),
      }),
    });
    const startSession = vi.spyOn(mongoose, 'startSession');

    const res = await hold(bob, ['A1', 'A2', 'A3']);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Seat A2 is no longer available');
    // Proves the 409 came from inside the transaction, not from the fast path
    expect(startSession).toHaveBeenCalled();
    // A1 WAS claimed inside the transaction before A2 failed; the rollback undid it
    expect(await seatStatuses(['A1', 'A3'])).toEqual({ A1: 'available', A3: 'available' });
    expect(await Booking.countDocuments({ user: bob.user._id })).toBe(0);
  });

  it('lets someone take a seat whose hold has expired', async () => {
    const first = await hold(alice, ['A1']);
    await expireBooking(first.body._id);

    const res = await hold(bob, ['A1']);

    expect(res.status).toBe(201);
    expect((await Seat.findOne({ event: event._id, label: 'A1' })).booking.toString()).toBe(
      res.body._id,
    );
  });

  it('never sells the same seat twice when 20 users try at the same moment', async () => {
    const users = await Promise.all(Array.from({ length: 20 }, () => createUserWithToken()));

    // 20 requests for the same seat, all fired at once
    const results = await Promise.all(users.map((u) => hold(u, ['B3'])));

    const winners = results.filter((r) => r.status === 201);
    const losers = results.filter((r) => r.status === 409);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(19);
    losers.forEach((r) => expect(r.body.message).toBe('Seat B3 is no longer available'));

    // The seat points at the winner's booking, and no other booking was left behind
    const seat = await Seat.findOne({ event: event._id, label: 'B3' });
    expect(seat.status).toBe('held');
    expect(seat.booking.toString()).toBe(winners[0].body._id);
    expect(await Booking.countDocuments()).toBe(1);
  });

  describe('Idempotency-Key', () => {
    it('returns the original booking when the same key is sent again (200)', async () => {
      const first = await hold(alice, ['A1'], { key: 'key-123' });
      const retry = await hold(alice, ['A1'], { key: 'key-123' });

      expect(first.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(retry.body._id).toBe(first.body._id);
      expect(await Booking.countDocuments()).toBe(1);
    });

    it('creates only one booking when the same key is sent twice at the same time', async () => {
      const results = await Promise.all([
        hold(alice, ['A1'], { key: 'same-time' }),
        hold(alice, ['A1'], { key: 'same-time' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
      expect(results[0].body._id).toBe(results[1].body._id);
      expect(await Booking.countDocuments()).toBe(1);
    });

    it('treats the same key from a different user as a new request', async () => {
      await hold(alice, ['A1'], { key: 'shared-key' });
      const res = await hold(bob, ['A2'], { key: 'shared-key' });

      expect(res.status).toBe(201);
      expect(await Booking.countDocuments()).toBe(2);
    });
  });
});

describe('real hold expiry (HOLD_DURATION_SECONDS=1)', () => {
  // A 1-second hold lets us test expiry with a real clock instead of editing dates
  beforeEach(() => {
    process.env.HOLD_DURATION_SECONDS = '1';
  });
  afterEach(() => {
    delete process.env.HOLD_DURATION_SECONDS; // back to the 300s default for other tests
  });

  it('frees the seat for another user, and confirming the old hold gives 409', async () => {
    const { body: aliceBooking } = await hold(alice, ['A1']);

    // While the hold is active, Bob can't have the seat
    expect((await hold(bob, ['A1'])).status).toBe(409);

    await sleep(1200); // let the 1-second hold run out

    const bobRes = await hold(bob, ['A1']);
    expect(bobRes.status).toBe(201);

    const confirm = await api()
      .post(`/api/bookings/${aliceBooking._id}/confirm`)
      .set('Authorization', alice.auth);
    expect(confirm.status).toBe(409);
    expect(confirm.body.message).toBe('Hold expired');
    expect((await Booking.findById(aliceBooking._id)).status).toBe('expired');

    // Alice's failed confirm must not have released the seat Bob now holds
    const seat = await Seat.findOne({ event: event._id, label: 'A1' });
    expect(seat.status).toBe('held');
    expect(seat.booking.toString()).toBe(bobRes.body._id);
  });

  it('lets the cleanup job expire the booking and free the seat', async () => {
    const { body: booking } = await hold(alice, ['A1', 'A2']);
    await sleep(1200);

    expect(await expireHolds()).toEqual({ bookingsExpired: 1, seatsReleased: 2 });
    expect((await Booking.findById(booking._id)).status).toBe('expired');
    expect(await seatStatuses(['A1', 'A2'])).toEqual({ A1: 'available', A2: 'available' });
  });
});

describe('POST /api/bookings/:id/confirm', () => {
  it('books the seats and confirms the booking (200)', async () => {
    const { body: booking } = await hold(alice, ['A1', 'A2']);

    const res = await api()
      .post(`/api/bookings/${booking._id}/confirm`)
      .set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
    expect(await seatStatuses(['A1', 'A2'])).toEqual({ A1: 'booked', A2: 'booked' });
    const seat = await Seat.findOne({ event: event._id, label: 'A1' });
    expect(seat.holdExpiresAt).toBeNull();
  });

  it("forbids confirming someone else's booking (403)", async () => {
    const { body: booking } = await hold(alice, ['A1']);

    const res = await api()
      .post(`/api/bookings/${booking._id}/confirm`)
      .set('Authorization', bob.auth);

    expect(res.status).toBe(403);
  });

  it('rejects confirming twice (400)', async () => {
    const { body: booking } = await hold(alice, ['A1']);
    const confirm = () =>
      api().post(`/api/bookings/${booking._id}/confirm`).set('Authorization', alice.auth);

    expect((await confirm()).status).toBe(200);
    expect((await confirm()).status).toBe(400);
  });

  it('expires the booking and frees the seats if the hold ran out (409)', async () => {
    const { body: booking } = await hold(alice, ['A1']);
    await expireBooking(booking._id);

    const res = await api()
      .post(`/api/bookings/${booking._id}/confirm`)
      .set('Authorization', alice.auth);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Hold expired');
    expect((await Booking.findById(booking._id)).status).toBe('expired');
    expect(await seatStatuses(['A1'])).toEqual({ A1: 'available' });
  });

  it('fails with "Hold lost" if a seat was taken by someone else (409)', async () => {
    const { body: booking } = await hold(alice, ['A1', 'A2']);
    // Simulate A2 being grabbed by another booking (e.g. after a hold expiry race)
    await Seat.updateOne({ event: event._id, label: 'A2' }, { booking: bob.user._id });

    const res = await api()
      .post(`/api/bookings/${booking._id}/confirm`)
      .set('Authorization', alice.auth);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Hold lost');
    // Rolled back: A1 was not left half-booked
    expect(await seatStatuses(['A1'])).toEqual({ A1: 'held' });
    expect((await Booking.findById(booking._id)).status).toBe('pending');
  });
});

describe('POST /api/bookings/:id/cancel', () => {
  it.each(['pending', 'confirmed'])(
    'cancels a %s booking and frees its seats (200)',
    async (state) => {
      const { body: booking } = await hold(alice, ['A1', 'A2']);
      if (state === 'confirmed') {
        await api().post(`/api/bookings/${booking._id}/confirm`).set('Authorization', alice.auth);
      }

      const res = await api()
        .post(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', alice.auth);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
      const seat = await Seat.findOne({ event: event._id, label: 'A1' });
      expect(seat).toMatchObject({ status: 'available', booking: null, holdExpiresAt: null });
    },
  );

  it("forbids cancelling someone else's booking (403)", async () => {
    const { body: booking } = await hold(alice, ['A1']);

    const res = await api()
      .post(`/api/bookings/${booking._id}/cancel`)
      .set('Authorization', bob.auth);

    expect(res.status).toBe(403);
  });

  it('rejects cancelling twice (400)', async () => {
    const { body: booking } = await hold(alice, ['A1']);
    const cancel = () =>
      api().post(`/api/bookings/${booking._id}/cancel`).set('Authorization', alice.auth);

    expect((await cancel()).status).toBe(200);
    expect((await cancel()).status).toBe(400);
  });

  it('rejects cancelling after the event has started (400)', async () => {
    const { body: booking } = await hold(alice, ['A1']);
    await Event.updateOne({ _id: event._id }, { startTime: daysFromNow(-1) });

    const res = await api()
      .post(`/api/bookings/${booking._id}/cancel`)
      .set('Authorization', alice.auth);

    expect(res.status).toBe(400);
  });

  it("does not free a seat that now belongs to someone else's booking", async () => {
    const { body: old } = await hold(alice, ['A1']);
    await expireBooking(old._id);
    const { body: newer } = await hold(bob, ['A1']); // Bob takes the expired seat

    await api().post(`/api/bookings/${old._id}/cancel`).set('Authorization', alice.auth);

    const seat = await Seat.findOne({ event: event._id, label: 'A1' });
    expect(seat.status).toBe('held');
    expect(seat.booking.toString()).toBe(newer._id);
  });
});

describe('GET /api/bookings/me and /api/bookings/:id', () => {
  it("lists only the user's bookings, newest first, with event and seat details", async () => {
    const older = await hold(alice, ['A1']);
    const newer = await hold(alice, ['B1', 'B2']);
    await hold(bob, ['A5']);

    const res = await api().get('/api/bookings/me').set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.map((b) => b._id)).toEqual([newer.body._id, older.body._id]);
    expect(res.body[0].event).toMatchObject({ title: 'Test Concert', city: 'Chennai' });
    expect(res.body[0].event).not.toHaveProperty('pricePaise'); // only the selected fields
    expect(res.body[0].seats.map((s) => s.label).sort()).toEqual(['B1', 'B2']);
  });

  it('returns one booking to its owner, populated (200)', async () => {
    const { body: booking } = await hold(alice, ['A1']);

    const res = await api().get(`/api/bookings/${booking._id}`).set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.event.title).toBe('Test Concert');
    expect(res.body.seats[0].label).toBe('A1');
  });

  it('handles non-owner (403), invalid id (400) and unknown id (404)', async () => {
    const { body: booking } = await hold(alice, ['A1']);
    const get = (id, who) => api().get(`/api/bookings/${id}`).set('Authorization', who.auth);

    expect((await get(booking._id, bob)).status).toBe(403);
    expect((await get('abc', alice)).status).toBe(400);
    expect((await get('000000000000000000000000', alice)).status).toBe(404);
  });
});

describe('expired holds', () => {
  it('show as "available" in the event details before the cleanup job runs', async () => {
    const { body: booking } = await hold(alice, ['A1', 'A2']);
    await expireBooking(booking._id);

    const res = await api().get(`/api/events/${event._id}`);
    const byLabel = Object.fromEntries(res.body.seats.map((s) => [s.label, s]));

    expect(byLabel.A1.status).toBe('available');
    expect(byLabel.A1).not.toHaveProperty('holdExpiresAt');
  });

  it('are tidied up by the expireHolds job, leaving active holds alone', async () => {
    const { body: expired } = await hold(alice, ['A1']);
    const { body: active } = await hold(bob, ['A2']);
    await expireBooking(expired._id);

    const result = await expireHolds();

    expect(result).toEqual({ bookingsExpired: 1, seatsReleased: 1 });
    expect((await Booking.findById(expired._id)).status).toBe('expired');
    expect((await Booking.findById(active._id)).status).toBe('pending');
    expect(await seatStatuses(['A1', 'A2'])).toEqual({ A1: 'available', A2: 'held' });
  });
});
