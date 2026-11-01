import { clearSession, getToken } from './session.js';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

// Error thrown for any failed request. `status` is the HTTP status (0 = couldn't reach the
// server) and `message` is the backend's own message, ready to show to the user.
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Small wrapper around fetch: adds the token, sends/parses JSON, and turns errors into ApiError.
// Usage: await api('/api/events'), await api('/api/auth/login', { method: 'POST', body: {...} })
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only throws when there is no response at all (server down, no internet, CORS)
    throw new ApiError(0, "Couldn't reach the server. Check that it's running and try again.");
  }

  // Some responses have no body, so parse carefully
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    // A 401 on a request that SENT a token means the session is no longer valid (expired or
    // tampered with), so log out and go to the login page. A 401 without a token, like a wrong
    // password on the login form, is a normal error that the form shows itself.
    if (res.status === 401 && token) {
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1'); // full reload also resets all app state
      }
    }
    throw new ApiError(res.status, data?.message || `Request failed (${res.status})`, data);
  }

  return data;
}
