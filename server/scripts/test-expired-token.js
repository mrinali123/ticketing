// server/scripts/test-expired-token.js
// Checks that GET /api/auth/me accepts a fresh token and rejects it once it expires.
// The server must already be running. Run with: npm run test:expiry

import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';

// Load server/.env no matter which folder the script is run from
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const ME_URL = 'http://localhost:5000/api/auth/me';
const TEST_EMAIL = 'test@example.com';
const EXPIRED_MESSAGE = 'Token expired, please log in again';

// Calls /me with the token and returns { status, body }
const callMe = async (token) => {
  const res = await fetch(ME_URL, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text; // not JSON (e.g. an HTML error page), keep the raw text
  }
  return { status: res.status, body };
};

const run = async () => {
  // 1. Look up the test user (only need the DB for this, so disconnect straight away)
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email: TEST_EMAIL });
  await mongoose.disconnect();

  if (!user) {
    throw new Error(`No user with email ${TEST_EMAIL}. Send the Register request in auth.http first.`);
  }

  // 2. Sign a token that expires in 2 seconds
  const token = jwt.sign({ sub: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '2s',
  });

  // 3. Use it right away: should still be valid
  const first = await callMe(token);
  console.log('Fresh token   ->', first.status, JSON.stringify(first.body));

  // 4. Wait until it has expired
  console.log('Waiting 3 seconds...');
  await sleep(3000);

  // 5. Use it again: should be rejected
  const second = await callMe(token);
  console.log('Expired token ->', second.status, JSON.stringify(second.body));

  // 6. Compare with what we expected
  const problems = [];
  if (first.status !== 200) {
    problems.push(`fresh token: expected status 200, got ${first.status}`);
  }
  if (second.status !== 401) {
    problems.push(`expired token: expected status 401, got ${second.status}`);
  }
  if (second.body?.message !== EXPIRED_MESSAGE) {
    problems.push(
      `expired token: expected message "${EXPIRED_MESSAGE}", got ${JSON.stringify(second.body?.message ?? second.body)}`,
    );
  }

  if (problems.length === 0) {
    console.log('PASS');
  } else {
    console.log('FAIL');
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exitCode = 1;
  }
};

run().catch(async (error) => {
  // fetch throws "fetch failed" when nothing is listening on the port
  console.error('FAIL - test could not run:', error.cause?.message ?? error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
