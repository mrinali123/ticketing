import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

// Builds a rate limiter that answers 429 with a JSON message like the rest of the API.
// Limits are skipped when NODE_ENV=test so the normal test suite isn't throttled;
// pass enabledInTests: true to test a limiter itself.
export function makeLimiter({ windowMs, limit, message, keyGenerator, enabledInTests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8', // sends a RateLimit header so clients can see how close they are
    legacyHeaders: false, // no old X-RateLimit-* headers
    message: { message },
    // Checked on every request, so tests can switch NODE_ENV on and off
    skip: () => process.env.NODE_ENV === 'test' && !enabledInTests,
    ...(keyGenerator && { keyGenerator }),
  });
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

// Login + register share one counter per IP: slows down password guessing and fake sign-ups.
// (On Render, req.ip is the real visitor IP because app.js sets "trust proxy".)
export const authLimiter = makeLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  message: 'Too many login or sign-up attempts. Please wait 15 minutes and try again.',
});

// Seat holds are counted per logged-in USER, not per IP: many real people can share one IP
// (a college Wi-Fi, an office), and one user spamming holds shouldn't block all of them.
// Must run after requireAuth so req.user exists; falls back to the IP just in case.
export const holdLimiter = makeLimiter({
  windowMs: FIVE_MINUTES,
  limit: 30,
  message: 'Too many hold attempts. Please wait a few minutes and try again.',
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
});
