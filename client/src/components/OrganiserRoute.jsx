import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import useTitle from '../hooks/useTitle.js';
import { Loading } from './PageState.jsx';

// Like ProtectedRoute, but the user must also be an organiser.
// This only hides pages; the backend still checks the role on every request.
export default function OrganiserRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.role !== 'organiser') return <OrganisersOnly />;
  return <Outlet />;
}

function OrganisersOnly() {
  useTitle('Organisers only');
  return (
    <div className="max-w-md">
      <h1 className="text-xl">Organisers only</h1>
      <p className="mt-2 text-sm text-muted">
        This page is for event organisers. Your account is a normal user account.
      </p>
      <p className="mt-4 text-sm">
        <Link to="/">Back to events</Link>
      </p>
    </div>
  );
}
