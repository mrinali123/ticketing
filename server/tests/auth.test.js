import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import { api, createUser, tokenFor, eventBody, PASSWORD } from './helpers.js';

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

describe('POST /api/auth/become-organiser', () => {
  const upgrade = (token, body = { organisationName: 'Chennai Music Society' }) =>
    api().post('/api/auth/become-organiser').set('Authorization', `Bearer ${token}`).send(body);

  it('upgrades the account and returns a NEW token whose role is organiser (200)', async () => {
    const user = await createUser({ email: 'host@test.com' });
    const oldToken = tokenFor(user);

    const res = await upgrade(oldToken);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      _id: user._id.toString(),
      role: 'organiser',
      organisationName: 'Chennai Music Society',
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.token).not.toBe(oldToken);
    // Same token format as login: { sub, role }
    expect(jwt.decode(res.body.token)).toMatchObject({
      sub: user._id.toString(),
      role: 'organiser',
    });
    expect(await User.findById(user._id)).toMatchObject({ role: 'organiser' });
  });

  it('the new token can create events, but the old token still cannot (it still says "user")', async () => {
    const user = await createUser();
    const oldToken = tokenFor(user);
    const { body } = await upgrade(oldToken);

    const withNew = await api()
      .post('/api/events')
      .set('Authorization', `Bearer ${body.token}`)
      .send(eventBody());
    const withOld = await api()
      .post('/api/events')
      .set('Authorization', `Bearer ${oldToken}`)
      .send(eventBody());

    expect(withNew.status).toBe(201);
    expect(withOld.status).toBe(403);
  });

  it('rejects upgrading an account that is already an organiser (400)', async () => {
    const user = await createUser();
    const { body } = await upgrade(tokenFor(user));

    const again = await upgrade(body.token);

    expect(again.status).toBe(400);
    expect(again.body.message).toMatch(/already an organiser/i);
  });

  it.each([
    ['missing', {}],
    ['too short', { organisationName: 'A' }],
    ['only spaces', { organisationName: '    ' }],
    ['too long', { organisationName: 'x'.repeat(81) }],
    ['not text', { organisationName: 12345 }],
  ])(
    'rejects an organisation name that is %s (400) and leaves the role alone',
    async (_n, body) => {
      const user = await createUser();

      const res = await upgrade(tokenFor(user), body);

      expect(res.status).toBe(400);
      expect((await User.findById(user._id)).role).toBe('user');
    },
  );

  it('requires a token (401)', async () => {
    const res = await api()
      .post('/api/auth/become-organiser')
      .send({ organisationName: 'Chennai Music Society' });

    expect(res.status).toBe(401);
  });

  it('includes organisationName in /me and in the login response afterwards', async () => {
    const user = await createUser({ email: 'host@test.com' });
    const { body } = await upgrade(tokenFor(user));

    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
    const login = await api()
      .post('/api/auth/login')
      .send({ email: 'host@test.com', password: PASSWORD });

    expect(me.body.organisationName).toBe('Chennai Music Society');
    expect(login.body.user).toMatchObject({
      role: 'organiser',
      organisationName: 'Chennai Music Society',
    });
  });
});
