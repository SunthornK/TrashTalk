// The right-hand panel on wide screens (spec §8.4), and the banner that
// replaces it on narrow screens.
import { el } from '../ui.js';
import { formatShort, today, startOfWeek } from '../dates.js';
import { weekProgress, applyFilter } from './filters.js';
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

// "This week so far": done / assigned per person, as text and a bar.
export function progressSection(state, idSuffix = '') {
  const rows = weekProgress(state.thisWeekAssignments, state.household.members, startOfWeek(today()));
  return el('section', { class: 'panel-section progress', 'aria-labelledby': `progress-title${idSuffix}` },
    el('h2', { id: `progress-title${idSuffix}` }, 'This week so far'),
    el('ul', { class: 'bars' }, rows.map((row) => {
      const percent = row.total === 0 ? 0 : Math.round((row.done / row.total) * 100);
      return el('li', {},
        avatar(row.name),
        el('span', { class: 'bar-name' }, row.userId === state.me.id ? 'You' : row.name),
        el('span', { class: 'bar wobble', 'aria-hidden': 'true' }, el('span', { style: `width: ${percent}%` })),
        el('span', { class: 'bar-count' }, `${row.done} / ${row.total}`),
      );
    })),
    el('p', { class: 'muted small-print' }, 'Done / assigned, due this week.'),
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
  const sections = [requests, progressSection(state), state.me.role === 'admin' && needsSection(state, actions)];
  container.replaceChildren(...sections.filter(Boolean));
}

// Admin only: overdue chores and chores with nobody, each with "Reassign…".
function needsSection(state, actions) {
  const needs = applyFilter(state.assignments, 'needs', state.me.id);
  return el('section', { class: 'panel-section', 'aria-labelledby': 'needs-title' },
    el('h2', { id: 'needs-title' }, 'Needs a new person ', el('span', { class: 'tag tag--over' }, String(needs.length))),
    needs.length === 0 && el('p', { class: 'muted' }, 'Everything has someone. 👍'),
    needs.map((a) => el('div', { class: 'request' },
      el('p', {}, el('strong', {}, a.choreTitle), ` · ${a.userId === null ? 'nobody' : `${a.userName}, overdue`} · ${formatShort(a.dueDate)}`),
      el('button', { class: 'admin small', onclick: (e) => actions.reassign(a, e.currentTarget) }, 'Reassign…'),
    )),
  );
}

// Narrow screens: only the requests that need your answer, above the chores.
export function renderBanner(container, state, actions) {
  container.replaceChildren(...state.swaps.incoming.map((swap) =>
    el('div', { class: 'banner wobble', role: 'region', 'aria-label': 'Request for you' }, incomingRequest(swap, actions))));
}
