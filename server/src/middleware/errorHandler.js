// Last stop for any request: unknown URLs get a JSON 404, and any error that reached Express
// (e.g. a broken JSON body) gets a JSON response instead of Express's default HTML page.

// 404 for any route nobody handled
export function notFound(req, res) {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
}

// Express recognises an error handler by its 4 arguments, so `next` must stay even if unused
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // express.json() couldn't parse the body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON' });
  }

  // Errors that carry their own status (e.g. httpError, body too large) keep it
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err); // full details go to the server log only

  const body = { message: status >= 500 ? 'Something went wrong' : err.message };
  // Stack traces help while developing, but would leak code paths and file names in production,
  // so they are only ever sent when NODE_ENV is exactly "development"
  if (process.env.NODE_ENV === 'development') body.stack = err.stack;

  return res.status(status).json(body);
}
