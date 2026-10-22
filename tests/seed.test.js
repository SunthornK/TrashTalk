import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../server/seed.js';
import { assignmentsQuery, swapsQuery } from '../server/views.js';
import { today } from '../public/js/dates.js';
import { startServer, client } from './helpers.js';

test('seed gives the demo every state', async () => {
  const server = await startServer();
  try {
    const db = server.db;
    seed(db, today());
    const flat = db.prepare("SELECT id FROM households WHERE name = 'Flat 4B'").get();
    assert.ok(flat);

    const all = assignmentsQuery(db, flat.id);
    assert.ok(all.some((a) => a.overdue), 'something overdue');
    assert.equal(all.filter((a) => a.pendingSwap !== null).length, 2, 'two pending swaps');
    assert.ok(all.some((a) => a.userId === null && a.status === 'assigned'), 'a Nobody chore');
    assert.ok(all.some((a) => a.status === 'completed'), 'something done');

    const users = Object.fromEntries(db.prepare('SELECT name, role, household_id FROM users').all().map((u) => [u.name, u]));
    assert.equal(users.Alex.role, 'admin');
    assert.equal(users.Kim.household_id, null);

    const alexId = db.prepare("SELECT id FROM users WHERE name = 'Alex'").get().id;
    const alexSwaps = swapsQuery(db, alexId);
    assert.ok(alexSwaps.incoming.length >= 1, 'Alex has a request to answer');
    assert.ok(alexSwaps.sent.length >= 1, 'Alex is waiting on someone');

    const login = await client(server.base).req('POST', '/api/login', { email: 'alex@example.com', password: 'password123' });
    assert.equal(login.status, 200);
  } finally {
    await server.close();
  }
});

test('seeding twice starts from scratch', async () => {
  const server = await startServer();
  try {
    seed(server.db, today());
    seed(server.db, today());
    assert.equal(server.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 5);
  } finally {
    await server.close();
  }
});
