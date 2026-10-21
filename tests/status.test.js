import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayStatus } from '../public/js/chores/status.js';

const ME = 1;
const base = {
  id: 10, choreId: 1, choreTitle: 'Trash', userId: 2, userName: 'Sam', userLeft: false,
  dueDate: '2026-10-22', status: 'assigned', completedAt: null,
  overdue: false, wasLate: false, pendingSwap: null, viaName: null,
};

test('To do', () => {
  assert.deepEqual(displayStatus(base, ME), { label: 'To do', kind: 'todo' });
});

test('Overdue', () => {
  assert.deepEqual(displayStatus({ ...base, overdue: true }, ME), { label: 'Overdue', kind: 'over' });
});

test('Waiting on Name', () => {
  const a = { ...base, pendingSwap: { id: 5, targetUserId: 3, targetName: 'Jamie' } };
  assert.deepEqual(displayStatus(a, ME), { label: 'Waiting on Jamie', kind: 'pend' });
});

test('Waiting on you', () => {
  const a = { ...base, pendingSwap: { id: 5, targetUserId: ME, targetName: 'Alex' } };
  assert.deepEqual(displayStatus(a, ME), { label: 'Waiting on you', kind: 'pend' });
});

test('overdue and waiting shows both', () => {
  const a = { ...base, overdue: true, pendingSwap: { id: 5, targetUserId: 3, targetName: 'Jamie' } };
  assert.deepEqual(displayStatus(a, ME), { label: 'Overdue · Waiting on Jamie', kind: 'pend' });
});

test('Nobody', () => {
  assert.deepEqual(displayStatus({ ...base, userId: null, userName: null }, ME), { label: 'Nobody', kind: 'none' });
});

test('Done', () => {
  const a = { ...base, status: 'completed', completedAt: '2026-10-22T10:00:00Z' };
  assert.deepEqual(displayStatus(a, ME), { label: 'Done', kind: 'done' });
});
