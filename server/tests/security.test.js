import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeLimiter } from '../src/middleware/rateLimit.js';
import { errorHandler, notFound } from '../src/middleware/errorHandler.js';
import { parseAllowedOrigins } from '../src/config/cors.js';
import { api, createUserWithToken, createEventWithSeats } from './helpers.js';

// Some tests switch NODE_ENV to see production/development behaviour; always put it back
const originalEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe('rate limiting', () => {
  it('answers 429 with a JSON message once the limit is used up', async () => {
    const app = express();
    app.get(
      '/limited',
      makeLimiter({ windowMs: 60_000, limit: 2, message: 'Slow down', enabledInTests: true }),
      (req, res) => res.json({ ok: true }),
    );

    expect((await request(app).get('/limited')).status).toBe(200);
    expect((await request(app).get('/limited')).status).toBe(200);
    const blocked = await request(app).get('/limited');

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ message: 'Slow down' });
    expect(blocked.headers).toHaveProperty('ratelimit'); // standard header for clients
  });

  it('limits /api/auth/login to 20 attempts per IP outside of tests', async () => {
    process.env.NODE_ENV = 'development'; // the limiter checks this on every request
    const attempt = () =>
      api().post('/api/auth/login').send({ email: 'nobody@test.com', password: 'wrong' });

    for (let i = 0; i < 20; i++) {
      expect((await attempt()).status).toBe(401); // wrong password, but not blocked yet
    }
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/too many login or sign-up attempts/i);
  });

  it('counts hold attempts per user, so one user hitting the limit does not block others', async () => {
    process.env.NODE_ENV = 'development';
    const organiser = await createUserWithToken({ role: 'organiser' });
    const spammer = await createUserWithToken();
    const other = await createUserWithToken();
    const event = await createEventWithSeats(organiser.user, { rows: 1, seatsPerRow: 1 });
    const hold = (who) =>
      api()
        .post('/api/bookings/hold')
        .set('Authorization', who.auth)
        .send({ eventId: event._id, seatLabels: ['Z9'] }); // 400 (no such seat), but still counted

    for (let i = 0; i < 30; i++) await hold(spammer);

    expect((await hold(spammer)).status).toBe(429);
    expect((await hold(other)).status).toBe(400); // same IP, different user: not blocked
  });

  it('is switched off when NODE_ENV=test, so the normal test suite is never throttled', async () => {
    const attempts = [];
    for (let i = 0; i < 25; i++) {
      attempts.push(
        await api().post('/api/auth/login').send({ email: 'nobody@test.com', password: 'x' }),
      );
    }

    expect(attempts.every((r) => r.status === 401)).toBe(true);
  });
});

describe('error responses', () => {
  // A tiny app with a route that crashes, using the real error handler
  function crashingApp() {
    const app = express();
    app.use(express.json());
    app.get('/boom', () => {
      throw new Error('secret internal detail at db.js:42');
    });
    app.post('/echo', (req, res) => res.json(req.body));
    app.use(notFound);
    app.use(errorHandler);
    return app;
  }

  it('never sends the error message or stack trace in production', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request(crashingApp()).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Something went wrong' });
    expect(res.text).not.toMatch(/secret|db\.js|at /);
  });

  it('includes the stack trace only in development', async () => {
    process.env.NODE_ENV = 'development';

    const res = await request(crashingApp()).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.stack).toContain('secret internal detail');
  });

  it('turns a broken JSON body into a 400 JSON response, not an HTML page', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request(crashingApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Request body is not valid JSON' });
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await api().get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});

describe('security headers and CORS', () => {
  it('sends helmet security headers', async () => {
    const res = await api().get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers).not.toHaveProperty('x-powered-by'); // hides that this is Express
  });

  it('reads CLIENT_URL as a comma-separated list, ignoring spaces and trailing slashes', () => {
    expect(parseAllowedOrigins('https://myseat.vercel.app, https://preview.vercel.app/ ,')).toEqual(
      ['https://myseat.vercel.app', 'https://preview.vercel.app'],
    );
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:5173']);
  });

  it('allows the configured frontend origin', async () => {
    const res = await api().get('/api/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
