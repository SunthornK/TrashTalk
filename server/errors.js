// An error with an HTTP status. Route code throws these; the error handler
// in app.js turns them into `{ error, field? }` JSON responses.
export class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}
