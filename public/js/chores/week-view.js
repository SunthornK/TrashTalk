// The "Week" view: the fridge chart. People down the side, Monday–Sunday
// across the top (spec §8.4). Past weeks are the history.
import { el } from '../ui.js';
import { addDays, formatShort, today, weekLabel, localDate } from '../dates.js';
import { applyFilter, weekRows } from './filters.js';
import { displayStatus, chipNote } from './status.js';
import { avatar, statusTag, whoLabel, assignmentButtons, adminButtons } from './bits.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function renderWeek(container, state, actions) {
  const { me, household, weekStart, filter } = state;
  const shown = applyFilter(state.weekAssignments, filter, me.id);
  let rows = weekRows(shown, household.members, me.id, weekStart);
  // With a filter on, hide rows that are empty because of it.
  if (filter !== 'everyone') rows = rows.filter((row) => row.days.some((day) => day.length > 0));

  if (rows.length === 0 || (filter !== 'everyone' && shown.length === 0)) {
    container.replaceChildren(el('p', { class: 'empty' }, 'Nothing to show for this week.'));
    return;
  }

  const todayString = today();
  const dates = DAY_NAMES.map((_, i) => addDays(weekStart, i));

  const head = el('tr', {},
    el('th', { scope: 'col' }, el('span', { class: 'sr-only' }, 'Who')),
    dates.map((date, i) => el('th', { scope: 'col', class: date === todayString ? 'today' : null },
      `${DAY_NAMES[i]} ${Number(date.slice(8))}`)),
  );

  const body = rows.map((row) => el('tr', { class: row.isMe ? 'me' : null },
    el('th', { scope: 'row' }, el('span', { class: 'who-cell' }, avatar(rowName(row, me)), row.label)),
    row.days.map((day, i) => el('td', { class: dates[i] === todayString ? 'today' : null },
      day.map((assignment) => chip(assignment, state, actions)))),
  ));

  container.replaceChildren(el('div', { class: 'week-wrap' },
    el('table', { class: 'week' },
      el('caption', { class: 'sr-only' }, `Chores for the week of ${weekLabel(weekStart)}`),
      el('thead', {}, head),
      el('tbody', {}, body),
    ),
  ));
}

// The name behind a row label ("You" → Alex, "Kim (left)" → Kim), for the avatar.
function rowName(row, me) {
  if (row.userId === null) return null;
  return row.isMe ? me.name : row.label.replace(' (left)', '');
}

// One chore in a day cell. The colour comes from the status, and the small
// text under the name says it in words too ("Overdue", "Done · was overdue").
function chip(assignment, state, actions) {
  const { kind } = displayStatus(assignment, state.me.id);
  const note = chipNote(assignment, state.me.id);
  return el('button', {
    type: 'button',
    class: `chip chip--${kind}`,
    'data-focus-key': `chip-${assignment.id}`,
    'aria-label': `${assignment.choreTitle}: ${whoLabel(assignment, state.me.id)}, ${note}. Due ${formatShort(assignment.dueDate)}.`,
    onclick: () => openDetails(assignment, state, actions),
  },
  el('span', { class: 'chip-title' }, `${assignment.status === 'completed' ? '✓ ' : ''}${assignment.choreTitle}`),
  el('small', {}, note));
}

// Clicking a chip: the details, with the same buttons a card has.
function openDetails(assignment, state, actions) {
  const dialog = el('dialog', {});
  // Close this dialog first, then run the action (which may open its own dialog).
  const closingActions = Object.fromEntries(Object.entries(actions).map(([name, fn]) =>
    [name, (...args) => { dialog.close(); return fn(...args); }]));

  const notes = [];
  if (assignment.status === 'completed') {
    notes.push(`Done ${formatShort(localDate(new Date(assignment.completedAt)))}${assignment.wasLate ? ', after the due date (was overdue)' : ''}.`);
  }
  if (assignment.viaName) notes.push(`Handed over by ${assignment.viaName}.`);

  dialog.append(el('article', { class: 'wobble' },
    el('h2', {}, assignment.choreTitle),
    el('p', {}, statusTag(assignment, state.me.id)),
    el('p', { class: 'now' },
      avatar(assignment.userId === null ? null : assignment.userName), ' ',
      el('strong', {}, whoLabel(assignment, state.me.id)),
      ` · due ${formatShort(assignment.dueDate)}`),
    notes.map((note) => el('p', { class: 'muted' }, note)),
    el('footer', {},
      assignmentButtons(assignment, state.me, closingActions),
      adminButtons(assignment, null, state.me, closingActions),
      el('button', { type: 'button', class: 'secondary', onclick: () => dialog.close() }, 'Close'),
    ),
  ));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
