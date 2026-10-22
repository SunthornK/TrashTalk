import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeHousehold } from './helpers.js';
import { today, addDays } from '../public/js/dates.js';

let server;
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { await server.close(); });

async function setup() {
  const house = await makeHousehold(server.base, ['Alex', 'Sam', 'Jamie']);
  const chore = (await house.admin.req('POST', '/api/chores', { title: 'Take out trash', frequency: 'weekly' })).body;
  async function assign(userIndex, dueDate) {
    const res = await house.admin.req('POST', '/api/assignments', {
      choreId: chore.id, userId: house.users[userIndex].id, dueDate,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
  }
  return { ...house, chore, assign };
}

async function list(c) {
  return (await c.req('GET', '/api/assignments')).body;
}

test('admin creates a chore; bad input is a field error', async () => {
  const { admin } = await makeHousehold(server.base, ['Alex']);
  const ok = await admin.req('POST', '/api/chores', { title: 'Mop kitchen', frequency: 'weekly' });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.body, { id: ok.body.id, title: 'Mop kitchen', frequency: 'weekly' });

  const noTitle = await admin.req('POST', '/api/chores', { title: '', frequency: 'weekly' });
  assert.equal(noTitle.status, 400);
  assert.equal(noTitle.body.field, 'title');
  const badFreq = await admin.req('POST', '/api/chores', { title: 'X', frequency: 'yearly' });
  assert.equal(badFreq.status, 400);
  assert.equal(badFreq.body.field, 'frequency');
});

test('due today is not overdue, due yesterday is', async () => {
  const { admin, assign } = await setup();
  const dueToday = await assign(0, today());
  const dueYesterday = await assign(1, addDays(today(), -1));
  const all = await list(admin);
  assert.equal(all.find((a) => a.id === dueToday.id).overdue, false);
  assert.equal(all.find((a) => a.id === dueYesterday.id).overdue, true);
});

test('assignment view has names and status fields', async () => {
  const { admin, assign } = await setup();
  const a = await assign(1, today());
  assert.equal(a.choreTitle, 'Take out trash');
  assert.equal(a.userName, 'Sam');
  assert.equal(a.status, 'assigned');
  assert.equal(a.pendingSwap, null);
});

test('the list is every unfinished turn + the latest completed one per chore', async () => {
  const { admin, members, assign } = await setup();
  const old = await assign(1, '2026-10-05');
  const latest = await assign(1, '2026-10-12');
  const open = await assign(2, '2026-10-19');
  await members[0].req('POST', `/api/assignments/${old.id}/complete`);
  await members[0].req('POST', `/api/assignments/${latest.id}/complete`);
  const ids = (await list(admin)).map((a) => a.id).sort();
  assert.deepEqual(ids, [latest.id, open.id].sort());
});

test('member cannot create chores or assignments', async () => {
  const { members, chore, users } = await setup();
  assert.equal((await members[0].req('POST', '/api/chores', { title: 'X', frequency: 'weekly' })).status, 403);
  const res = await members[0].req('POST', '/api/assignments', { choreId: chore.id, userId: users[1].id, dueDate: today() });
  assert.equal(res.status, 403);
});

test('assigning to someone outside the household is a field error', async () => {
  const { admin, chore } = await setup();
  const other = await makeHousehold(server.base, ['Robin'], 'Other flat');
  const res = await admin.req('POST', '/api/assignments', { choreId: chore.id, userId: other.users[0].id, dueDate: today() });
  assert.equal(res.status, 400);
  assert.equal(res.body.field, 'userId');
  const badDate = await admin.req('POST', '/api/assignments', { choreId: chore.id, userId: 1, dueDate: '20/10/2026' });
  assert.equal(badDate.status, 400);
  assert.equal(badDate.body.field, 'dueDate');
});

test('only the assignee can complete', async () => {
  const { admin, members, assign } = await setup();
  const a = await assign(1, today());
  assert.equal((await admin.req('POST', `/api/assignments/${a.id}/complete`)).status, 403);
  assert.equal((await members[1].req('POST', `/api/assignments/${a.id}/complete`)).status, 403);
  assert.equal((await members[0].req('POST', `/api/assignments/${a.id}/complete`)).status, 200);
  assert.equal((await members[0].req('POST', `/api/assignments/${a.id}/complete`)).status, 409);
});

function addPendingSwap(assignmentId, requesterId, targetId) {
  return Number(server.db.prepare(
    "INSERT INTO swap_requests (assignment_id, requester_id, target_user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
  ).run(assignmentId, requesterId, targetId, new Date().toISOString()).lastInsertRowid);
}
const swapStatus = (id) => server.db.prepare('SELECT status FROM swap_requests WHERE id = ?').get(id).status;

test('completing cancels a pending swap', async () => {
  const { members, assign, users } = await setup();
  const a = await assign(1, today());
  const swapId = addPendingSwap(a.id, users[1].id, users[2].id);
  await members[0].req('POST', `/api/assignments/${a.id}/complete`);
  assert.equal(swapStatus(swapId), 'cancelled');
});

test('reassign cancels a pending swap and moves the chore', async () => {
  const { admin, assign, users } = await setup();
  const a = await assign(1, today());
  const swapId = addPendingSwap(a.id, users[1].id, users[2].id);
  const res = await admin.req('PATCH', `/api/assignments/${a.id}`, { userId: users[0].id });
  assert.equal(res.status, 200);
  assert.equal(res.body.userName, 'Alex');
  assert.equal(res.body.pendingSwap, null);
  assert.equal(swapStatus(swapId), 'cancelled');
});

test('pendingSwap shows who was asked', async () => {
  const { admin, assign, users } = await setup();
  const a = await assign(1, today());
  const swapId = addPendingSwap(a.id, users[1].id, users[2].id);
  const view = (await list(admin)).find((x) => x.id === a.id);
  assert.deepEqual(view.pendingSwap, { id: swapId, targetUserId: users[2].id, targetName: 'Jamie' });
});

test('admin edits a chore; bad input is a field error', async () => {
  const { admin, chore } = await setup();
  const ok = await admin.req('PATCH', `/api/chores/${chore.id}`, { title: 'Bins', frequency: 'daily' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { id: chore.id, title: 'Bins', frequency: 'daily' });
  const bad = await admin.req('PATCH', `/api/chores/${chore.id}`, { title: '  ', frequency: 'daily' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, 'title');
});

test('deleting a chore removes its turns and their swap requests', async () => {
  const { admin, members, assign, chore, users } = await setup();
  const done = await assign(1, '2026-10-12');
  await members[0].req('POST', `/api/assignments/${done.id}/complete`);
  const open = await assign(1, today());
  addPendingSwap(open.id, users[1].id, users[2].id);

  assert.equal((await members[0].req('DELETE', `/api/chores/${chore.id}`)).status, 403);
  assert.equal((await admin.req('DELETE', `/api/chores/${chore.id}`)).status, 204);
  assert.deepEqual(await list(admin), []);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS n FROM swap_requests').get().n, 0);
  assert.deepEqual((await admin.req('GET', '/api/household')).body.chores, []);
});

test("another household's assignment is 404", async () => {
  const { assign } = await setup();
  const a = await assign(1, today());
  const other = await makeHousehold(server.base, ['Robin'], 'Other flat');
  assert.equal((await other.admin.req('PATCH', `/api/assignments/${a.id}`, { userId: other.users[0].id })).status, 404);
  assert.equal((await other.admin.req('POST', `/api/assignments/${a.id}/complete`)).status, 404);
  assert.equal((await other.admin.req('DELETE', `/api/chores/${a.choreId}`)).status, 404);
  assert.deepEqual(await list(other.admin), []);
});

test('impossible dates are refused', async () => {
  const { admin, chore, users } = await setup();
  const res = await admin.req('POST', '/api/assignments', { choreId: chore.id, userId: users[0].id, dueDate: '2026-02-31' });
  assert.equal(res.status, 400);
  assert.equal(res.body.field, 'dueDate');
});
