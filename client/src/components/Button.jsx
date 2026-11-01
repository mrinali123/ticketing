// Primary button in the accent colour. Pass `loading` to disable it and show `loadingText`.
export default function Button({
  loading = false,
  loadingText,
  children,
  className = '',
  ...props
}) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`cursor-pointer rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {loading ? (loadingText ?? children) : children}
    </button>
  );
}
