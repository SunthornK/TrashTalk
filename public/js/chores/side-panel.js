// The right-hand panel on wide screens (spec §8.4), and the banner that
// replaces it on narrow screens.
import { el } from '../ui.js';
import { formatShort } from '../dates.js';
import { avatar } from './bits.js';

function incomingRequest(swap, actions) {
  return el('div', { class: 'request' },
    el('p', {},
      avatar(swap.requesterName), ' ',
      el('strong', {}, swap.requesterName), ' asks you to take ',
      el('strong', {}, swap.choreTitle), ` (${formatShort(swap.dueDate)}).`,
    ),
    swap.message && el('p', { class: 'request-message' }, `“${swap.message}”`),
    el('div', { class: 'actions' },
      el('button', { class: 'primary small', onclick: (e) => actions.accept(swap, e.currentTarget) }, 'Take it'),
      el('button', { class: 'secondary small', onclick: (e) => actions.reject(swap, e.currentTarget) }, 'No'),
    ),
  );
}

function sentRequest(swap, actions) {
  return el('div', { class: 'request request--sent' },
    el('p', {}, `You asked ${swap.targetName}: `, el('strong', {}, swap.choreTitle), ' · waiting'),
    el('button', { class: 'link small', onclick: (e) => actions.cancelSwap(swap, e.currentTarget) }, 'Cancel'),
  );
}

export function renderSidePanel(container, state, actions) {
  const { incoming, sent } = state.swaps;
  const requests = el('section', { class: 'panel-section', 'aria-labelledby': 'requests-title' },
    el('h2', { id: 'requests-title' }, 'Requests'),
    incoming.length === 0 && sent.length === 0 && el('p', { class: 'muted' }, 'No requests right now.'),
    incoming.map((swap) => incomingRequest(swap, actions)),
    sent.map((swap) => sentRequest(swap, actions)),
  );
  container.replaceChildren(requests);
}

// Narrow screens: only the requests that need your answer, above the chores.
export function renderBanner(container, state, actions) {
  container.replaceChildren(...state.swaps.incoming.map((swap) =>
    el('div', { class: 'banner wobble', role: 'region', 'aria-label': 'Request for you' }, incomingRequest(swap, actions))));
}
