// server/loadtest/run.js
// Load test against the REAL running server and database. Run with: npm run loadtest
// The dev server must already be running. Everything this script creates is deleted at the end.

import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import Event from '../src/models/Event.js';
import Seat from '../src/models/Seat.js';
import Booking from '../src/models/Booking.js';
import { createEvent } from '../src/services/event.service.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const BASE_URL = 'http://localhost:5000';
const USER_COUNT = 500;
const EVENT_TITLE = 'LOADTEST Event';
const EMAIL_PATTERN = /^loadtest\+\d+@example\.com$/;
const RESULTS_FILE = fileURLToPath(new URL('../../docs/load-test-results.md', import.meta.url));
// The script only rewrites the part of the results file between these two markers
const MARKER_START = '<!-- latest-run:start -->';
const MARKER_END = '<!-- latest-run:end -->';

// ---------- helpers ----------

// Value below which p% of the latencies fall (nearest-rank method)
const percentile = (sorted, p) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];

// Sends one hold request and records how long it took. Network errors count as status 0.
async function timedHold(token, eventId, seatLabels) {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}/api/bookings/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId, seatLabels }),
    });
    const body = await res.json();
    return { status: res.status, body, ms: performance.now() - start };
  } catch (err) {
    return {
      status: 0,
      body: { message: err.cause?.message ?? err.message },
      ms: performance.now() - start,
    };
  }
}

// Turns a list of responses into counts + latency numbers
function summarise(results, durationMs) {
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
  const otherResults = results.filter((r) => r.status !== 201 && r.status !== 409);
  return {
    total: results.length,
    created: results.filter((r) => r.status === 201).length,
    conflicts: results.filter((r) => r.status === 409).length,
    other: otherResults.length,
    // Group unexpected responses so they can be printed, e.g. { "500 Something went wrong": 3 }
    otherDetails: otherResults.reduce((acc, r) => {
      const key = `${r.status} ${r.body?.message ?? ''}`.trim();
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    durationMs,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
}

// Fires every request at the same moment: all fetches start before any is awaited
async function fireAll(requests) {
  const start = performance.now();
  const results = await Promise.all(requests.map((send) => send()));
  return { results, durationMs: performance.now() - start };
}

// Removes everything a load test run creates (also clears leftovers from a crashed run)
async function cleanup() {
  const events = await Event.find({ title: EVENT_TITLE }).select('_id');
  const eventIds = events.map((e) => e._id);
  const [bookings, seats, eventsDeleted, users] = await Promise.all([
    Booking.deleteMany({ event: { $in: eventIds } }),
    Seat.deleteMany({ event: { $in: eventIds } }),
    Event.deleteMany({ _id: { $in: eventIds } }),
    User.deleteMany({ email: EMAIL_PATTERN }),
  ]);
  return {
    events: eventsDeleted.deletedCount,
    seats: seats.deletedCount,
    bookings: bookings.deletedCount,
    users: users.deletedCount,
  };
}

// Puts every seat of the test event back on sale and removes its bookings
async function resetEvent(eventId) {
  await Booking.deleteMany({ event: eventId });
  await Seat.updateMany(
    { event: eventId },
    { status: 'available', booking: null, holdExpiresAt: null },
  );
}

// ---------- setup ----------

async function setup() {
  const organiser = await User.findOne({ role: 'organiser' });
  if (!organiser) throw new Error('No organiser found. Run "npm run seed" first.');

  // A dedicated event with 100 seats, created by the real service (same seat logic as the API)
  const event = await createEvent(organiser._id, {
    title: EVENT_TITLE,
    venue: 'Load Test Arena',
    city: 'Loadtest City',
    startTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    rows: 10,
    seatsPerRow: 10,
    pricePaise: 10000,
  });

  // 500 users inserted in one go. The hash is not a real bcrypt hash, so nobody can log in with them.
  const users = await User.insertMany(
    Array.from({ length: USER_COUNT }, (_, i) => ({
      name: `Loadtest User ${i + 1}`,
      email: `loadtest+${i + 1}@example.com`,
      passwordHash: 'loadtest-dummy-hash',
      role: 'user',
    })),
  );

  // Sign tokens directly (same payload as the login service) instead of 500 bcrypt logins.
  // Fixed 1h expiry, NOT JWT_EXPIRES_IN: a short .env value (e.g. "10s") would expire the
  // tokens before the later scenarios run.
  const tokens = users.map((u) =>
    jwt.sign({ sub: u._id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '1h' }),
  );

  return { event, users, tokens };
}

// ---------- scenarios ----------

// A: everyone wants seat A1
async function scenarioA({ event, tokens }) {
  const eventId = event._id.toString();
  const { results, durationMs } = await fireAll(
    tokens.map((token) => () => timedHold(token, eventId, ['A1'])),
  );
  const stats = summarise(results, durationMs);

  const winner = results.find((r) => r.status === 201);
  const seat = await Seat.findOne({ event: event._id, label: 'A1' });
  const bookingCount = await Booking.countDocuments({ event: event._id });

  const checks = [
    ['exactly 1 request got 201', stats.created === 1],
    [`exactly ${USER_COUNT - 1} requests got 409`, stats.conflicts === USER_COUNT - 1],
    ['no other responses (errors)', stats.other === 0],
    [
      "seat A1 is held by the winner's booking",
      Boolean(winner) && seat.status === 'held' && seat.booking?.toString() === winner.body._id,
    ],
    ['only 1 booking exists in the DB', bookingCount === 1],
  ];
  return { name: `A: ${USER_COUNT} users, 1 seat`, stats, checks };
}

// C: everyone wants seat A1, which is ALREADY held (run straight after A).
// This is the normal real-world case: the seat went in the first moment and everyone else
// arrives a little later. It's where the fast-fail check pays off: no transactions needed.
async function scenarioC({ event, tokens }) {
  const eventId = event._id.toString();
  const before = await Seat.findOne({ event: event._id, label: 'A1' });

  const { results, durationMs } = await fireAll(
    tokens.map((token) => () => timedHold(token, eventId, ['A1'])),
  );
  const stats = summarise(results, durationMs);

  const after = await Seat.findOne({ event: event._id, label: 'A1' });
  const bookingCount = await Booking.countDocuments({ event: event._id });

  const checks = [
    ['seat A1 was already held when the burst started', before.status === 'held'],
    ['no request got 201', stats.created === 0],
    [`all ${USER_COUNT} requests got 409`, stats.conflicts === USER_COUNT],
    ['no other responses (errors)', stats.other === 0],
    [
      'seat A1 still belongs to the same booking',
      after.booking?.toString() === before.booking?.toString(),
    ],
    ['still only 1 booking in the DB', bookingCount === 1],
  ];
  return { name: `C: ${USER_COUNT} users, 1 already-taken seat`, stats, checks };
}

// B: everyone wants one random seat out of 100
async function scenarioB({ event, tokens }) {
  await resetEvent(event._id);
  const eventId = event._id.toString();

  const allLabels = (await Seat.find({ event: event._id }).select('label')).map((s) => s.label);
  const picks = tokens.map(() => allLabels[Math.floor(Math.random() * allLabels.length)]);
  const distinctRequested = new Set(picks).size;

  const { results, durationMs } = await fireAll(
    tokens.map((token, i) => () => timedHold(token, eventId, [picks[i]])),
  );
  const stats = summarise(results, durationMs);

  // Load the DB state once and check it against the responses
  const seats = await Seat.find({ event: event._id });
  const seatById = new Map(seats.map((s) => [s._id.toString(), s]));
  const bookings = await Booking.find({ event: event._id });

  // How many bookings list each seat (must never be more than 1)
  const bookingsPerSeat = new Map();
  for (const b of bookings) {
    for (const seatId of b.seats) {
      const key = seatId.toString();
      bookingsPerSeat.set(key, (bookingsPerSeat.get(key) ?? 0) + 1);
    }
  }

  // Every 201 booking owns exactly the one seat that user asked for
  const winnersOwnTheirSeat = results.every((r, i) => {
    if (r.status !== 201) return true;
    if (r.body.seats?.length !== 1) return false;
    const seat = seatById.get(r.body.seats[0]);
    return (
      seat?.label === picks[i] && seat.status === 'held' && seat.booking?.toString() === r.body._id
    );
  });

  const checks = [
    [
      `201 count (${stats.created}) == distinct seats requested (${distinctRequested})`,
      stats.created === distinctRequested,
    ],
    [
      `409 count (${stats.conflicts}) == requests minus winners (${USER_COUNT - distinctRequested})`,
      stats.conflicts === USER_COUNT - distinctRequested,
    ],
    ['no other responses (errors)', stats.other === 0],
    [
      'no seat belongs to more than one booking',
      [...bookingsPerSeat.values()].every((n) => n === 1),
    ],
    ['every 201 booking owns exactly its requested seat', winnersOwnTheirSeat],
    [
      `held seats in DB (${seats.filter((s) => s.status === 'held').length}) == bookings (${bookings.length}) == 201s`,
      seats.filter((s) => s.status === 'held').length === stats.created &&
        bookings.length === stats.created,
    ],
  ];
  return { name: `B: ${USER_COUNT} users, 100 seats`, stats, checks, distinctRequested };
}

// ---------- reporting ----------

const ms = (n) => `${Math.round(n)} ms`;
const passed = (scenario) => scenario.checks.every(([, ok]) => ok);

function printResults(scenarios) {
  console.log('\n=== Results ===');
  console.table(
    Object.fromEntries(
      scenarios.map((s) => [
        s.name,
        {
          requests: s.stats.total,
          201: s.stats.created,
          409: s.stats.conflicts,
          other: s.stats.other,
          duration: ms(s.stats.durationMs),
          p50: ms(s.stats.p50),
          p95: ms(s.stats.p95),
          max: ms(s.stats.max),
          result: passed(s) ? 'PASS' : 'FAIL',
        },
      ]),
    ),
  );
  for (const s of scenarios) {
    console.log(`\n${s.name}`);
    for (const [label, ok] of s.checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    for (const [what, count] of Object.entries(s.stats.otherDetails)) {
      console.log(`  unexpected response x${count}: ${what}`);
    }
  }
}

async function writeReport(scenarios) {
  const row = (s) =>
    `| ${s.name} | ${s.stats.total} | ${s.stats.created} | ${s.stats.conflicts} | ${s.stats.other} | ${ms(s.stats.durationMs)} | ${ms(s.stats.p50)} | ${ms(s.stats.p95)} | ${ms(s.stats.max)} | ${passed(s) ? 'PASS' : 'FAIL'} |`;
  const checks = (s) =>
    s.checks.map(([label, ok]) => `- ${ok ? 'PASS' : 'FAIL'}: ${label}`).join('\n');
  const [a, c, b] = scenarios;

  const latest = `${MARKER_START}
## Latest run (written automatically by \`npm run loadtest\`)

- **Date:** ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC
- **Setup:** local server + Atlas M0 free tier (${os.cpus().length} CPU cores, Node ${process.version})
- **Tool:** \`npm run loadtest\` (\`server/loadtest/run.js\`, plain Node \`fetch\`, all requests fired at once with \`Promise.all\`)

| Scenario | Requests | 201 | 409 | Other | Duration | p50 | p95 | Max | Result |
| -------- | -------- | --- | --- | ----- | -------- | --- | --- | --- | ------ |
${scenarios.map(row).join('\n')}

Latency is per request, measured from sending to receiving the full response. Duration is the whole burst, from the first request to the last response.

### A: ${USER_COUNT} users, 1 seat

**What it proves:** when ${USER_COUNT} people try to grab the same seat at the same instant, exactly one gets it and everyone else is told it's taken (409). Nobody gets an error, and the database agrees with the responses. This is the double-booking race condition at its worst, and the atomic conditional update plus the transaction prevent it.

${checks(a)}

### B: ${USER_COUNT} users, 100 seats

**What it proves:** with many seats wanted at once (${b.distinctRequested} different seats requested, some by several people), every requested seat goes to exactly one person. The number of winners equals the number of different seats asked for, so no seat was lost or given out twice, and each winner's booking points at exactly the seat they asked for.

${checks(b)}

### C: ${USER_COUNT} users, 1 already-taken seat

**What it proves:** when a seat is already gone and ${USER_COUNT} people still try for it, every one of them is turned away (409) and the existing booking is untouched. Because the seat is visibly taken, the fast-fail check answers without opening a single transaction, which is why this burst is quick.

${checks(c)}
${MARKER_END}`;

  // Replace only the "Latest run" section, so hand-written notes (e.g. before/after) are kept
  const existing = await readFile(RESULTS_FILE, 'utf8').catch(() => null);
  const start = existing?.indexOf(MARKER_START) ?? -1;
  const end = existing?.indexOf(MARKER_END) ?? -1;
  const md =
    start !== -1 && end > start
      ? existing.slice(0, start) + latest + existing.slice(end + MARKER_END.length)
      : `# Load Test Results\n\n${latest}\n`;
  await writeFile(RESULTS_FILE, md);
}

// ---------- main ----------

async function main() {
  // Fail fast with a clear message if the server isn't running
  await fetch(`${BASE_URL}/api/health`).catch(() => {
    throw new Error(`Server not reachable at ${BASE_URL}. Start it with "npm run dev" first.`);
  });

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const leftovers = await cleanup();
    if (Object.values(leftovers).some(Boolean)) {
      console.log('Removed leftovers from a previous run:', leftovers);
    }

    console.log(`Setup: creating "${EVENT_TITLE}" (100 seats) and ${USER_COUNT} users...`);
    const ctx = await setup();

    console.log(`Scenario A: ${USER_COUNT} users -> seat A1...`);
    const a = await scenarioA(ctx);
    console.log(`Scenario C: ${USER_COUNT} users -> seat A1 again (already held)...`);
    const c = await scenarioC(ctx);
    console.log(`Scenario B: ${USER_COUNT} users -> 1 random seat each...`);
    const b = await scenarioB(ctx);

    printResults([a, c, b]);
    await writeReport([a, c, b]);
    console.log('\nResults written to docs/load-test-results.md');

    const allPassed = [a, c, b].every(passed);
    console.log(`\nOVERALL: ${allPassed ? 'PASS' : 'FAIL'}`);
    if (!allPassed) process.exitCode = 1;
  } finally {
    // Always clean up, even if a scenario crashed
    console.log('Cleanup deleted:', await cleanup());
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Load test could not run:', err.message);
  process.exitCode = 1;
});
