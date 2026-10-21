import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, makeHousehold } from './helpers.js';

let server;
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { await server.close(); });

async function register(name) {
  const c = client(server.base);
  await c.req('POST', '/api/register', { name, email: `${name.toLowerCase()}@example.com`, password: 'password123' });
  return c;
}

test('creating a household makes you admin', async () => {
  const alex = await register('Alex');
  const res = await alex.req('POST', '/api/households', { name: 'Flat 4B' });
  assert.equal(res.status, 201);
  const me = await alex.req('GET', '/api/me');
  assert.equal(me.body.role, 'admin');
  assert.equal(me.body.householdName, 'Flat 4B');

  const again = await alex.req('POST', '/api/households', { name: 'Second flat' });
  assert.equal(again.status, 409);
});

test('household name is required', async () => {
  const alex = await register('Alex');
  const res = await alex.req('POST', '/api/households', { name: ' ' });
  assert.equal(res.status, 400);
  assert.equal(res.body.field, 'name');
});

test('no-household user gets 403 on GET /api/household', async () => {
  const kim = await register('Kim');
  const res = await kim.req('GET', '/api/household');
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Join a household first');
});

test('GET /api/household lists members and chores', async () => {
  const { admin } = await makeHousehold(server.base, ['Alex', 'Sam']);
  const res = await admin.req('GET', '/api/household');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Flat 4B');
  assert.deepEqual(res.body.members.map((m) => [m.name, m.role]), [['Alex', 'admin'], ['Sam', 'member']]);
  assert.deepEqual(res.body.chores, []);
});

test('admin adds by email (any case)', async () => {
  const { admin } = await makeHousehold(server.base, ['Alex']);
  const sam = await register('Sam');
  const res = await admin.req('POST', '/api/household/members', { email: 'SAM@example.com' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'Sam');
  assert.equal((await sam.req('GET', '/api/me')).body.householdName, 'Flat 4B');
});

test('unknown email → 404 field email', async () => {
  const { admin } = await makeHousehold(server.base, ['Alex']);
  const res = await admin.req('POST', '/api/household/members', { email: 'nobody@example.com' });
  assert.equal(res.status, 404);
  assert.equal(res.body.field, 'email');
  assert.equal(res.body.error, 'No account with that email. Ask them to create an account first.');
});

test('already-in-household → 409', async () => {
  const { admin } = await makeHousehold(server.base, ['Alex', 'Sam']);
  await makeHousehold(server.base, ['Jamie', 'Robin'], 'Other flat');
  const res = await admin.req('POST', '/api/household/members', { email: 'robin@example.com' });
  assert.equal(res.status, 409);
  assert.equal(res.body.field, 'email');
  assert.equal(res.body.error, 'That person is already in a household.');
});

test('member cannot add members', async () => {
  const { members } = await makeHousehold(server.base, ['Alex', 'Sam']);
  await register('Jamie');
  const res = await members[0].req('POST', '/api/household/members', { email: 'jamie@example.com' });
  assert.equal(res.status, 403);
});

test('make-admin swaps roles', async () => {
  const { admin, members, users } = await makeHousehold(server.base, ['Alex', 'Sam']);
  const res = await admin.req('POST', `/api/household/members/${users[1].id}/make-admin`);
  assert.equal(res.status, 200);
  assert.equal((await admin.req('GET', '/api/me')).body.role, 'member');
  assert.equal((await members[0].req('GET', '/api/me')).body.role, 'admin');
  const admins = server.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
  assert.equal(admins, 1);
});

test('admin cannot leave', async () => {
  const { admin, users } = await makeHousehold(server.base, ['Alex', 'Sam']);
  const res = await admin.req('DELETE', `/api/household/members/${users[0].id}`);
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'Make someone else admin first.');
});

test('member cannot remove someone else', async () => {
  const { members, users } = await makeHousehold(server.base, ['Alex', 'Sam', 'Jamie']);
  const res = await members[0].req('DELETE', `/api/household/members/${users[2].id}`);
  assert.equal(res.status, 403);
});

test('admin cannot remove someone from another household', async () => {
  const { admin } = await makeHousehold(server.base, ['Alex', 'Sam']);
  const other = await makeHousehold(server.base, ['Jamie', 'Robin'], 'Other flat');
  const res = await admin.req('DELETE', `/api/household/members/${other.users[1].id}`);
  assert.equal(res.status, 404);
});

test('member leaving unassigns unfinished chores, keeps completed ones, cancels pending swaps', async () => {
  const { members, users } = await makeHousehold(server.base, ['Alex', 'Sam', 'Jamie']);
  const [alexId, samId, jamieId] = users.map((u) => u.id);
  const db = server.db;
  const now = new Date().toISOString();
  const choreId = Number(db.prepare(
    "INSERT INTO chores (household_id, title, frequency, created_at) VALUES (?, 'Trash', 'weekly', ?)"
  ).run(users[0].householdId, now).lastInsertRowid);
  const addAssignment = db.prepare(
    'INSERT INTO assignments (chore_id, user_id, due_date, status, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const open = Number(addAssignment.run(choreId, samId, '2026-10-22', 'assigned', null, now).lastInsertRowid);
  const done = Number(addAssignment.run(choreId, samId, '2026-10-15', 'completed', now, now).lastInsertRowid);
  const alexOpen = Number(addAssignment.run(choreId, alexId, '2026-10-23', 'assigned', null, now).lastInsertRowid);
  const swapFromSam = Number(db.prepare(
    "INSERT INTO swap_requests (assignment_id, requester_id, target_user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
  ).run(open, samId, jamieId, now).lastInsertRowid);
  const swapToSam = Number(db.prepare(
    "INSERT INTO swap_requests (assignment_id, requester_id, target_user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
  ).run(alexOpen, alexId, samId, now).lastInsertRowid);

  const res = await members[0].req('DELETE', `/api/household/members/${samId}`);
  assert.equal(res.status, 204);

  const get = db.prepare('SELECT user_id, status FROM assignments WHERE id = ?');
  assert.equal(get.get(open).user_id, null);
  assert.equal(get.get(done).user_id, samId);
  assert.equal(get.get(alexOpen).user_id, alexId);
  const swapStatus = db.prepare('SELECT status, resolved_at FROM swap_requests WHERE id = ?');
  assert.equal(swapStatus.get(swapFromSam).status, 'cancelled');
  assert.equal(swapStatus.get(swapToSam).status, 'cancelled');
  assert.ok(swapStatus.get(swapToSam).resolved_at);

  const me = await members[0].req('GET', '/api/me');
  assert.equal(me.body.householdId, null);
  assert.equal(me.body.role, 'member');
});
