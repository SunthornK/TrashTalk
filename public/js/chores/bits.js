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

// "You", "Sam", "Kim (left)" or "Nobody".
export function whoLabel(assignment, meId) {
  if (assignment.userId === null) return 'Nobody';
  if (assignment.userId === meId) return 'You';
  return assignment.userLeft ? `${assignment.userName} (left)` : assignment.userName;
}
