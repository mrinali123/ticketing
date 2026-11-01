// Turns CLIENT_URL into the list of origins allowed to call the API from a browser.
// "https://myseat.vercel.app, https://myseat-git-main.vercel.app/" ->
//   ['https://myseat.vercel.app', 'https://myseat-git-main.vercel.app']
export function parseAllowedOrigins(value) {
  return (value || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, '')) // a trailing slash would never match
    .filter(Boolean);
}
