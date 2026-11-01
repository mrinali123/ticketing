// A small boxed message: "error" in muted red, "success" in the accent green, "info" neutral grey.
// Pass onDismiss to show a small "Dismiss" button.
const styles = {
  error: 'border-danger/30 bg-danger/5 text-danger',
  success: 'border-accent/30 bg-accent/5 text-accent',
  info: 'border-line bg-page text-ink',
};

export default function Notice({ type = 'info', children, onDismiss }) {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded border px-3 py-2 text-sm ${styles[type]}`}
    >
      <p>{children}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 cursor-pointer text-xs text-muted hover:text-ink"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
