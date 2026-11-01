import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import Button from '../components/Button.jsx';
import TextField from '../components/TextField.jsx';
import Notice from '../components/Notice.jsx';
import { MIN_PASSWORD_LENGTH, validateRegister } from '../utils/validate.js';
import useTitle from '../hooks/useTitle.js';
import useInFlight from '../hooks/useInFlight.js';

export default function RegisterPage() {
  useTitle('Create an account');
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [createdButNotLoggedIn, setCreatedButNotLoggedIn] = useState(false);
  const [submitting, runOnce] = useInFlight(); // one sign-up request at a time

  if (user) return <Navigate to="/" replace />;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((errs) => ({ ...errs, [name]: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    // runOnce ignores this whole function if a sign-up request is already running
    runOnce(async () => {
      setServerError('');
      const found = validateRegister(form);
      setErrors(found);
      if (Object.keys(found).length > 0) return;

      try {
        await register(form.name.trim(), form.email.trim(), form.password);
        navigate('/', { replace: true });
      } catch (err) {
        if (err.accountCreated) {
          // Sign-up worked; only the automatic login after it failed
          setCreatedButNotLoggedIn(true);
        } else if (err.status === 409) {
          // email taken: show it next to the email field
          setErrors({ email: 'That email already has an account. Try logging in instead.' });
        } else {
          setServerError(err.message);
        }
      }
    });
  }

  if (createdButNotLoggedIn) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="text-xl">Account created</h1>
        <p className="mt-2 text-sm text-muted">
          Your account for <span className="text-ink">{form.email.trim()}</span> is ready, but we
          couldn't log you in automatically. Log in with the password you just chose.
        </p>
        <p className="mt-4 text-sm">
          <Link to="/login">Go to log in</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl">Create an account</h1>
      <p className="mt-1 text-sm text-muted">You need one to book seats.</p>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-5 space-y-4 rounded-md border border-line bg-white p-5"
      >
        {serverError && <Notice type="error">{serverError}</Notice>}

        <TextField
          label="Name"
          name="name"
          autoComplete="name"
          value={form.name}
          onChange={handleChange}
          error={errors.name}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />

        <Button
          type="submit"
          loading={submitting}
          loadingText="Creating account..."
          className="w-full"
        >
          Create account
        </Button>
      </form>

      <p className="mt-4 text-sm text-muted">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
      <p className="mt-2 text-sm text-muted">
        Want to host events? Create an account, then switch to an organiser account.
      </p>
    </div>
  );
}
