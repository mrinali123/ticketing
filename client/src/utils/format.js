// Display helpers shared by all pages.

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0, // "₹500" rather than "₹500.00"
  maximumFractionDigits: 2, // but keep "₹499.50"
});

// The API stores money in paise (₹1 = 100 paise) to avoid decimal rounding errors
export function formatPrice(paise) {
  return rupees.format(paise / 100);
}

const dateTime = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateOnly = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// e.g. "Sat, 7 Nov 2026, 7:00 pm"
export function formatDateTime(value) {
  return dateTime.format(new Date(value));
}

// e.g. "7 Nov 2026"
export function formatDate(value) {
  return dateOnly.format(new Date(value));
}

// Milliseconds left -> "m:ss", e.g. 299000 -> "4:59"
export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// Who's hosting an event: their organisation name, or their own name if they haven't set one.
// The API sends event.organiser as { _id, name, organisationName } on event pages.
export function hostName(event) {
  return event.organiser?.organisationName || event.organiser?.name || '';
}
