import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilter, buildChoreCards, sortCards, filterCards } from '../public/js/chores/filters.js';

const ME = 1;
function a(overrides) {
  return {
    id: 1, choreId: 1, choreTitle: 'Trash', userId: ME, userName: 'Alex', userLeft: false,
    dueDate: '2026-10-22', status: 'assigned', completedAt: null,
    overdue: false, wasLate: false, pendingSwap: null, viaName: null, ...overrides,
  };
}

test('applyFilter: everyone keeps all, mine keeps only mine', () => {
  const list = [a({ id: 1 }), a({ id: 2, userId: 2 })];
  assert.equal(applyFilter(list, 'everyone', ME).length, 2);
  assert.deepEqual(applyFilter(list, 'mine', ME).map((x) => x.id), [1]);
});

test('applyFilter: waiting keeps pending swaps', () => {
  const list = [a({ id: 1 }), a({ id: 2, pendingSwap: { id: 9, targetUserId: 2, targetName: 'Sam' } })];
  assert.deepEqual(applyFilter(list, 'waiting', ME).map((x) => x.id), [2]);
});

test('applyFilter: needs = overdue or nobody, unfinished only', () => {
  const list = [
    a({ id: 1 }),
    a({ id: 2, overdue: true }),
    a({ id: 3, userId: null, userName: null }),
    a({ id: 4, userId: null, status: 'completed' }),
  ];
  assert.deepEqual(applyFilter(list, 'needs', ME).map((x) => x.id), [2, 3]);
});

const chores = [
  { id: 1, title: 'Trash', frequency: 'weekly', active: true },
  { id: 2, title: 'Bathroom', frequency: 'weekly', active: true },
  { id: 3, title: 'Plants', frequency: 'weekly', active: false },
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

test('buildChoreCards: falls back to the latest completed; archived chores are left out', () => {
  const assignments = [
    a({ id: 20, choreId: 2, dueDate: '2026-10-08', status: 'completed' }),
    a({ id: 21, choreId: 2, dueDate: '2026-10-15', status: 'completed' }),
    a({ id: 30, choreId: 3, dueDate: '2026-10-22' }),
  ];
  const cards = buildChoreCards(chores, assignments);
  assert.deepEqual(cards.map((c) => c.chore.id), [1, 2]);
  assert.equal(cards[0].current, null);
  assert.equal(cards[1].current.id, 21);
});

test('sortCards: by due date (no assignment last) or by name', () => {
  const cards = [
    { chore: { title: 'Trash' }, current: null },
    { chore: { title: 'Bathroom' }, current: a({ dueDate: '2026-10-25' }) },
    { chore: { title: 'Vacuum' }, current: a({ dueDate: '2026-10-21' }) },
  ];
  assert.deepEqual(sortCards(cards, 'due').map((c) => c.chore.title), ['Vacuum', 'Bathroom', 'Trash']);
  assert.deepEqual(sortCards(cards, 'name').map((c) => c.chore.title), ['Bathroom', 'Trash', 'Vacuum']);
});

test('filterCards: everyone shows all cards; other filters look at the current assignment', () => {
  const cards = [
    { chore: { title: 'Trash' }, current: null },
    { chore: { title: 'Bathroom' }, current: a({ userId: 2 }) },
    { chore: { title: 'Vacuum' }, current: a({ userId: ME }) },
  ];
  assert.equal(filterCards(cards, 'everyone', ME).length, 3);
  assert.deepEqual(filterCards(cards, 'mine', ME).map((c) => c.chore.title), ['Vacuum']);
});
