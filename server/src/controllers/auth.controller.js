import { registerUser, loginUser, getMe, becomeOrganiser } from '../services/auth.service.js';

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide name, email, and password' });
    }

    const user = await registerUser({ name, email, password });
    return res.status(201).json(user);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const result = await loginUser({ email, password });
    return res.status(200).json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}

export async function me(req, res) {
  try {
    const user = await getMe(req.user.id);
    return res.status(200).json(user);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}

export async function becomeOrganiserAccount(req, res) {
  try {
    // Only take this one field from the body; the role is set by the server, never the client
    const organisationName =
      typeof req.body.organisationName === 'string' ? req.body.organisationName.trim() : '';

    if (organisationName.length < 2 || organisationName.length > 80) {
      return res
        .status(400)
        .json({ message: 'Organisation name must be between 2 and 80 characters' });
    }

    const result = await becomeOrganiser(req.user.id, organisationName);
    return res.status(200).json(result); // { token, user }
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}
