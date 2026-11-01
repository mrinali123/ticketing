import bcrypt from 'bcrypt';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { httpError } from '../errors/httpError.js';

// The user fields that are safe to send to the client (never the password hash)
function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    organisationName: user.organisationName,
  };
}

// The token every login (and role change) hands out. The role is stored INSIDE the token,
// so the auth middleware can check it without a database lookup.
function signToken(user) {
  return jwt.sign({ sub: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
}

export async function registerUser({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({ name, email, passwordHash });

  const userObj = user.toObject();
  delete userObj.passwordHash;
  return userObj;
}
export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');

  const passwordOk = user && (await bcrypt.compare(password, user.passwordHash));

  if (!passwordOk) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  return { token: signToken(user), user: publicUser(user) };
}
export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return user;
}

export async function becomeOrganiser(userId, organisationName) {
  const user = await User.findById(userId);
  if (!user) throw httpError(404, 'User not found');
  if (user.role === 'organiser') throw httpError(400, 'You are already an organiser');

  user.role = 'organiser';
  user.organisationName = organisationName;
  await user.save();

  // A NEW token is required. The role lives inside the JWT, and a JWT can't be changed once
  // it's signed: the user's old token still says role "user" until it expires, so the
  // organiser-only routes would keep answering 403. The client must swap in this token.
  return { token: signToken(user), user: publicUser(user) };
}
