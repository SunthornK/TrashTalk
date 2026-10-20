import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, transaction } from '../server/db.js';
import { startServer } from './helpers.js';

test('schema creates all six tables', () => {
  const db = openDb(':memory:');
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
  for (const table of ['households', 'users', 'sessions', 'chores', 'assignments', 'swap_requests']) {
    assert.ok(names.includes(table), `missing table ${table}`);
  }
});

test('one_pending_swap allows only one pending request per assignment', () => {
  const db = openDb(':memory:');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO households (id, name, created_at) VALUES (1, ?, ?)').run('Flat 4B', now);
  const addUser = db.prepare(
    'INSERT INTO users (id, name, email, password_hash, household_id, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  );
  addUser.run(1, 'Alex', 'alex@example.com', 'x', now);
  addUser.run(2, 'Sam', 'sam@example.com', 'x', now);
  db.prepare("INSERT INTO chores (id, household_id, title, frequency, created_at) VALUES (1, 1, 'Trash', 'weekly', ?)").run(now);
  db.prepare("INSERT INTO assignments (id, chore_id, user_id, due_date, created_at) VALUES (1, 1, 1, '2026-10-20', ?)").run(now);

  const addSwap = db.prepare(
    'INSERT INTO swap_requests (assignment_id, requester_id, target_user_id, status, created_at) VALUES (1, 1, 2, ?, ?)'
  );
  addSwap.run('pending', now);
  assert.throws(() => addSwap.run('pending', now), /UNIQUE/);
  assert.doesNotThrow(() => addSwap.run('rejected', now));
});

test('transaction rolls back on throw', () => {
  const db = openDb(':memory:');
  assert.throws(() =>
    transaction(db, () => {
      db.prepare("INSERT INTO households (name, created_at) VALUES ('Flat 4B', 'now')").run();
      throw new Error('boom');
    })
  , /boom/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM households').get().n, 0);
});

test('unknown api route returns JSON 404', async () => {
  const server = await startServer();
  try {
    const res = await fetch(server.base + '/api/nope');
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'Not found');
  } finally {
    await server.close();
  }
});

test('POST without JSON content type is rejected', async () => {
  const server = await startServer();
  try {
    const res = await fetch(server.base + '/api/nope', { method: 'POST', body: 'x' });
    assert.equal(res.status, 415);
  } finally {
    await server.close();
  }
});
