import { createContext, useContext } from 'react';

// Shared by AuthProvider (which fills it) and every component that calls useAuth().
// Kept in its own file so AuthContext.jsx only exports a component (needed for hot reload).
export const AuthContext = createContext(null);

// Use in any component: const { user, login, logout } = useAuth();
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
