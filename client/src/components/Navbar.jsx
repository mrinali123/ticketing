import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';

// Plain text links; the current page is shown in the accent colour
const linkClass = ({ isActive }) =>
  `text-sm no-underline hover:no-underline ${
    isActive ? 'font-medium text-accent' : 'text-ink hover:text-accent'
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="border-b border-line bg-white">
      {/* flex-wrap: on narrow phones the links drop onto a second line instead of overflowing */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-ink no-underline hover:no-underline">
          MySeat
        </Link>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <NavLink to="/" end className={linkClass}>
            Events
          </NavLink>

          {user ? (
            <>
              <NavLink to="/my-bookings" className={linkClass}>
                My bookings
              </NavLink>
              {user.role === 'organiser' && (
                <NavLink to="/organiser" className={linkClass}>
                  Organiser
                </NavLink>
              )}
              {/* The divider only makes sense when everything fits on one line (wider screens) */}
              <span className="flex items-center gap-3 sm:border-l sm:border-line sm:pl-5">
                <span className="max-w-[9rem] truncate text-sm text-muted" title={user.email}>
                  {user.name}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="cursor-pointer text-sm text-ink hover:text-danger"
                >
                  Log out
                </button>
              </span>
            </>
          ) : (
            <>
              <NavLink to="/login" className={linkClass}>
                Log in
              </NavLink>
              <NavLink to="/register" className={linkClass}>
                Sign up
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
