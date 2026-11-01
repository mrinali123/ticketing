import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import Button from '../components/Button.jsx';
import Notice from '../components/Notice.jsx';
import TextField from '../components/TextField.jsx';
import { Loading, PageError } from '../components/PageState.jsx';
import useFetch from '../hooks/useFetch.js';
import useTitle from '../hooks/useTitle.js';
import useInFlight from '../hooks/useInFlight.js';
import {
  emptyForm,
  formFromEvent,
  fromLocalInput,
  MAX_ROWS,
  MAX_SEATS_PER_ROW,
  toLocalInput,
  toPaise,
  validateEventForm,
} from '../utils/eventForm.js';

// One page for both /organiser/new and /organiser/events/:id/edit
export default function EventFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  useTitle(editing ? 'Edit event' : 'New event');

  // Only fetch when editing (a null path means "don't fetch")
  const { data, error, reload } = useFetch(editing ? `/api/events/${id}` : null);
  const { user } = useAuth();

  if (!editing) return <EventForm />;

  if (error) {
    const notFound = error.status === 404 || error.status === 400;
    return (
      <PageError
        title={notFound ? 'Event not found' : "Couldn't load this event"}
        message={notFound ? undefined : error.message}
        onRetry={notFound ? undefined : reload}
        backTo="/organiser"
        backLabel="Back to your events"
      />
    );
  }
  if (!data) return <Loading>Loading event...</Loading>;

  const { event } = data;
  // event.organiser comes back populated ({ _id, name, ... }), so compare its _id
  if ((event.organiser?._id ?? event.organiser) !== user._id) {
    return (
      <PageError
        title="Not your event"
        message="You can only edit events you created."
        backTo="/organiser"
        backLabel="Back to your events"
      />
    );
  }
  if (event.status === 'cancelled') {
    return (
      <PageError
        title="This event is cancelled"
        message="Cancelled events can't be edited."
        backTo="/organiser"
        backLabel="Back to your events"
      />
    );
  }

  // key: start with fresh form values if the organiser opens a different event
  return <EventForm key={event._id} event={event} />;
}

function EventForm({ event }) {
  const editing = Boolean(event);
  const navigate = useNavigate();

  // The form's starting values come straight from props, so no effect is needed to copy them in
  const [initial] = useState(() => (editing ? formFromEvent(event) : emptyForm()));
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  // One save at a time. Without this, a double submit on "Create event" would create two
  // identical events (there's no unique rule to stop it), each with its own seats.
  const [saving, runOnce] = useInFlight();

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((errs) => ({ ...errs, [name]: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    runOnce(async () => {
      setServerError('');
      const found = validateEventForm(form, { editing, originalStartTime: initial.startTime });
      setErrors(found);
      if (Object.keys(found).length > 0) return;

      const body = {
        title: form.title.trim(),
        venue: form.venue.trim(),
        city: form.city.trim(),
        startTime: fromLocalInput(form.startTime),
        pricePaise: toPaise(form.price),
      };

      try {
        if (editing) {
          await api(`/api/events/${event._id}`, { method: 'PATCH', body });
          navigate('/organiser', { state: { flash: `Saved changes to "${body.title}".` } });
        } else {
          // The success message uses the seat count the server actually created
          const created = await api('/api/events', {
            method: 'POST',
            body: { ...body, rows: Number(form.rows), seatsPerRow: Number(form.seatsPerRow) },
          });
          navigate('/organiser', {
            state: {
              flash: `Created "${created.title}" with ${created.rows * created.seatsPerRow} seats.`,
            },
          });
        }
      } catch (err) {
        setServerError(err.message); // e.g. a schema rule the form didn't catch, or a 403
      }
    });
  }

  const seatCount =
    Number(form.rows) > 0 && Number(form.seatsPerRow) > 0
      ? Number(form.rows) * Number(form.seatsPerRow)
      : null;

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm">
        <Link to="/organiser">Your events</Link>
      </p>
      <h1 className="mt-3 text-xl">{editing ? 'Edit event' : 'New event'}</h1>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-5 space-y-4 rounded-md border border-line bg-white p-4 sm:p-5"
      >
        {serverError && <Notice type="error">{serverError}</Notice>}

        <TextField
          label="Title"
          name="title"
          value={form.title}
          onChange={handleChange}
          error={errors.title}
          maxLength={120}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Venue"
            name="venue"
            value={form.venue}
            onChange={handleChange}
            error={errors.venue}
          />
          <TextField
            label="City"
            name="city"
            value={form.city}
            onChange={handleChange}
            error={errors.city}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Date and time"
            name="startTime"
            type="datetime-local"
            value={form.startTime}
            onChange={handleChange}
            error={errors.startTime}
            min={toLocalInput(new Date())}
          />
          <TextField
            label="Price per seat (₹)"
            name="price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.price}
            onChange={handleChange}
            error={errors.price}
            hint="0 for a free event."
          />
        </div>

        <fieldset className="rounded border border-line p-3 sm:p-4">
          <legend className="px-1 text-sm font-medium">Seat layout</legend>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Rows"
              name="rows"
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_ROWS}
              value={form.rows}
              onChange={handleChange}
              error={errors.rows}
              readOnly={editing}
              hint={
                editing
                  ? undefined
                  : `A to ${String.fromCharCode(64 + MAX_ROWS)}, up to ${MAX_ROWS}.`
              }
            />
            <TextField
              label="Seats per row"
              name="seatsPerRow"
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_SEATS_PER_ROW}
              value={form.seatsPerRow}
              onChange={handleChange}
              error={errors.seatsPerRow}
              readOnly={editing}
              hint={editing ? undefined : `Up to ${MAX_SEATS_PER_ROW}.`}
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            {editing
              ? "The layout can't change after an event is created: its seats already exist and people may have booked them."
              : seatCount && `That's ${seatCount} seats. You can't change the layout later.`}
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <Button
            type="submit"
            loading={saving}
            loadingText={editing ? 'Saving...' : 'Creating...'}
            className="w-full sm:w-auto"
          >
            {editing ? 'Save changes' : 'Create event'}
          </Button>
          <Link to="/organiser" className="text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
