// Shared test utilities: start the app on a random port with an in-memory
// database, and a tiny HTTP client that remembers the session cookie.
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

export async function startServer() {
  const db = openDb(':memory:');
  const server = createApp(db).listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    db,
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export function client(base) {
  let cookie = '';
  return {
    async req(method, path, body) {
      const headers = {};
      if (cookie) headers.cookie = cookie;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const res = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        const pair = setCookie.split(';')[0];
        cookie = pair.endsWith('=') ? '' : pair;
      }
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
  };
}

// Filled in by Task 3, once the household routes exist.
export async function makeHousehold() {
  throw new Error('makeHousehold is not implemented yet');
}
