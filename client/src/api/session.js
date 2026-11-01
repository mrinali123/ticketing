// Reads and writes the login session (token + user) in localStorage.
// See the security note in auth/AuthContext.jsx.
// Every access is wrapped in try/catch because storage can be blocked (e.g. some private windows).

const TOKEN_KEY = 'myseat.token';
const USER_KEY = 'myseat.user';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable: the user stays logged in until the page is reloaded
  }
}

export function saveUser(user) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // ignore, see saveSession
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore, see saveSession
  }
}
