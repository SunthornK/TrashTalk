import express from 'express';
import { fileURLToPath } from 'node:url';
import { HttpError } from './errors.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

// Builds the Express app without starting it, so tests can run it on a
// random port with an in-memory database.
export function createApp(db) {
  const app = express();

  app.use(express.json());
  app.use('/api', requireJsonBody);
  app.use(express.static(publicDir));

  // Routers are mounted here by later tasks.

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}

// The API only accepts JSON bodies. Together with SameSite cookies this
// stops other websites from submitting forms to our API.
function requireJsonBody(req, res, next) {
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'];
  if (hasBody && !req.is('application/json')) {
    return res.status(415).json({ error: 'Requests must be JSON' });
  }
  next();
}

function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, field: err.field });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong, try again' });
}
