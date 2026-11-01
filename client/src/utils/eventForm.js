// Helpers for the organiser's create/edit event form.

export const MAX_ROWS = 26; // rows are labelled A to Z (the backend enforces the same limits)
export const MAX_SEATS_PER_ROW = 50;

// Date -> value for <input type="datetime-local">, which wants local time as "YYYY-MM-DDTHH:mm"
export function toLocalInput(date) {
  const d = new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// "YYYY-MM-DDTHH:mm" (local time) -> ISO string for the API
export function fromLocalInput(value) {
  return new Date(value).toISOString();
}

// Form values as strings (that's what inputs hold); prices in rupees
export function emptyForm() {
  return {
    title: '',
    venue: '',
    city: '',
    startTime: '',
    rows: '10',
    seatsPerRow: '10',
    price: '',
  };
}

export function formFromEvent(event) {
  return {
    title: event.title,
    venue: event.venue,
    city: event.city,
    startTime: toLocalInput(event.startTime),
    rows: String(event.rows),
    seatsPerRow: String(event.seatsPerRow),
    price: String(event.pricePaise / 100),
  };
}

const isWholeNumber = (value) => /^\d+$/.test(value);

// Returns { field: message } for every problem. `editing` skips the seat layout (read-only then)
// and only requires a future date if the date was actually changed.
export function validateEventForm(form, { editing = false, originalStartTime = '' } = {}) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'Give the event a title.';
  else if (form.title.trim().length > 120) errors.title = 'Keep the title under 120 characters.';
  if (!form.venue.trim()) errors.venue = 'Enter the venue.';
  if (!form.city.trim()) errors.city = 'Enter the city.';

  if (!form.startTime) {
    errors.startTime = 'Pick a date and time.';
  } else if (Number.isNaN(new Date(form.startTime).getTime())) {
    errors.startTime = "That date doesn't look right.";
  } else if (
    (!editing || form.startTime !== originalStartTime) &&
    new Date(form.startTime) <= new Date()
  ) {
    errors.startTime = 'The event has to be in the future.';
  }

  if (!editing) {
    if (!isWholeNumber(form.rows) || Number(form.rows) < 1 || Number(form.rows) > MAX_ROWS) {
      errors.rows = `Use a whole number from 1 to ${MAX_ROWS}.`;
    }
    if (
      !isWholeNumber(form.seatsPerRow) ||
      Number(form.seatsPerRow) < 1 ||
      Number(form.seatsPerRow) > MAX_SEATS_PER_ROW
    ) {
      errors.seatsPerRow = `Use a whole number from 1 to ${MAX_SEATS_PER_ROW}.`;
    }
  }

  if (form.price.trim() === '') errors.price = 'Enter a price (0 for a free event).';
  else if (!/^\d+(\.\d{1,2})?$/.test(form.price.trim())) {
    errors.price = 'Use a number like 499 or 499.50.';
  }

  return errors;
}

// Rupees as typed ("499.50") -> paise for the API (49950). Rounding avoids 0.1 + 0.2 style errors.
export function toPaise(price) {
  return Math.round(Number(price) * 100);
}
