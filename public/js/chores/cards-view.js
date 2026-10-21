// The "Chores" view: one card per active chore (spec §8.4).
import { el } from '../ui.js';
import { formatShort } from '../dates.js';
import { buildChoreCards, filterCards, sortCards } from './filters.js';
import { avatar, statusTag, whoLabel, assignmentButtons, adminButtons, needsNewPerson } from './bits.js';

export function renderCards(container, state, actions) {
  const { me, household, assignments } = state;
  const allCards = buildChoreCards(household.chores, assignments);

  const newChore = me.role === 'admin' &&
    el('button', { type: 'button', class: 'add-card wobble', 'data-focus-key': 'new-chore', onclick: (e) => actions.newChore(e.currentTarget) }, '+ New chore');

  if (allCards.length === 0) {
    container.replaceChildren(
      el('p', { class: 'empty' }, me.role === 'admin' ? 'No chores yet. Add your first one with "+ New chore".' : 'No chores yet. Ask your admin to add some.'),
      newChore && el('div', { class: 'cards-grid' }, newChore),
    );
    return;
  }

  const cards = sortCards(filterCards(allCards, state.filter, me.id), state.sort);
  if (cards.length === 0) {
    container.replaceChildren(el('p', { class: 'empty' }, 'Nothing for you right now 🎉'));
    return;
  }

  container.replaceChildren(el('div', { class: 'cards-grid' },
    cards.map((card) => choreCard(card, me, actions)),
    state.filter === 'everyone' && newChore,
  ));
}

function choreCard({ chore, current, upcoming }, me, actions) {
  const mine = current?.userId === me.id;
  const needs = me.role === 'admin' && current && needsNewPerson(current);
  return el('article', { class: `chore-card wobble${mine ? ' chore-card--mine' : ''}${needs ? ' chore-card--needs' : ''}` },
    el('header', {},
      el('h3', {}, chore.title),
      current && statusTag(current, me.id),
    ),
    current ? whenLine(current, me) : el('p', { class: 'muted' }, 'Nobody is assigned yet.'),
    upcoming.length > 0 && el('p', { class: 'next muted' }, `then ${upcoming.map((a) => whoLabel(a, me.id)).join(', ')}`),
    el('div', { class: 'actions' },
      assignmentButtons(current, me, actions),
      adminButtons(current, chore, me, actions),
    ),
  );
}

// "(A) You · due Tue 20 Oct" or "(S) Sam · done Mon 19 Oct"
function whenLine(assignment, me) {
  const who = whoLabel(assignment, me.id);
  const when = assignment.status === 'completed' ? 'done' : 'due';
  return el('p', { class: 'now' },
    avatar(assignment.userId === null ? null : assignment.userName),
    el('strong', {}, who),
    ` · ${when} ${formatShort(assignment.dueDate)}`,
  );
}
