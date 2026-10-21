// Small pieces of page shared by the cards, the week view and the side panel.
import { el } from '../ui.js';
import { displayStatus } from './status.js';

export const FREQUENCY_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', once: 'Once' };

// Is this an unfinished chore that's overdue or has nobody? (admin: "needs a new person")
export function needsNewPerson(assignment) {
  return assignment.status === 'assigned' && (assignment.overdue || assignment.userId === null);
}

// The admin's purple buttons for one assignment.
export function adminButtons(assignment, chore, me, actions) {
  if (me.role !== 'admin') return [];
  return [
    assignment && needsNewPerson(assignment) &&
      el('button', { class: 'admin small', 'data-focus-key': `reassign-${assignment.id}`, onclick: (e) => actions.reassign(assignment, e.currentTarget) }, 'Reassign…'),
    chore && el('button', { class: 'admin small', 'data-focus-key': `assign-${chore.id}`, onclick: (e) => actions.assignNext(chore, e.currentTarget) }, '+ Assign next'),
  ];
}

// A circle with someone's first letter.
export function avatar(name) {
  return el('span', { class: 'avatar', 'aria-hidden': 'true' }, name ? name[0].toUpperCase() : '?');
}

export function statusTag(assignment, meId) {
  const { label, kind } = displayStatus(assignment, meId);
  return el('span', { class: `tag tag--${kind}` }, label);
}

// The buttons for one assignment, shared by the cards and the week view.
// Only the ones you're allowed to use. (The server checks again anyway.)
export function assignmentButtons(assignment, me, actions) {
  if (!assignment || assignment.status !== 'assigned' || assignment.userId !== me.id) return [];
  if (assignment.pendingSwap) {
    return [
      el('button', { class: 'secondary small', 'data-focus-key': `cancel-${assignment.pendingSwap.id}`, onclick: (e) => actions.cancelSwap(assignment.pendingSwap, e.currentTarget) }, 'Cancel request'),
    ];
  }
  return [
    el('button', { class: 'primary small', 'data-focus-key': `complete-${assignment.id}`, onclick: (e) => actions.complete(assignment, e.currentTarget) }, 'Done ✓'),
    el('button', { class: 'secondary small', 'data-focus-key': `swap-${assignment.id}`, onclick: (e) => actions.openSwap(assignment, e.currentTarget) }, "Can't do it…"),
  ];
}

// "You", "Sam", "Kim (left)" or "Nobody".
export function whoLabel(assignment, meId) {
  if (assignment.userId === null) return 'Nobody';
  if (assignment.userId === meId) return 'You';
  return assignment.userLeft ? `${assignment.userName} (left)` : assignment.userName;
}
