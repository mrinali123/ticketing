import { Link } from 'react-router-dom';

// Plain loading / error messages, so no page ever shows a blank screen while waiting or failing.

// The one loading indicator used everywhere: a small grey ring and a line of text
export function Loading({ children = 'Loading...' }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden="true"
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-muted"
      />
      {children}
    </p>
  );
}

// Full-page error with an optional "try again" button and a way out
export function PageError({
  title = "Couldn't load this page",
  message,
  onRetry,
  backTo = '/',
  backLabel = 'Back to events',
}) {
  return (
    <div className="max-w-md">
      <h1 className="text-xl">{title}</h1>
      {message && <p className="mt-2 text-sm text-muted">{message}</p>}
      <p className="mt-4 flex gap-4 text-sm">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer text-accent hover:underline"
          >
            Try again
          </button>
        )}
        <Link to={backTo}>{backLabel}</Link>
      </p>
    </div>
  );
}
