// "Previous  Page 2 of 5  Next". Hidden when everything fits on one page.
export default function Pagination({ page, limit, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  const buttonClass =
    'cursor-pointer rounded border border-line bg-white px-3 py-1.5 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line';

  return (
    <nav aria-label="Pages" className="mt-6 flex items-center gap-3">
      <button
        type="button"
        className={buttonClass}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span className="text-sm text-muted">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className={buttonClass}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
