// Creates an Error that carries an HTTP status, e.g. throw httpError(404, 'Event not found').
// Controllers check err.status and send it back as the response status.
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
