// Environment variables the server can't run without
export const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN'];

// Returns the names that are missing or empty. Whitespace-only counts as empty
// (e.g. "JWT_SECRET= " in a .env file).
export function findMissingEnv(names = REQUIRED_ENV, env = process.env) {
  return names.filter((name) => !env[name] || env[name].trim() === '');
}
