import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChoreCards, filterCards, sortCards } from '../public/js/chores/cards-view.js';

function a(overrides) {
  return {
    id: 1, choreId: 1, choreTitle: 'Trash', userId: 1, userName: 'Alex',
    dueDate: '2026-10-22', status: 'assigned', completedAt: null,
    overdue: false, pendingSwap: null, ...overrides,
  };
}

const chores = [
  { id: 1, title: 'Trash', frequency: 'weekly' },
  { id: 2, title: 'Bathroom', frequency: 'weekly' },
];

test('buildChoreCards: current is the earliest unfinished; upcoming are the later ones', () => {
  const assignments = [
    a({ id: 11, choreId: 1, dueDate: '2026-10-29' }),
    a({ id: 10, choreId: 1, dueDate: '2026-10-22' }),
    a({ id: 9, choreId: 1, dueDate: '2026-10-15', status: 'completed' }),
  ];
  const [trash] = buildChoreCards(chores, assignments);
  assert.equal(trash.chore.id, 1);
  assert.equal(trash.current.id, 10);
  assert.deepEqual(trash.upcoming.map((x) => x.id), [11]);
});

test('buildChoreCards: falls back to the latest completed, or null if never assigned', () => {
  const assignments = [
    a({ id: 20, choreId: 2, dueDate: '2026-10-08', status: 'completed' }),
    a({ id: 21, choreId: 2, dueDate: '2026-10-15', status: 'completed' }),
  ];
  const cards = buildChoreCards(chores, assignments);
  assert.deepEqual(cards.map((c) => c.chore.id), [1, 2]);
  assert.equal(cards[0].current, null);
  assert.equal(cards[1].current.id, 21);
});

test('filterCards: everyone, just me, waiting on someone', () => {
  const cards = buildChoreCards(chores, [
    a({ id: 1, choreId: 1, userId: 1 }),
    a({ id: 2, choreId: 2, userId: 2, pendingSwap: { id: 9, targetUserId: 3, targetName: 'Jamie' } }),
  ]);
  assert.equal(filterCards(cards, 'everyone', 1).length, 2);
  assert.deepEqual(filterCards(cards, 'mine', 1).map((c) => c.chore.id), [1]);
  assert.deepEqual(filterCards(cards, 'waiting', 1).map((c) => c.chore.id), [2]);
});

test('sortCards: by due date (nobody assigned last) or by name', () => {
  const cards = buildChoreCards([...chores, { id: 3, title: 'Plants', frequency: 'weekly' }], [
    a({ id: 1, choreId: 1, dueDate: '2026-10-25' }),
    a({ id: 2, choreId: 2, dueDate: '2026-10-20' }),
  ]);
  assert.deepEqual(sortCards(cards, 'due').map((c) => c.chore.title), ['Bathroom', 'Trash', 'Plants']);
  assert.deepEqual(sortCards(cards, 'name').map((c) => c.chore.title), ['Bathroom', 'Plants', 'Trash']);
});
