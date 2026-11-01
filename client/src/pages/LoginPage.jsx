import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import Button from '../components/Button.jsx';
import TextField from '../components/TextField.jsx';
import Notice from '../components/Notice.jsx';
import { validateLogin } from '../utils/validate.js';
import useTitle from '../hooks/useTitle.js';
import useInFlight from '../hooks/useInFlight.js';

export default function LoginPage() {
  useTitle('Log in');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, runOnce] = useInFlight(); // one login request at a time

  // Where to go after logging in: the page that sent us here, or the events list
  const redirectTo = location.state?.from?.pathname || '/';

  if (user) return <Navigate to={redirectTo} replace />;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((errs) => ({ ...errs, [name]: undefined })); // clear that field's error as they type
  }

  function handleSubmit(e) {
    e.preventDefault();

    // runOnce ignores repeat submits while a login request is still running
    runOnce(async () => {
      setServerError('');
      const found = validateLogin(form);
      setErrors(found);
      if (Object.keys(found).length > 0) return;

      try {
        await login(form.email.trim(), form.password);
        navigate(redirectTo, { replace: true });
      } catch (err) {
        setServerError(err.message); // e.g. "Invalid email or password"
      }
    });
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl">Log in</h1>
      <p className="mt-1 text-sm text-muted">Use the email you signed up with.</p>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-5 space-y-4 rounded-md border border-line bg-white p-5"
      >
        {searchParams.get('expired') && !serverError && (
          <Notice>Your session ran out. Log in again to carry on.</Notice>
        )}
        {serverError && <Notice type="error">{serverError}</Notice>}

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
          autoComplete="current-password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
        />

        <Button type="submit" loading={submitting} loadingText="Logging in..." className="w-full">
          Log in
        </Button>
      </form>

      <p className="mt-4 text-sm text-muted">
        No account yet? <Link to="/register">Sign up</Link>
      </p>
    </div>
  );
}
