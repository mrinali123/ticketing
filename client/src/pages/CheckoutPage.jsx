import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import Button from '../components/Button.jsx';
import Notice from '../components/Notice.jsx';
import TicketStub from '../components/TicketStub.jsx';
import { Loading, PageError } from '../components/PageState.jsx';
import useFetch from '../hooks/useFetch.js';
import useNow from '../hooks/useNow.js';
import useTitle from '../hooks/useTitle.js';
import { formatCountdown, formatDateTime, formatPrice } from '../utils/format.js';
import { displayStatus, seatList } from '../utils/booking.js';

export default function CheckoutPage() {
  const { id } = useParams();

  const {
    data: booking,
    error: loadError,
    setData: setBooking,
    reload: load,
  } = useFetch(`/api/bookings/${id}`);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null); // { text, lost?: true }
  const [serverSaysExpired, setServerSaysExpired] = useState(false);

  // Tick every second, but only while the hold is still running
  const now = useNow(1000, booking?.status === 'pending' && !serverSaysExpired);

  const shownStatus = booking && (serverSaysExpired ? 'expired' : displayStatus(booking, now));
  useTitle(shownStatus === 'confirmed' ? 'Your ticket' : 'Checkout');

  if (loadError) {
    const titles = {
      403: 'This booking belongs to another account',
      404: 'Booking not found',
      400: 'Booking not found',
    };
    return (
      <PageError
        title={titles[loadError.status] ?? "Couldn't load this booking"}
        message={titles[loadError.status] ? undefined : loadError.message}
        onRetry={titles[loadError.status] ? undefined : load}
        backTo="/my-bookings"
        backLabel="My bookings"
      />
    );
  }
  if (!booking) return <Loading>Loading your booking...</Loading>;

  const status = shownStatus;
  const eventLink = booking.event ? `/events/${booking.event._id}` : '/';

  async function payAndConfirm() {
    setPayError(null);
    setPaying(true);
    try {
      const confirmed = await api(`/api/bookings/${booking._id}/confirm`, { method: 'POST' });
      // The confirm response isn't populated, so keep our event/seat details and take the new status
      setBooking((b) => ({ ...b, status: confirmed.status }));
    } catch (err) {
      if (err.status === 409 && err.message === 'Hold expired') {
        setServerSaysExpired(true);
      } else if (err.status === 409) {
        // "Hold lost": a seat slipped away (e.g. the hold ran out and someone else took it)
        setPayError({
          text: 'Some of your seats were released before payment went through, so nothing was charged.',
          lost: true,
        });
      } else if (err.status === 400) {
        load(); // no longer pending (e.g. confirmed in another tab): show its real state
      } else {
        setPayError({ text: err.message });
      }
    } finally {
      setPaying(false);
    }
  }

  // ---- Confirmed: show the ticket ----
  if (status === 'confirmed') {
    return (
      <div>
        <h1 className="text-xl">You're booked</h1>
        <p className="mt-1 text-sm text-muted">
          Show this at the venue. You can find it again under My bookings.
        </p>
        <div className="mt-6">
          <TicketStub booking={booking} />
        </div>
        <p className="mt-6 flex justify-center gap-5 text-sm">
          <Link to="/my-bookings">My bookings</Link>
          <Link to="/">More events</Link>
        </p>
      </div>
    );
  }

  // ---- Expired or cancelled ----
  if (status === 'expired' || status === 'cancelled') {
    return (
      <div className="max-w-md">
        <h1 className="text-xl">
          {status === 'expired' ? 'Your hold expired' : 'This booking was cancelled'}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {status === 'expired'
            ? `Seats ${seatList(booking)} were released so other people can book them. They might still be free.`
            : 'Its seats have been released.'}
        </p>
        <p className="mt-4 text-sm">
          <Link to={eventLink}>Back to the event</Link>
        </p>
      </div>
    );
  }

  // ---- Pending: checkout ----
  const remaining = new Date(booking.expiresAt).getTime() - now;
  const runningLow = remaining < 60_000;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl">Checkout</h1>
      <p className={`mt-1 text-sm ${runningLow ? 'text-danger' : 'text-muted'}`} aria-live="polite">
        Your seats are held for{' '}
        <span className="font-medium tabular-nums">{formatCountdown(remaining)}</span>
      </p>

      <div className="mt-5 rounded-md border border-line bg-white p-5">
        {booking.event ? (
          <>
            <h2 className="text-base">{booking.event.title}</h2>
            <p className="mt-1 text-sm">{formatDateTime(booking.event.startTime)}</p>
            <p className="text-sm text-muted">
              {booking.event.venue}, {booking.event.city}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Event details unavailable.</p>
        )}

        <dl className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Seats</dt>
            <dd className="text-right font-medium">{seatList(booking)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Total</dt>
            <dd className="font-medium">{formatPrice(booking.amountPaise)}</dd>
          </div>
        </dl>

        {payError && (
          <div className="mt-4 space-y-2">
            <Notice type="error">{payError.text}</Notice>
            {payError.lost && (
              <p className="text-sm">
                <Link to={eventLink}>Pick seats again</Link>
              </p>
            )}
          </div>
        )}

        <Button
          type="button"
          onClick={payAndConfirm}
          loading={paying}
          loadingText="Confirming..."
          className="mt-5 w-full"
        >
          Pay {formatPrice(booking.amountPaise)} and confirm
        </Button>
        <p className="mt-3 text-xs text-muted">
          Payment is simulated in this project. No card details are needed and nothing is charged.
        </p>
      </div>

      <p className="mt-4 text-sm">
        <Link to={eventLink}>Back to the event</Link>
      </p>
    </div>
  );
}
