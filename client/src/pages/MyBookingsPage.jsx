import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Notice from '../components/Notice.jsx';
import { Loading, PageError } from '../components/PageState.jsx';
import useFetch from '../hooks/useFetch.js';
import useNow from '../hooks/useNow.js';
import useTitle from '../hooks/useTitle.js';
import useInFlight from '../hooks/useInFlight.js';
import { formatDate, formatPrice } from '../utils/format.js';
import { displayStatus, seatList, statusClasses, statusLabels } from '../utils/booking.js';

export default function MyBookingsPage() {
  useTitle('My bookings');

  const {
    data: bookings,
    error: loadError,
    setData: setBookings,
    reload,
  } = useFetch('/api/bookings/me');
  const [confirmingId, setConfirmingId] = useState(null); // row showing "Cancel booking? Yes / No"
  const [cancellingId, setCancellingId] = useState(null); // which row says 'Cancelling...'
  const [, runOnce] = useInFlight();
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }

  // Re-check every 15s so a hold that runs out while the page is open flips to "Expired"
  const now = useNow(15000);

  if (loadError) {
    return (
      <PageError title="Couldn't load your bookings" message={loadError.message} onRetry={reload} />
    );
  }
  if (!bookings) return <Loading>Loading your bookings...</Loading>;

  // runOnce: a second "Yes, cancel" while the first is still running is ignored. Otherwise the
  // second request would fail ("already cancelled") and its error would replace the success.
  const cancelBooking = (booking) =>
    runOnce(async () => {
      setMessage(null);
      setCancellingId(booking._id);
      try {
        const updated = await api(`/api/bookings/${booking._id}/cancel`, { method: 'POST' });
        // Keep the populated event/seats from the list, take the new status from the server
        setBookings((list) =>
          list.map((b) => (b._id === booking._id ? { ...b, status: updated.status } : b)),
        );
        setConfirmingId(null);
        setMessage({
          type: 'success',
          text: `Booking cancelled. Seats ${seatList(booking)} are free again.`,
        });
      } catch (err) {
        setMessage({
          type: 'error',
          text: `Couldn't cancel the booking for ${booking.event?.title ?? 'this event'}: ${err.message}`,
        });
        // 400 = it's no longer cancellable (e.g. cancelled in another tab): show the real state
        if (err.status === 400) {
          setConfirmingId(null);
          reload();
        }
      } finally {
        setCancellingId(null);
      }
    });

  // Work out each booking's status and actions once, for both the phone list and the table
  const rows = bookings.map((booking) => {
    const status = displayStatus(booking, now);
    const eventStarted = booking.event ? new Date(booking.event.startTime).getTime() <= now : true;
    // Same rule as the backend: pending or confirmed, and the event hasn't started yet
    const canCancel = (status === 'pending' || status === 'confirmed') && !eventStarted;
    const actions = (
      <BookingActions
        booking={booking}
        status={status}
        canCancel={canCancel}
        confirming={confirmingId === booking._id}
        cancelling={cancellingId === booking._id}
        onAskCancel={() => {
          setMessage(null);
          setConfirmingId(booking._id);
        }}
        onKeep={() => setConfirmingId(null)}
        onCancel={() => cancelBooking(booking)}
      />
    );
    // Pay (held), Ticket (confirmed) or Cancel: is there anything to show at all?
    const hasActions = status === 'pending' || status === 'confirmed' || canCancel;
    return { booking, status, actions, hasActions };
  });

  return (
    <div>
      <h1 className="text-xl">My bookings</h1>

      {bookings.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          You haven't booked anything yet. <Link to="/">Find an event</Link>
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">Newest first.</p>

          {message && (
            <div className="mt-4">
              <Notice type={message.type} onDismiss={() => setMessage(null)}>
                {message.text}
              </Notice>
            </div>
          )}

          {/* Phones: one stacked block per booking, so status and actions are always visible */}
          <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-white sm:hidden">
            {rows.map(({ booking, status, actions, hasActions }) => (
              <li key={booking._id} className="space-y-1 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <EventTitle booking={booking} />
                  <span className={`shrink-0 ${statusClasses[status] ?? ''}`}>
                    {statusLabels[status] ?? status}
                  </span>
                </div>
                <p className="text-muted">
                  {booking.event && `${formatDate(booking.event.startTime)} · `}
                  Seats {seatList(booking)} · {formatPrice(booking.amountPaise)}
                </p>
                {hasActions && <div className="pt-1">{actions}</div>}
              </li>
            ))}
          </ul>

          {/* Wider screens: a normal table */}
          <div className="relative mt-4 hidden overflow-x-auto rounded-md border border-line bg-white sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-page text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Seats</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ booking, status, actions }) => (
                  <tr key={booking._id} className="align-top">
                    <td className="px-3 py-2.5">
                      <EventTitle booking={booking} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {booking.event ? formatDate(booking.event.startTime) : ''}
                    </td>
                    <td className="px-3 py-2.5">{seatList(booking)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {formatPrice(booking.amountPaise)}
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap ${statusClasses[status] ?? ''}`}>
                      {statusLabels[status] ?? status}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{actions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function EventTitle({ booking }) {
  return booking.event ? (
    <Link to={`/events/${booking.event._id}`}>{booking.event.title}</Link>
  ) : (
    <span className="text-muted">Event removed</span>
  );
}

// Pay / Ticket / Cancel links, or the inline "Cancel booking? Yes / Keep it" question
function BookingActions({
  booking,
  status,
  canCancel,
  confirming,
  cancelling,
  onAskCancel,
  onKeep,
  onCancel,
}) {
  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted">Cancel booking?</span>
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="cursor-pointer font-medium text-danger hover:underline disabled:cursor-wait disabled:opacity-60"
        >
          {cancelling ? 'Cancelling...' : 'Yes, cancel'}
        </button>
        <button
          type="button"
          onClick={onKeep}
          disabled={cancelling}
          className="cursor-pointer text-ink hover:underline"
        >
          Keep it
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-4">
      {status === 'pending' && <Link to={`/bookings/${booking._id}`}>Pay</Link>}
      {status === 'confirmed' && <Link to={`/bookings/${booking._id}`}>Ticket</Link>}
      {canCancel && (
        <button
          type="button"
          onClick={onAskCancel}
          className="cursor-pointer text-danger hover:underline"
        >
          Cancel
        </button>
      )}
    </span>
  );
}
