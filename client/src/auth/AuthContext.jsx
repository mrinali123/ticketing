import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { AuthContext } from './useAuth.js';
import { clearSession, getStoredUser, getToken, saveSession, saveUser } from '../api/session.js';

// SECURITY NOTE: the token is kept in localStorage because it's simple and survives reloads.
// The downside: any JavaScript running on the page can read localStorage, so a single XSS bug
// (e.g. injected script from unescaped user content) could steal the token. In production, the
// more secure choice is an httpOnly cookie set by the server: page scripts can't read it at all,
// and the browser sends it automatically (that setup also needs CSRF protection).

export function AuthProvider({ children }) {
  // Start with the saved user so the navbar doesn't flicker on reload; /me confirms it below
  const [user, setUser] = useState(getStoredUser);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  // On startup, check the saved token is still valid and refresh the user's details
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false; // ignore the result if the component unmounted meanwhile

    api('/api/auth/me')
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        saveUser(me);
      })
      .catch((err) => {
        // 401: the api client already cleared the session. Other errors (e.g. server down):
        // keep the saved user so a short outage doesn't log everyone out.
        if (!cancelled && err.status === 401) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: loggedIn } = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    saveSession(token, loggedIn);
    setUser(loggedIn);
    return loggedIn;
  }, []);

  // Register doesn't return a token, so log straight in afterwards
  const register = useCallback(
    async (name, email, password) => {
      await api('/api/auth/register', { method: 'POST', body: { name, email, password } });
      return login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
