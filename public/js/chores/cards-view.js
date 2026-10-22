// The chore cards: one card per chore.
import { el } from '../ui.js';
import { formatShort } from '../dates.js';
import { statusTag, whoLabel, assignmentButtons, adminButtons } from './bits.js';

const byDueDate = (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id;

// One card per chore. "current" is the assignment the card is about:
// the earliest unfinished one, or the latest finished one if all are done.
// (A pure function: no page code, so it can be tested with node:test.)
export function buildChoreCards(chores, assignments) {
  return chores.map((chore) => {
    const mine = assignments.filter((a) => a.choreId === chore.id).sort(byDueDate);
    const unfinished = mine.filter((a) => a.status === 'assigned');
    const finished = mine.filter((a) => a.status === 'completed');
    return {
      chore,
      current: unfinished[0] ?? finished.at(-1) ?? null,
      upcoming: unfinished.slice(1),
    };
  });
}

// The "Show" filter looks at the assignment each card is about.
export function filterCards(cards, filter, meId) {
  if (filter === 'mine') return cards.filter((card) => card.current?.userId === meId);
  if (filter === 'waiting') return cards.filter((card) => card.current?.pendingSwap);
  return cards;
}

// By due date (cards with nobody assigned last), or by chore name.
export function sortCards(cards, sort) {
  const copy = [...cards];
  if (sort === 'name') return copy.sort((x, y) => x.chore.title.localeCompare(y.chore.title));
  return copy.sort((x, y) => {
    if (!x.current) return y.current ? 1 : 0;
    if (!y.current) return -1;
    return byDueDate(x.current, y.current);
  });
}

export function renderCards(container, state, actions) {
  const { me, household, assignments } = state;
  const allCards = buildChoreCards(household.chores, assignments);
  const isAdmin = me.role === 'admin';
  const newChore = isAdmin && el('button', { onclick: () => actions.newChore() }, '+ New chore');

  if (allCards.length === 0) {
    container.replaceChildren(
      el('p', {}, isAdmin ? 'No chores yet. Add your first one with "+ New chore".' : 'No chores yet. Ask your admin to add some.'),
      newChore,
    );
    return;
  }

  const cards = sortCards(filterCards(allCards, state.filter, me.id), state.sort);
  if (cards.length === 0) {
    container.replaceChildren(el('p', {}, 'Nothing matches this filter.'), newChore);
    return;
  }

  container.replaceChildren(
    el('div', { class: 'cards' }, cards.map((card) => choreCard(card, me, actions))),
    newChore,
  );
}

function choreCard({ chore, current, upcoming }, me, actions) {
  return el('article', {},
    el('header', {},
      el('strong', {}, chore.title), ' ',
      current && statusTag(current, me.id),
    ),
    current ? whenLine(current, me) : el('p', {}, 'Nobody is assigned yet.'),
    upcoming.length > 0 && el('p', { class: 'hint' }, `Next: ${upcoming.map((a) => whoLabel(a, me.id)).join(', ')}`),
    el('div', { class: 'actions' },
      assignmentButtons(current, me, actions),
      adminButtons(current, chore, me, actions),
    ),
  );
}

// "You · due Tue 20 Oct" or "Sam · done Mon 19 Oct"
function whenLine(assignment, me) {
  const when = assignment.status === 'completed' ? 'done' : 'due';
  return el('p', {}, el('strong', {}, whoLabel(assignment, me.id)), ` · ${when} ${formatShort(assignment.dueDate)}`);
}
