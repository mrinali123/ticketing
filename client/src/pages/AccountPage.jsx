import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import Button from '../components/Button.jsx';
import Notice from '../components/Notice.jsx';
import TextField from '../components/TextField.jsx';
import useTitle from '../hooks/useTitle.js';
import useInFlight from '../hooks/useInFlight.js';

const MIN_NAME = 2;
const MAX_NAME = 80; // same limits as the backend

export default function AccountPage() {
  useTitle('Your account');
  const { user } = useAuth();
  const isOrganiser = user.role === 'organiser';

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl">Your account</h1>

      <dl className="mt-5 divide-y divide-line rounded-md border border-line bg-white text-sm">
        <Row label="Name">{user.name}</Row>
        <Row label="Email">
          <span className="break-all">{user.email}</span>
        </Row>
        <Row label="Account type">{isOrganiser ? 'Organiser' : 'User'}</Row>
        {isOrganiser && user.organisationName && (
          <Row label="Organisation">{user.organisationName}</Row>
        )}
      </dl>

      {isOrganiser ? (
        <p className="mt-4 text-sm">
          <Link to="/organiser">Go to your events</Link>
        </p>
      ) : (
        <BecomeOrganiser />
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function BecomeOrganiser() {
  const { becomeOrganiser } = useAuth();
  const navigate = useNavigate();

  const [organisationName, setOrganisationName] = useState('');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  // One request at a time: a second "Switch" arriving after the first succeeded would get
  // 400 "already an organiser" and show an error for an upgrade that actually worked
  const [saving, runOnce] = useInFlight();

  function handleSubmit(e) {
    e.preventDefault();

    runOnce(async () => {
      setServerError('');
      const name = organisationName.trim();
      if (name.length < MIN_NAME) {
        setError(`Enter at least ${MIN_NAME} characters.`);
        return;
      }
      if (name.length > MAX_NAME) {
        setError(`Keep it under ${MAX_NAME} characters.`);
        return;
      }

      try {
        await becomeOrganiser(name);
        navigate('/organiser', { state: { flash: "You're now an organiser." } });
      } catch (err) {
        setServerError(err.message);
      }
    });
  }

  return (
    <section className="mt-8">
      <h2 className="text-base">Host events on MySeat</h2>
      <p className="mt-1 text-sm text-muted">
        Switch to an organiser account to create events with a seat map and see how many seats are
        sold. You can still book seats for other events as usual.
      </p>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-4 space-y-4 rounded-md border border-line bg-white p-4 sm:p-5"
      >
        {serverError && <Notice type="error">{serverError}</Notice>}

        <TextField
          label="Organisation name"
          name="organisationName"
          value={organisationName}
          onChange={(e) => {
            setOrganisationName(e.target.value);
            setError('');
          }}
          error={error}
          hint="Shown on your events, e.g. a venue, club or your own name."
          maxLength={MAX_NAME}
          autoComplete="organization"
        />

        <Button
          type="submit"
          loading={saving}
          loadingText="Switching..."
          className="w-full sm:w-auto"
        >
          Switch to organiser account
        </Button>
      </form>
    </section>
  );
}
