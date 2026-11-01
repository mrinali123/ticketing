import { useId } from 'react';

// Label + input + error message underneath. The error is linked to the input for screen readers.
export default function TextField({ label, error, hint, ...inputProps }) {
  const id = useId();
  const messageId = `${id}-message`;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`mt-1 block w-full min-w-0 rounded border px-3 py-2 text-sm outline-none focus:ring-1 ${
          error
            ? 'border-danger focus:border-danger focus:ring-danger'
            : 'border-line focus:border-accent focus:ring-accent'
        } ${inputProps.readOnly ? 'cursor-not-allowed bg-page text-muted' : 'bg-white'}`}
      />
      {error ? (
        <p id={messageId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="mt-1 text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
