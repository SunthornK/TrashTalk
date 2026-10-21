// The Chores page: load the data, draw it, and handle what people click.
import { api } from '../api.js';
import { el, toast, handleError, withBusy } from '../ui.js';
import { state, fetchAll, applyData } from './state.js';
import { shouldRender } from './filters.js';
import { renderCards } from './cards-view.js';
import { renderSidePanel, renderBanner } from './side-panel.js';
import { openSwapDialog } from './swap-dialog.js';
import { renderNoHousehold } from './no-household.js';

const content = document.getElementById('content');
const side = document.getElementById('side');
const banner = document.getElementById('banner');
const nav = document.getElementById('nav');
const who = document.getElementById('who');

const POLL_MS = 10000;
let lastJson = '';

// --- Actions: what buttons do. Each one talks to the server, says what
// happened, then reloads and redraws so the page matches the database.

async function run(button, request, successMessage) {
  try {
    await withBusy(button, request);
    if (successMessage) toast(successMessage);
  } catch (err) {
    handleError(err); // e.g. 409 "This request is no longer available."
  }
  await refresh();
}

const actions = {
  complete: (assignment, button) =>
    run(button, () => api('POST', `/assignments/${assignment.id}/complete`), `Nice! "${assignment.choreTitle}" is done.`),

  openSwap: async (assignment) => {
    const target = await openSwapDialog(assignment, state.household.members, state.assignments, state.me.id,
      ({ targetUserId, message }) => api('POST', '/swaps', { assignmentId: assignment.id, targetUserId, message }));
    if (target) toast(`Request sent to ${target.name}.`);
    await refresh();
  },

  cancelSwap: (swap, button) =>
    run(button, () => api('POST', `/swaps/${swap.id}/cancel`), 'Request cancelled.'),

  accept: (swap, button) =>
    run(button, () => api('POST', `/swaps/${swap.id}/accept`), `"${swap.choreTitle}" is yours now. Thanks!`),

  reject: (swap, button) =>
    run(button, () => api('POST', `/swaps/${swap.id}/reject`), `You said no to ${swap.requesterName}.`),
};

// --- Drawing ---------------------------------------------------------

function renderTopbar() {
  const { me } = state;
  const inHousehold = Boolean(me.householdId);
  nav.hidden = !inHousehold;
  who.replaceChildren(
    el('span', {}, inHousehold ? `${me.householdName} · ${me.name}${me.role === 'admin' ? ' (admin)' : ''}` : me.name),
    el('button', { class: 'secondary small', onclick: logOut }, 'Log out'),
  );
}

function render() {
  renderTopbar();
  if (!state.me.householdId) {
    side.replaceChildren();
    banner.replaceChildren();
    renderNoHousehold(content, state.me, refresh);
    return;
  }
  renderBanner(banner, state, actions);
  renderSidePanel(side, state, actions);
  renderCards(content, state, actions);
}

// Load and redraw now (after an action, or on first load).
async function refresh() {
  try {
    const data = await fetchAll();
    lastJson = JSON.stringify(data);
    applyData(data);
    render();
  } catch (err) {
    if (err.status === 401) return; // api() is already sending us to the login page
    showLoadError(err);
  }
}

// Every 10 s: fetch again, and redraw only if something changed and nobody
// is in the middle of a dialog. This is how Jamie sees Alex's request appear.
async function poll() {
  try {
    const data = await fetchAll();
    const json = JSON.stringify(data);
    const dialogOpen = document.querySelector('dialog[open]') !== null;
    if (!shouldRender(lastJson, json, dialogOpen)) return;
    lastJson = json;
    applyData(data);
    render();
  } catch {
    // Offline for a moment? Just try again on the next tick.
  }
}

function showLoadError(err) {
  content.replaceChildren(el('div', { class: 'empty' },
    el('p', {}, err.message),
    el('button', { onclick: refresh }, 'Try again'),
  ));
}

async function logOut() {
  try { await api('POST', '/logout'); } finally { location.href = '/login.html'; }
}

refresh();
setInterval(poll, POLL_MS);
