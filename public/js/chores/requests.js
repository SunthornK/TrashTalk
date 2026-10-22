// "Requests for you": handoffs someone asked you to take, above the cards.
import { el } from '../ui.js';
import { formatShort } from '../dates.js';

export function renderRequests(container, state, actions) {
  container.replaceChildren(...state.swaps.incoming.map((swap) =>
    el('article', { class: 'request' },
      el('p', {},
        el('strong', {}, swap.requesterName), ' asks you to take ',
        el('strong', {}, swap.choreTitle), ` (${formatShort(swap.dueDate)}).`,
      ),
      swap.message && el('p', {}, el('em', {}, `“${swap.message}”`)),
      el('div', { class: 'actions' },
        el('button', { onclick: (e) => actions.accept(swap, e.currentTarget) }, 'Take it'),
        el('button', { class: 'secondary', onclick: (e) => actions.reject(swap, e.currentTarget) }, 'No'),
      ),
    )));
}
