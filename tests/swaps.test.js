import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeHousehold } from './helpers.js';
import { today } from '../public/js/dates.js';

let server;
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { await server.close(); });

// Alex (admin), Sam, Jamie. Sam has an unfinished "Take out trash".
async function setup() {
  const house = await makeHousehold(server.base, ['Alex', 'Sam', 'Jamie']);
  const [alex, sam, jamie] = [house.admin, ...house.members];
  const [alexId, samId, jamieId] = house.users.map((u) => u.id);
  const chore = (await alex.req('POST', '/api/chores', { title: 'Take out trash', frequency: 'weekly' })).body;
  const assignment = (await alex.req('POST', '/api/assignments', { choreId: chore.id, userId: samId, dueDate: today() })).body;
  return { alex, sam, jamie, alexId, samId, jamieId, chore, assignment };
}

async function viewOf(c, assignmentId) {
  return (await c.req('GET', '/api/assignments')).body.find((a) => a.id === assignmentId);
}

test('request → accept moves the assignment to the target', async () => {
  const { sam, jamie, jamieId, assignment } = await setup();
  const req = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId, message: 'Exam on Tuesday!' });
  assert.equal(req.status, 201);
  assert.equal(req.body.status, 'pending');

  const pending = await viewOf(sam, assignment.id);
  assert.equal(pending.pendingSwap.targetName, 'Jamie');
  assert.equal(pending.userName, 'Sam'); // still Sam's until accepted

  const acc = await jamie.req('POST', `/api/swaps/${req.body.id}/accept`);
  assert.equal(acc.status, 200);
  const after = await viewOf(jamie, assignment.id);
  assert.equal(after.userName, 'Jamie');
  assert.equal(after.viaName, 'Sam');
  assert.equal(after.pendingSwap, null);
});

test('reject leaves it with the requester', async () => {
  const { sam, jamie, jamieId, assignment } = await setup();
  const { body: swap } = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId });
  const rej = await jamie.req('POST', `/api/swaps/${swap.id}/reject`);
  assert.equal(rej.status, 200);
  const view = await viewOf(sam, assignment.id);
  assert.equal(view.userName, 'Sam');
  assert.equal(view.pendingSwap, null);
});

test('cancel by requester', async () => {
  const { sam, jamie, jamieId, assignment } = await setup();
  const { body: swap } = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId });
  assert.equal((await jamie.req('POST', `/api/swaps/${swap.id}/cancel`)).status, 403);
  assert.equal((await sam.req('POST', `/api/swaps/${swap.id}/accept`)).status, 403);
  assert.equal((await sam.req('POST', `/api/swaps/${swap.id}/cancel`)).status, 200);
  assert.equal((await viewOf(sam, assignment.id)).pendingSwap, null);
});

test('second pending request on the same assignment → 409; after a reject a new one is fine', async () => {
  const { sam, jamie, alexId, jamieId, assignment } = await setup();
  const first = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId });
  const second = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: alexId });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, 'This chore already has a pending request.');

  await jamie.req('POST', `/api/swaps/${first.body.id}/reject`);
  const third = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: alexId });
  assert.equal(third.status, 201);
});

test("cannot request a swap on someone else's or a completed chore", async () => {
  const { sam, jamie, alexId, assignment } = await setup();
  const notMine = await jamie.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: alexId });
  assert.equal(notMine.status, 403);

  await sam.req('POST', `/api/assignments/${assignment.id}/complete`);
  const done = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: alexId });
  assert.equal(done.status, 409);
});

test('cannot target yourself or a non-member', async () => {
  const { sam, samId, assignment } = await setup();
  const self = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: samId });
  assert.equal(self.status, 400);
  assert.equal(self.body.field, 'targetUserId');

  const other = await makeHousehold(server.base, ['Robin'], 'Other flat');
  const outsider = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: other.users[0].id });
  assert.equal(outsider.status, 400);
  assert.equal(outsider.body.field, 'targetUserId');
});

test('message longer than 200 characters is a field error', async () => {
  const { sam, jamieId, assignment } = await setup();
  const res = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId, message: 'x'.repeat(201) });
  assert.equal(res.status, 400);
  assert.equal(res.body.field, 'message');
});

test('accept after cancel → 409 with exact copy, assignment unchanged', async () => {
  const { sam, jamie, jamieId, assignment } = await setup();
  const { body: swap } = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId });
  await sam.req('POST', `/api/swaps/${swap.id}/cancel`);
  const acc = await jamie.req('POST', `/api/swaps/${swap.id}/accept`);
  assert.equal(acc.status, 409);
  assert.equal(acc.body.error, 'This request is no longer available.');
  assert.equal((await viewOf(sam, assignment.id)).userName, 'Sam');
});

test('reject or cancel twice → 409', async () => {
  const { sam, jamie, jamieId, assignment } = await setup();
  const { body: swap } = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId });
  await jamie.req('POST', `/api/swaps/${swap.id}/reject`);
  assert.equal((await jamie.req('POST', `/api/swaps/${swap.id}/reject`)).status, 409);
  assert.equal((await sam.req('POST', `/api/swaps/${swap.id}/cancel`)).status, 409);
});

test('accept after admin reassign → 409', async () => {
  const { alex, sam, jamie, alexId, jamieId, assignment } = await setup();
  const { body: swap } = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId });
  await alex.req('PATCH', `/api/assignments/${assignment.id}`, { userId: alexId });
  const acc = await jamie.req('POST', `/api/swaps/${swap.id}/accept`);
  assert.equal(acc.status, 409);
  assert.equal((await viewOf(alex, assignment.id)).userName, 'Alex');
});

test('accept is refused if the assignment changed hands without the swap noticing', async () => {
  // Defensive check: even if a swap were still pending, accept only works
  // while the chore is still the requester's and unfinished.
  const { sam, jamie, jamieId, assignment } = await setup();
  const { body: swap } = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId });
  server.db.prepare("UPDATE assignments SET status = 'completed' WHERE id = ?").run(assignment.id);
  const acc = await jamie.req('POST', `/api/swaps/${swap.id}/accept`);
  assert.equal(acc.status, 409);
  const status = server.db.prepare('SELECT status FROM swap_requests WHERE id = ?').get(swap.id).status;
  assert.equal(status, 'pending'); // rolled back, not half-accepted
});

test('swap from another household → 404', async () => {
  const { sam, jamieId, assignment } = await setup();
  const { body: swap } = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId });
  const other = await makeHousehold(server.base, ['Robin'], 'Other flat');
  assert.equal((await other.admin.req('POST', `/api/swaps/${swap.id}/accept`)).status, 404);
  assert.equal((await other.admin.req('POST', `/api/swaps/${swap.id}/cancel`)).status, 404);
  assert.equal((await other.admin.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: other.users[0].id })).status, 404);
});

test('a household member who is not part of the swap gets 404', async () => {
  const { sam, alex, jamieId, assignment } = await setup();
  const { body: swap } = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId });
  assert.equal((await alex.req('POST', `/api/swaps/${swap.id}/accept`)).status, 404);
});

test('GET /api/swaps splits incoming and sent', async () => {
  const { sam, jamie, jamieId, assignment } = await setup();
  const { body: swap } = await sam.req('POST', '/api/swaps', { assignmentId: assignment.id, targetUserId: jamieId, message: 'Please!' });

  const forJamie = (await jamie.req('GET', '/api/swaps')).body;
  assert.equal(forJamie.sent.length, 0);
  assert.equal(forJamie.incoming.length, 1);
  assert.deepEqual(
    { ...forJamie.incoming[0], createdAt: undefined },
    { id: swap.id, assignmentId: assignment.id, choreTitle: 'Take out trash', dueDate: today(),
      requesterName: 'Sam', message: 'Please!', createdAt: undefined },
  );

  const forSam = (await sam.req('GET', '/api/swaps')).body;
  assert.equal(forSam.incoming.length, 0);
  assert.equal(forSam.sent[0].targetName, 'Jamie');
  assert.equal(forSam.sent[0].choreTitle, 'Take out trash');
});
