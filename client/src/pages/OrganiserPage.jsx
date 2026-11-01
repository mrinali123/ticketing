import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Notice from '../components/Notice.jsx';
import { Loading, PageError } from '../components/PageState.jsx';
import useFetch from '../hooks/useFetch.js';
import useFlash from '../hooks/useFlash.js';
import useTitle from '../hooks/useTitle.js';
import { formatDateTime } from '../utils/format.js';

// What to show in the Status column. A scheduled event whose start time has passed is "Past".
function eventStatus(event) {
  if (event.status === 'cancelled') return { label: 'Cancelled', className: 'text-muted' };
  if (new Date(event.startTime) <= new Date()) return { label: 'Past', className: 'text-muted' };
  return { label: 'Scheduled', className: 'text-accent' };
}

export default function OrganiserPage() {
  useTitle('Your events');

  const { data: events, error, setData: setEvents, reload } = useFetch('/api/events/mine');
  const [flash, setFlash] = useFlash(); // e.g. "Created ..." after saving the form
  const [confirmingId, setConfirmingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [message, setMessage] = useState(null); // { type, text } after a cancel

  if (error) {
    return <PageError title="Couldn't load your events" message={error.message} onRetry={reload} />;
  }
  if (!events) return <Loading>Loading your events...</Loading>;

  async function cancelEvent(event) {
    setMessage(null);
    setFlash(null);
    setCancellingId(event._id);
    try {
      const result = await api(`/api/events/${event._id}/cancel`, { method: 'POST' });
      setEvents((list) =>
        list.map((e) => (e._id === event._id ? { ...e, status: result.event.status } : e)),
      );
      setConfirmingId(null);
      const n = result.bookingsCancelled;
      setMessage({
        type: 'success',
        text: `Cancelled "${event.title}".${
          n > 0 ? ` ${n} booking${n === 1 ? ' was' : 's were'} cancelled with it.` : ''
        }`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: `Couldn't cancel "${event.title}": ${err.message}` });
    } finally {
      setCancellingId(null);
    }
  }

  const notice = message ?? (flash && { type: 'success', text: flash });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl">Your events</h1>
          <p className="mt-1 text-sm text-muted">
            Newest first. Seat counts update when you reload.
          </p>
        </div>
        <Link
          to="/organiser/new"
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white no-underline hover:bg-accent-dark hover:no-underline"
        >
          New event
        </Link>
      </div>

      {notice && (
        <div className="mt-4">
          <Notice
            type={notice.type}
            onDismiss={() => {
              setMessage(null);
              setFlash(null);
            }}
          >
            {notice.text}
          </Notice>
        </div>
      )}

      {events.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          You haven't created any events yet. <Link to="/organiser/new">Create your first one</Link>
        </p>
      ) : (
        <>
          <p className="mt-4 text-xs text-muted sm:hidden">
            Scroll the table sideways to see seat counts and actions.
          </p>
          <div className="relative mt-2 overflow-x-auto rounded-md border border-line bg-white sm:mt-4">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-line bg-page text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">City</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Available</th>
                  <th className="px-3 py-2 text-right font-medium">Held</th>
                  <th className="px-3 py-2 text-right font-medium">Booked</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {events.map((event) => {
                  const status = eventStatus(event);
                  const editable = status.label === 'Scheduled';
                  const counts = event.seatCounts;
                  return (
                    <tr key={event._id} className="align-top">
                      {/* min width: stops titles wrapping one word per line on small screens */}
                      <td className="min-w-44 px-3 py-2.5">
                        <Link to={`/events/${event._id}`}>{event.title}</Link>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {formatDateTime(event.startTime)}
                      </td>
                      <td className="px-3 py-2.5">{event.city}</td>
                      <td className={`px-3 py-2.5 ${status.className}`}>{status.label}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{counts.available}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{counts.held}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{counts.booked}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {confirmingId === event._id ? (
                          <span className="inline-flex items-center gap-3">
                            <span className="text-muted">Cancel event and its bookings?</span>
                            <button
                              type="button"
                              onClick={() => cancelEvent(event)}
                              disabled={cancellingId === event._id}
                              className="cursor-pointer font-medium text-danger hover:underline disabled:cursor-wait disabled:opacity-60"
                            >
                              {cancellingId === event._id ? 'Cancelling...' : 'Yes, cancel'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingId(null)}
                              disabled={cancellingId === event._id}
                              className="cursor-pointer text-ink hover:underline"
                            >
                              Keep it
                            </button>
                          </span>
                        ) : (
                          editable && (
                            <span className="inline-flex items-center gap-4">
                              <Link to={`/organiser/events/${event._id}/edit`}>Edit</Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setMessage(null);
                                  setConfirmingId(event._id);
                                }}
                                className="cursor-pointer text-danger hover:underline"
                              >
                                Cancel
                              </button>
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
