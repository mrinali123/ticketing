import { describe, it, expect } from 'vitest';
import User from '../src/models/User.js';
import { api, createUser, tokenFor, PASSWORD } from './helpers.js';

const newUser = { name: 'Asha', email: 'asha@test.com', password: PASSWORD };

describe('POST /api/auth/register', () => {
  it('creates a user and never returns the password hash (201)', async () => {
    const res = await api().post('/api/auth/register').send(newUser);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Asha', email: 'asha@test.com', role: 'user' });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('password');
  });

  it('ignores a role in the body, so nobody can self-register as organiser', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ ...newUser, role: 'organiser' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('user');
  });

  it('rejects a duplicate email (409)', async () => {
    await api().post('/api/auth/register').send(newUser);
    const res = await api().post('/api/auth/register').send(newUser);

    expect(res.status).toBe(409);
    expect(await User.countDocuments()).toBe(1);
  });

  it.each(['name', 'email', 'password'])('rejects a missing %s (400)', async (field) => {
    const body = { ...newUser };
    delete body[field];

    const res = await api().post('/api/auth/register').send(body);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token and the user without the hash (200)', async () => {
    const user = await createUser({ email: 'login@test.com' });

    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ _id: user._id.toString(), role: 'user' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a wrong password (401)', async () => {
    await createUser({ email: 'login@test.com' });

    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('rejects an unknown email with the SAME message, so emails cannot be guessed (401)', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it.each(['email', 'password'])('rejects a missing %s (400)', async (field) => {
    const body = { email: 'login@test.com', password: PASSWORD };
    delete body[field];

    const res = await api().post('/api/auth/login').send(body);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the logged-in user (200)', async () => {
    const user = await createUser({ email: 'me@test.com' });

    const res = await api()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: user._id.toString(), email: 'me@test.com' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rejects a request without a token (401)', async () => {
    const res = await api().get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Not logged in');
  });

  it('rejects an invalid token (401)', async () => {
    const res = await api().get('/api/auth/me').set('Authorization', 'Bearer faketoken123');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token');
  });

  it('rejects an expired token (401)', async () => {
    const user = await createUser();
    // A negative expiresIn makes a token that expired 10 seconds ago
    const expiredToken = tokenFor(user, { expiresIn: -10 });

    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token expired, please log in again');
  });
});
