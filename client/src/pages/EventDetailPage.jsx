import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import useFetch from '../hooks/useFetch.js';
import useTitle from '../hooks/useTitle.js';
import useInFlight from '../hooks/useInFlight.js';
import SeatMap from '../components/SeatMap.jsx';
import Button from '../components/Button.jsx';
import Notice from '../components/Notice.jsx';
import { Loading, PageError } from '../components/PageState.jsx';
import { formatDateTime, formatPrice, hostName } from '../utils/format.js';

const MAX_SEATS = 6; // same limit as the backend
const REFRESH_MS = 5000;
const NO_SEATS = new Set();

export default function EventDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { data, error: loadError, setData, reload } = useFetch(`/api/events/${id}`);
  useTitle(data?.event.title ?? 'Event');

  // Selected seat labels, stored with the event they belong to, so moving to another event
  // can never carry a selection across
  const [selection, setSelection] = useState({ eventId: id, labels: NO_SEATS });
  const selected = selection.eventId === id ? selection.labels : NO_SEATS;
  const setSelected = useCallback((labels) => setSelection({ eventId: id, labels }), [id]);

  const [refreshFailed, setRefreshFailed] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error' | 'info', text }
  const [holding, runOnce] = useInFlight(); // one hold request at a time

  // The Idempotency-Key for the current hold attempt. Kept in a ref so a retry after a network
  // error sends the SAME key (the server then returns the booking it may already have made),
  // and cleared whenever the selection changes or the server gives a real answer.
  const idempotencyKey = useRef(null);

  // Latest selection, readable inside the 5-second refresh without restarting the timer
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Puts fresh seat data on screen and drops any selected seat that someone else just took
  const applySeats = useCallback(
    (fresh) => {
      setData(fresh);
      const stillFree = new Set(
        fresh.seats.filter((s) => s.status === 'available').map((s) => s.label),
      );
      const current = selectedRef.current;
      const lost = [...current].filter((label) => !stillFree.has(label));
      if (lost.length === 0) return;

      setSelected(new Set([...current].filter((label) => stillFree.has(label))));
      idempotencyKey.current = null;
      setMessage({
        type: 'info',
        text: `${lost.join(', ')} ${lost.length === 1 ? 'was' : 'were'} just taken by someone else, so ${
          lost.length === 1 ? "it's" : "they're"
        } no longer selected.`,
      });
    },
    [setData, setSelected],
  );

  const refreshSeats = useCallback(
    () =>
      api(`/api/events/${id}`)
        .then((fresh) => {
          applySeats(fresh);
          setRefreshFailed(false);
        })
        .catch(() => setRefreshFailed(true)),
    [id, applySeats],
  );

  // Refresh the seat map every 5 seconds so other people's holds show up.
  // Skipped while the tab is hidden; a failed refresh keeps the last map on screen.
  const loaded = Boolean(data);
  useEffect(() => {
    if (!loaded) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) refreshSeats();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loaded, refreshSeats]);

  if (loadError) {
    const notFound = loadError.status === 404 || loadError.status === 400;
    return (
      <PageError
        title={notFound ? 'Event not found' : "Couldn't load this event"}
        message={notFound ? 'It may have been removed, or the link is wrong.' : loadError.message}
        onRetry={notFound ? undefined : reload}
      />
    );
  }
  if (!data) return <Loading>Loading event...</Loading>;

  const { event, seats } = data;
  const isCancelled = event.status === 'cancelled';
  const hasStarted = new Date(event.startTime) <= new Date();
  const bookable = !isCancelled && !hasStarted;
  const selectedLabels = seats.filter((s) => selected.has(s.label)).map((s) => s.label); // seat-map order
  const availableCount = seats.filter((s) => s.status === 'available').length;

  function toggleSeat(label) {
    setMessage(null);
    idempotencyKey.current = null; // different seats = a different request
    const next = new Set(selected);
    if (next.has(label)) {
      next.delete(label);
    } else if (next.size >= MAX_SEATS) {
      setMessage({ type: 'error', text: `You can pick up to ${MAX_SEATS} seats at a time.` });
      return;
    } else {
      next.add(label);
    }
    setSelected(next);
  }

  // runOnce ignores repeat clicks while a hold request is running. (Even without it, a repeat
  // would reuse the same Idempotency-Key and get the same booking back, never a second one.)
  const holdSeats = () =>
    runOnce(async () => {
      setMessage(null);
      idempotencyKey.current ??= crypto.randomUUID();

      try {
        const booking = await api('/api/bookings/hold', {
          method: 'POST',
          body: { eventId: event._id, seatLabels: selectedLabels },
          headers: { 'Idempotency-Key': idempotencyKey.current },
        });
        idempotencyKey.current = null;
        navigate(`/bookings/${booking._id}`);
      } catch (err) {
        if (err.status === 0) {
          // No answer at all: keep the same key so pressing the button again can't double-book
          setMessage({
            type: 'error',
            text: "Couldn't reach the server. Your seats may or may not be held. Press the button again to retry safely.",
          });
          return;
        }

        idempotencyKey.current = null;
        if (err.status === 409) {
          const seat = err.message.match(/Seat (\S+)/)?.[1];
          setMessage({
            type: 'error',
            text: seat
              ? `Couldn't hold ${seat}, someone just took it. Pick another.`
              : "Couldn't hold those seats, someone just took one. Pick again.",
          });
          if (seat) setSelected(new Set([...selected].filter((label) => label !== seat)));
          refreshSeats();
        } else {
          setMessage({ type: 'error', text: err.message });
        }
      }
    });

  return (
    <div>
      <p className="text-sm">
        <Link to="/">All events</Link>
      </p>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl break-words">{event.title}</h1>
          <p className="mt-1 text-sm">{formatDateTime(event.startTime)}</p>
          <p className="text-sm text-muted">
            {event.venue}, {event.city}
          </p>
          {hostName(event) && (
            <p className="mt-1 text-xs text-muted">Hosted by {hostName(event)}</p>
          )}
        </div>
        <p className="text-sm">
          <span className="font-medium">{formatPrice(event.pricePaise)}</span>
          <span className="text-muted"> per seat</span>
        </p>
      </div>

      {isCancelled && (
        <div className="mt-4">
          <Notice type="error">This event was cancelled by the organiser.</Notice>
        </div>
      )}
      {!isCancelled && hasStarted && (
        <div className="mt-4">
          <Notice>This event has already started, so booking is closed.</Notice>
        </div>
      )}

      <section className="mt-6 rounded-md border border-line bg-white p-3 sm:p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base">{bookable ? 'Pick your seats' : 'Seat map'}</h2>
          <p className="text-xs text-muted">
            {availableCount} of {seats.length} seats free
            {refreshFailed && " (couldn't refresh, retrying)"}
          </p>
        </div>

        <SeatMap
          seats={seats}
          selected={selected}
          onToggle={toggleSeat}
          disabled={!bookable || holding}
        />
      </section>

      {bookable && (
        <section className="mt-4 rounded-md border border-line bg-white p-4 sm:p-5">
          {message && (
            <div className="mb-4">
              <Notice type={message.type}>{message.text}</Notice>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              {selectedLabels.length === 0 ? (
                <p className="text-muted">
                  No seats selected. Tap a white seat to pick it (up to {MAX_SEATS}).
                </p>
              ) : (
                <>
                  <p>
                    Seats: <span className="font-medium">{selectedLabels.join(', ')}</span>
                  </p>
                  <p className="mt-0.5">
                    Total:{' '}
                    <span className="font-medium">
                      {formatPrice(event.pricePaise * selectedLabels.length)}
                    </span>
                    <span className="text-muted">
                      {' '}
                      ({selectedLabels.length} × {formatPrice(event.pricePaise)})
                    </span>
                  </p>
                </>
              )}
            </div>

            {user ? (
              <Button
                type="button"
                onClick={holdSeats}
                disabled={selectedLabels.length === 0}
                loading={holding}
                loadingText="Holding seats..."
                className="w-full sm:w-auto"
              >
                Hold seats
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => navigate('/login', { state: { from: location } })}
                className="w-full sm:w-auto"
              >
                Log in to hold seats
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
