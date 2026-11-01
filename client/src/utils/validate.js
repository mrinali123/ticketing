// Simple checks for the auth forms. The backend validates too; these just give faster feedback.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export function validateLogin({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Enter your email.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = "That doesn't look like an email.";
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

export function validateRegister({ name, email, password }) {
  const errors = validateLogin({ email, password });
  if (!name.trim()) errors.name = 'Enter your name.';
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return errors;
}
