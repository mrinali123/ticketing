// Booking helpers shared by the checkout and my-bookings pages.

// The status to SHOW. A "pending" booking whose hold time has passed is really expired, even if
// the server's cleanup job (runs every 60s) hasn't marked it yet.
export function displayStatus(booking, now = Date.now()) {
  if (booking.status === 'pending' && new Date(booking.expiresAt).getTime() <= now) {
    return 'expired';
  }
  return booking.status;
}

export const statusLabels = {
  pending: 'Held',
  confirmed: 'Confirmed',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export const statusClasses = {
  pending: 'text-held-ink',
  confirmed: 'text-accent',
  expired: 'text-muted',
  cancelled: 'text-muted',
};

// Seat labels in seat-map order: A2 before A10, all of row A before row B
export function sortSeatLabels(labels) {
  const parse = (label) => [label.replace(/\d+$/, ''), Number(label.match(/\d+$/)?.[0] ?? 0)];
  return [...labels].sort((a, b) => {
    const [rowA, numA] = parse(a);
    const [rowB, numB] = parse(b);
    return rowA === rowB ? numA - numB : rowA.localeCompare(rowB);
  });
}

// "A1, A2" from a populated booking (seats come back as [{ _id, label }])
export function seatList(booking) {
  return sortSeatLabels((booking.seats ?? []).map((s) => s.label)).join(', ');
}
