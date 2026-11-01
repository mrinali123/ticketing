import { Link, useLocation } from 'react-router-dom';
import useTitle from '../hooks/useTitle.js';

export default function NotFoundPage() {
  useTitle('Page not found');
  const { pathname } = useLocation();

  return (
    <div className="max-w-md">
      <p className="text-xs tracking-widest text-muted uppercase">404</p>
      <h1 className="mt-1 text-xl">Page not found</h1>
      <p className="mt-2 text-sm break-all text-muted">
        There's nothing at <span className="font-mono text-xs text-ink">{pathname}</span>. The link
        may be old or mistyped.
      </p>
      <p className="mt-4 text-sm">
        <Link to="/">Go to events</Link>
      </p>
    </div>
  );
}
