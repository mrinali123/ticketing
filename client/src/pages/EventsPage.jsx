import { Link, useSearchParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import useTitle from '../hooks/useTitle.js';
import Pagination from '../components/Pagination.jsx';
import Notice from '../components/Notice.jsx';
import { Loading } from '../components/PageState.jsx';
import { formatDateTime, formatPrice } from '../utils/format.js';

const PAGE_SIZE = 9; // 3 rows of 3 cards on a wide screen

export default function EventsPage() {
  useTitle('Events');

  // City and page live in the URL (?city=Pune&page=2), so Back and shared links keep the filter
  const [searchParams, setSearchParams] = useSearchParams();
  const city = searchParams.get('city') || '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const query = new URLSearchParams({ page, limit: PAGE_SIZE });
  if (city) query.set('city', city);

  // keepPrevious: the old cards stay (faded) while the next page loads, instead of flashing empty
  const events = useFetch(`/api/events?${query}`, { keepPrevious: true });
  // If the city list fails, the filter just shows "All cities"; the page still works
  const { data: cities = [] } = useFetch('/api/events/cities');

  const result = events.data; // { data, page, limit, total }

  function changeCity(e) {
    const next = e.target.value;
    setSearchParams(next ? { city: next } : {}); // a new filter starts again at page 1
  }

  function changePage(next) {
    const params = { page: String(next) };
    if (city) params.city = city;
    setSearchParams(params);
    window.scrollTo(0, 0);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl">Upcoming events</h1>
          <p className="mt-1 text-sm text-muted">Pick an event to see the seat map.</p>
        </div>

        <label className="text-sm">
          <span className="mr-2 text-muted">City</span>
          <select
            value={city}
            onChange={changeCity}
            className="rounded border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">All cities</option>
            {/* keep the current choice selectable even if it isn't in the list */}
            {city && !cities.includes(city) && <option value={city}>{city}</option>}
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6">
        {events.error ? (
          <div className="max-w-md space-y-3">
            <Notice type="error">Couldn't load events. {events.error.message}</Notice>
            <button
              type="button"
              onClick={events.reload}
              className="cursor-pointer text-sm text-accent hover:underline"
            >
              Try again
            </button>
          </div>
        ) : !result ? (
          <Loading>Loading events...</Loading>
        ) : result.data.length === 0 ? (
          <p className="text-sm text-muted">
            {city ? `No upcoming events in ${city}.` : 'No upcoming events right now.'}
            {city && (
              <>
                {' '}
                <Link to="/">Show all cities</Link>
              </>
            )}
          </p>
        ) : (
          <div className={events.loading ? 'opacity-60' : ''}>
            <p className="mb-3 text-xs text-muted">
              {result.total} event{result.total === 1 ? '' : 's'}
              {city && ` in ${city}`}
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.data.map((event) => (
                <li key={event._id}>
                  <EventCard event={event} />
                </li>
              ))}
            </ul>
            <Pagination
              page={result.page}
              limit={result.limit}
              total={result.total}
              onChange={changePage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ event }) {
  return (
    <Link
      to={`/events/${event._id}`}
      className="block h-full rounded-md border border-line bg-white p-4 text-ink no-underline hover:border-accent hover:no-underline"
    >
      <h2 className="text-base leading-snug">{event.title}</h2>
      <p className="mt-2 text-sm">{formatDateTime(event.startTime)}</p>
      <p className="mt-0.5 text-sm text-muted">
        {event.venue}, {event.city}
      </p>
      <p className="mt-3 text-sm">
        <span className="font-medium">{formatPrice(event.pricePaise)}</span>
        <span className="text-muted"> per seat</span>
      </p>
    </Link>
  );
}
