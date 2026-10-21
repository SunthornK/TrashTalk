// Small pieces of page shared by the cards, the week view and the side panel.
import { el } from '../ui.js';
import { displayStatus } from './status.js';

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
      el('button', { class: 'secondary small', onclick: (e) => actions.cancelSwap(assignment.pendingSwap, e.currentTarget) }, 'Cancel request'),
    ];
  }
  return [
    el('button', { class: 'primary small', onclick: (e) => actions.complete(assignment, e.currentTarget) }, 'Done ✓'),
    el('button', { class: 'secondary small', onclick: (e) => actions.openSwap(assignment, e.currentTarget) }, "Can't do it…"),
  ];
}

// "You", "Sam", "Kim (left)" or "Nobody".
export function whoLabel(assignment, meId) {
  if (assignment.userId === null) return 'Nobody';
  if (assignment.userId === meId) return 'You';
  return assignment.userLeft ? `${assignment.userName} (left)` : assignment.userName;
}
