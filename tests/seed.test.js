import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../server/seed.js';
import { assignmentsQuery, swapsQuery } from '../server/views.js';
import { today, startOfWeek, addDays } from '../public/js/dates.js';
import { startServer, client } from './helpers.js';

test('seed gives the demo every state', async () => {
  const server = await startServer();
  try {
    const db = server.db;
    seed(db, today());
    const flat = db.prepare("SELECT id FROM households WHERE name = 'Flat 4B'").get();
    assert.ok(flat);

    const monday = startOfWeek(today());
    const all = assignmentsQuery(db, flat.id, { from: addDays(monday, -14), to: addDays(monday, 13) });
    assert.ok(all.some((a) => a.overdue), 'something overdue');
    assert.ok(all.some((a) => a.pendingSwap !== null), 'a pending swap');
    assert.ok(all.some((a) => a.userId === null && a.status === 'assigned'), 'a Nobody chore');
    assert.ok(all.some((a) => a.wasLate), 'a late completion');
    assert.ok(all.some((a) => a.viaName !== null), 'an accepted handoff');
    assert.ok(all.some((a) => a.userLeft && a.userName === 'Kim'), "Kim's history");
    assert.ok(all.some((a) => a.dueDate >= addDays(monday, 7)), 'something next week');

    const users = Object.fromEntries(db.prepare('SELECT name, role, household_id FROM users').all().map((u) => [u.name, u]));
    assert.equal(users.Alex.role, 'admin');
    assert.equal(users.Kim.household_id, null);

    const alexId = db.prepare("SELECT id FROM users WHERE name = 'Alex'").get().id;
    const alexSwaps = swapsQuery(db, alexId);
    assert.ok(alexSwaps.incoming.length >= 1, 'Alex has a request to answer');
    assert.ok(alexSwaps.sent.length >= 1, 'Alex is waiting on someone');

    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM chores WHERE active = 0').get().n >= 1, 'an archived chore');

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

// The demo week must have its key states on any day, especially Friday
// (presentation day) and Sunday, when "today + n" would spill into next week.
for (const day of ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-25']) {
  test(`seed keeps the demo states inside the current week (today = ${day})`, async () => {
    const server = await startServer();
    try {
      seed(server.db, day);
      const flat = server.db.prepare("SELECT id FROM households WHERE name = 'Flat 4B'").get();
      const monday = startOfWeek(day);
      const week = assignmentsQuery(server.db, flat.id, { from: monday, to: addDays(monday, 6) });
      assert.ok(week.some((a) => a.userId === null && a.status === 'assigned'), 'a Nobody chore this week');
      assert.equal(week.filter((a) => a.pendingSwap !== null).length, 2, 'two pending requests this week');
      assert.ok(week.some((a) => a.userName === 'Robin' && a.status === 'assigned'), "Robin's chore this week");
      const all = assignmentsQuery(server.db, flat.id);
      assert.ok(all.some((a) => a.userName === 'Alex' && a.status === 'assigned' && a.dueDate < day), 'Alex has something overdue');
    } finally {
      await server.close();
    }
  });
}
