// Small pieces of page shared by the cards and the dialogs.
import { el } from '../ui.js';
import { displayStatus } from './status.js';

export const FREQUENCY_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', once: 'Once' };

// The status in words, coloured by its kind (tag--over, tag--done, …).
export function statusTag(assignment, meId) {
  const { label, kind } = displayStatus(assignment, meId);
  return el('span', { class: `tag tag--${kind}` }, label);
}

// The buttons for one assignment: only the ones you're allowed to use.
// (The server checks again anyway.)
export function assignmentButtons(assignment, me, actions) {
  if (!assignment || assignment.status !== 'assigned' || assignment.userId !== me.id) return [];
  if (assignment.pendingSwap) {
    return [
      el('button', { class: 'secondary', onclick: (e) => actions.cancelSwap(assignment.pendingSwap, e.currentTarget) }, 'Cancel request'),
    ];
  }
  return [
    el('button', { onclick: (e) => actions.complete(assignment, e.currentTarget) }, 'Done ✓'),
    el('button', { class: 'secondary', onclick: (e) => actions.openSwap(assignment, e.currentTarget) }, "Can't do it…"),
  ];
}

// The admin's buttons: reassign an unfinished turn, add the next turn,
// edit or delete the chore.
export function adminButtons(assignment, chore, me, actions) {
  if (me.role !== 'admin') return [];
  return [
    assignment && assignment.status === 'assigned' &&
      el('button', { class: 'outline', onclick: () => actions.reassign(assignment) }, 'Reassign…'),
    el('button', { class: 'outline', onclick: () => actions.assign(chore) }, 'Assign…'),
    el('button', { class: 'outline', onclick: () => actions.editChore(chore) }, 'Edit…'),
    el('button', { class: 'outline contrast', onclick: (e) => actions.deleteChore(chore, e.currentTarget) }, 'Delete'),
  ];
}

// "You", "Sam" or "Nobody".
export function whoLabel(assignment, meId) {
  if (assignment.userId === null) return 'Nobody';
  if (assignment.userId === meId) return 'You';
  return assignment.userName;
}
