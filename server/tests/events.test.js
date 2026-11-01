import { describe, it, expect, beforeEach } from 'vitest';
import Event from '../src/models/Event.js';
import Seat from '../src/models/Seat.js';
import Booking from '../src/models/Booking.js';
import User from '../src/models/User.js';
import {
  api,
  createUserWithToken,
  createEventWithSeats,
  eventBody,
  insertEvent,
  daysFromNow,
} from './helpers.js';

// Logged-in users shared by most tests (recreated before each test, since the DB is wiped)
let organiser, otherOrganiser, normalUser;

beforeEach(async () => {
  organiser = await createUserWithToken({ role: 'organiser' });
  otherOrganiser = await createUserWithToken({ role: 'organiser' });
  normalUser = await createUserWithToken({ role: 'user' });
});

// Creates an event through the API as `organiser`, so it has real seats
async function createEventViaApi(overrides) {
  const res = await api()
    .post('/api/events')
    .set('Authorization', organiser.auth)
    .send(eventBody(overrides));
  expect(res.status).toBe(201);
  return res.body;
}

describe('POST /api/events', () => {
  it('lets an organiser create an event and generates rows × seatsPerRow seats (201)', async () => {
    const res = await api()
      .post('/api/events')
      .set('Authorization', organiser.auth)
      .send(eventBody({ rows: 5, seatsPerRow: 8 }));

    expect(res.status).toBe(201);
    expect(res.body.organiser).toBe(organiser.user._id.toString());
    expect(await Seat.countDocuments({ event: res.body._id })).toBe(40);

    // Spot-check the labels: first and last seat
    const labels = (await Seat.find({ event: res.body._id })).map((s) => s.label);
    expect(labels).toContain('A1');
    expect(labels).toContain('E8');
  });

  it('ignores fields that are not allowed, e.g. organiser or status', async () => {
    const res = await api()
      .post('/api/events')
      .set('Authorization', organiser.auth)
      .send(eventBody({ organiser: otherOrganiser.user._id, status: 'cancelled' }));

    expect(res.status).toBe(201);
    expect(res.body.organiser).toBe(organiser.user._id.toString());
    expect(res.body.status).toBe('scheduled');
  });

  it.each([
    ['more than 26 rows', { rows: 27 }],
    ['more than 50 seats per row', { seatsPerRow: 51 }],
  ])('rejects %s (400) and creates no seats', async (_name, overrides) => {
    const res = await api()
      .post('/api/events')
      .set('Authorization', organiser.auth)
      .send(eventBody(overrides));

    expect(res.status).toBe(400);
    expect(await Event.countDocuments()).toBe(0);
    expect(await Seat.countDocuments()).toBe(0);
  });

  it('allows a free event (pricePaise 0)', async () => {
    const res = await api()
      .post('/api/events')
      .set('Authorization', organiser.auth)
      .send(eventBody({ pricePaise: 0 }));

    expect(res.status).toBe(201);
  });

  it('forbids a normal user (403)', async () => {
    const res = await api()
      .post('/api/events')
      .set('Authorization', normalUser.auth)
      .send(eventBody());

    expect(res.status).toBe(403);
    expect(await Event.countDocuments()).toBe(0);
  });

  it('requires a token (401)', async () => {
    const res = await api().post('/api/events').send(eventBody());

    expect(res.status).toBe(401);
  });

  it.each(['title', 'venue', 'city', 'startTime', 'rows', 'seatsPerRow', 'pricePaise'])(
    'rejects a missing %s (400)',
    async (field) => {
      const body = eventBody();
      delete body[field];

      const res = await api().post('/api/events').set('Authorization', organiser.auth).send(body);

      expect(res.status).toBe(400);
      expect(await Event.countDocuments()).toBe(0);
    },
  );
});

describe('GET /api/events/cities', () => {
  it('lists each city with an upcoming scheduled event once, A to Z', async () => {
    await insertEvent(organiser.user, { city: 'Pune' });
    await insertEvent(organiser.user, { city: 'Chennai' });
    await insertEvent(organiser.user, { city: 'Chennai' });
    await insertEvent(organiser.user, { city: 'Goa', status: 'cancelled' });
    await insertEvent(organiser.user, { city: 'Delhi', startTime: daysFromNow(-1).toISOString() });

    const res = await api().get('/api/events/cities');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(['Chennai', 'Pune']);
  });
});

describe('GET /api/events', () => {
  it('lists only scheduled, future events, soonest first (200)', async () => {
    await insertEvent(organiser.user, { title: 'Later', startTime: daysFromNow(20).toISOString() });
    await insertEvent(organiser.user, {
      title: 'Sooner',
      startTime: daysFromNow(10).toISOString(),
    });
    await insertEvent(organiser.user, { title: 'Past', startTime: daysFromNow(-1).toISOString() });
    await insertEvent(organiser.user, { title: 'Cancelled', status: 'cancelled' });

    const res = await api().get('/api/events');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data.map((e) => e.title)).toEqual(['Sooner', 'Later']);
  });

  it('paginates with page and limit', async () => {
    for (let i = 1; i <= 3; i++) {
      await insertEvent(organiser.user, {
        title: `E${i}`,
        startTime: daysFromNow(i).toISOString(),
      });
    }

    const res = await api().get('/api/events?page=2&limit=2');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect(res.body.data.map((e) => e.title)).toEqual(['E3']);
  });

  it('filters by city', async () => {
    await insertEvent(organiser.user, { city: 'Chennai' });
    await insertEvent(organiser.user, { city: 'Mumbai' });

    const res = await api().get('/api/events?city=Chennai');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].city).toBe('Chennai');
  });

  it('caps limit at 50 and falls back to safe defaults for bad values', async () => {
    const capped = await api().get('/api/events?limit=1000');
    expect(capped.body.limit).toBe(50);

    const bad = await api().get('/api/events?page=-3&limit=abc');
    expect(bad.status).toBe(200);
    expect(bad.body).toMatchObject({ page: 1, limit: 10 });
  });
});

describe('organiser shown on events (name and organisation, never the email)', () => {
  beforeEach(async () => {
    await User.updateOne({ _id: organiser.user._id }, { organisationName: 'Asha Live' });
  });

  it('is included in the events list', async () => {
    await insertEvent(organiser.user);

    const res = await api().get('/api/events');

    expect(res.body.data[0].organiser).toEqual({
      _id: organiser.user._id.toString(),
      name: organiser.user.name,
      organisationName: 'Asha Live',
    });
  });

  it('is included on a single event', async () => {
    const event = await insertEvent(organiser.user);

    const res = await api().get(`/api/events/${event._id}`);

    expect(res.body.event.organiser).toMatchObject({ organisationName: 'Asha Live' });
    expect(res.body.event.organiser).not.toHaveProperty('email');
  });
});

describe('GET /api/events/:id', () => {
  it('returns the event with its seats in seat-map order (200)', async () => {
    const event = await createEventViaApi({ rows: 2, seatsPerRow: 10 });

    const res = await api().get(`/api/events/${event._id}`);

    expect(res.status).toBe(200);
    expect(res.body.event._id).toBe(event._id);
    expect(res.body.seats).toHaveLength(20);
    // Numeric sort: A2 comes before A10
    expect(res.body.seats.slice(0, 3).map((s) => s.label)).toEqual(['A1', 'A2', 'A3']);
    expect(res.body.seats[9].label).toBe('A10');
    expect(res.body.seats[10].label).toBe('B1');
  });

  it('rejects an invalid id (400)', async () => {
    const res = await api().get('/api/events/abc');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid event id');
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await api().get('/api/events/000000000000000000000000');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/events/:id', () => {
  it('lets the owner update allowed fields and ignores rows/seatsPerRow (200)', async () => {
    const event = await createEventViaApi();

    const res = await api()
      .patch(`/api/events/${event._id}`)
      .set('Authorization', organiser.auth)
      .send({ title: 'Updated', pricePaise: 59900, rows: 99 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Updated', pricePaise: 59900, rows: 5 });
    expect((await Event.findById(event._id)).title).toBe('Updated');
  });

  it("forbids an organiser who doesn't own the event (403)", async () => {
    const event = await createEventViaApi();

    const res = await api()
      .patch(`/api/events/${event._id}`)
      .set('Authorization', otherOrganiser.auth)
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You don't own this event");
    expect((await Event.findById(event._id)).title).toBe('Test Concert');
  });

  it('rejects a body with no allowed fields (400)', async () => {
    const event = await createEventViaApi();

    const res = await api()
      .patch(`/api/events/${event._id}`)
      .set('Authorization', organiser.auth)
      .send({ rows: 10 });

    expect(res.status).toBe(400);
  });

  it('rejects values that break schema rules, e.g. negative price (400)', async () => {
    const event = await createEventViaApi();

    const res = await api()
      .patch(`/api/events/${event._id}`)
      .set('Authorization', organiser.auth)
      .send({ pricePaise: -1 });

    expect(res.status).toBe(400);
  });

  it('handles invalid (400) and unknown (404) ids', async () => {
    const invalid = await api()
      .patch('/api/events/abc')
      .set('Authorization', organiser.auth)
      .send({ title: 'x' });
    const unknown = await api()
      .patch('/api/events/000000000000000000000000')
      .set('Authorization', organiser.auth)
      .send({ title: 'x' });

    expect(invalid.status).toBe(400);
    expect(unknown.status).toBe(404);
  });
});

describe('POST /api/events/:id/cancel', () => {
  it('cancels the event and its active bookings, then refuses a second cancel', async () => {
    const event = await createEventViaApi();
    const base = { user: normalUser.user._id, event: event._id, amountPaise: 49900 };
    await Booking.create([
      { ...base, status: 'pending' },
      { ...base, status: 'confirmed' },
      { ...base, status: 'expired' }, // already finished: must stay "expired"
    ]);

    const first = await api()
      .post(`/api/events/${event._id}/cancel`)
      .set('Authorization', organiser.auth);

    expect(first.status).toBe(200);
    expect(first.body.event.status).toBe('cancelled');
    expect(first.body.bookingsCancelled).toBe(2);
    const statuses = (await Booking.find({ event: event._id })).map((b) => b.status).sort();
    expect(statuses).toEqual(['cancelled', 'cancelled', 'expired']);

    const second = await api()
      .post(`/api/events/${event._id}/cancel`)
      .set('Authorization', organiser.auth);

    expect(second.status).toBe(400);
  });

  it("forbids an organiser who doesn't own the event (403)", async () => {
    const event = await createEventViaApi();

    const res = await api()
      .post(`/api/events/${event._id}/cancel`)
      .set('Authorization', otherOrganiser.auth);

    expect(res.status).toBe(403);
    expect((await Event.findById(event._id)).status).toBe('scheduled');
  });
});

describe('GET /api/events/mine', () => {
  const getMine = (who) => api().get('/api/events/mine').set('Authorization', who.auth);

  it("returns only the organiser's own events, any status, newest first", async () => {
    const first = await insertEvent(organiser.user, { title: 'First' });
    const cancelled = await insertEvent(organiser.user, {
      title: 'Cancelled',
      status: 'cancelled',
    });
    const past = await insertEvent(organiser.user, {
      title: 'Past',
      startTime: daysFromNow(-5).toISOString(),
    });
    await insertEvent(otherOrganiser.user, { title: 'Not mine' });

    const res = await getMine(organiser);

    expect(res.status).toBe(200);
    // Inserted one after another, so newest first = reverse order
    expect(res.body.map((e) => e._id)).toEqual([
      past._id.toString(),
      cancelled._id.toString(),
      first._id.toString(),
    ]);
  });

  it('includes seat counts by status, counting expired holds as available', async () => {
    const event = await createEventWithSeats(organiser.user, { rows: 2, seatsPerRow: 5 });
    const future = daysFromNow(1);
    const past = daysFromNow(-1);
    await Seat.updateOne({ event: event._id, label: 'A1' }, { status: 'booked' });
    await Seat.updateOne({ event: event._id, label: 'A2' }, { status: 'booked' });
    await Seat.updateOne(
      { event: event._id, label: 'A3' },
      { status: 'held', holdExpiresAt: future },
    );
    await Seat.updateOne(
      { event: event._id, label: 'A4' },
      { status: 'held', holdExpiresAt: past },
    );

    const res = await getMine(organiser);

    expect(res.status).toBe(200);
    expect(res.body[0].seatCounts).toEqual({ available: 7, held: 1, booked: 2 });
  });

  it('gives zero counts for an event without seats', async () => {
    await insertEvent(organiser.user);

    const res = await getMine(organiser);

    expect(res.body[0].seatCounts).toEqual({ available: 0, held: 0, booked: 0 });
  });

  it('returns an empty list for an organiser with no events', async () => {
    const res = await getMine(otherOrganiser);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('forbids normal users (403) and requires a token (401)', async () => {
    expect((await getMine(normalUser)).status).toBe(403);
    expect((await api().get('/api/events/mine')).status).toBe(401);
  });
});
