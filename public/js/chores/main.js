// The Chores page: load the data, draw it, and handle what people click.
import { api } from '../api.js';
import { el, toast, handleError, withBusy } from '../ui.js';
import { addDays, startOfWeek, today, weekLabel } from '../dates.js';
import { state, fetchAll, applyData, setView } from './state.js';
import { shouldRender, suggestNext } from './filters.js';
import { renderCards } from './cards-view.js';
import { renderWeek } from './week-view.js';
import { renderSidePanel, renderBanner, progressSection } from './side-panel.js';
import { openSwapDialog } from './swap-dialog.js';
import { openAssignDialog, openReassignDialog, openNewChoreDialog } from './admin-dialogs.js';
import { renderNoHousehold } from './no-household.js';
import { renderTopbar } from '../topbar.js';

const content = document.getElementById('content');
const side = document.getElementById('side');
const banner = document.getElementById('banner');
const controls = document.getElementById('controls');
const progressNarrow = document.getElementById('progress-narrow');

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
    if (err.status === 0) return; // server unreachable: keep the page as it is
  }
  await refresh();
}

const actions = {
  complete: (assignment, button) =>
    run(button, () => api('POST', `/assignments/${assignment.id}/complete`), `Nice! “${assignment.choreTitle}” is done.`),

  openSwap: async (assignment) => {
    const target = await openSwapDialog(assignment, state.household.members, state.assignments, state.me.id,
      ({ targetUserId, message }) => api('POST', '/swaps', { assignmentId: assignment.id, targetUserId, message }));
    if (target) toast(`Request sent to ${target.name}.`);
    await refresh();
  },

  cancelSwap: (swap, button) =>
    run(button, () => api('POST', `/swaps/${swap.id}/cancel`), 'Request cancelled.'),

  accept: (swap, button) =>
    run(button, () => api('POST', `/swaps/${swap.id}/accept`), `“${swap.choreTitle}” is yours now. Thanks!`),

  reject: (swap, button) =>
    run(button, () => api('POST', `/swaps/${swap.id}/reject`), `You said no to ${swap.requesterName}.`),

  // Admin only (the server checks this too).
  assignNext: async (chore) => {
    const members = state.household.members;
    let name = '';
    const ok = await openAssignDialog(chore, members, suggestNext(chore, state.assignments, members), async (values) => {
      await api('POST', '/assignments', { choreId: chore.id, ...values });
      name = members.find((m) => m.id === values.userId)?.name;
    });
    if (ok) toast(`“${chore.title}” assigned to ${name}.`);
    await refresh();
  },

  reassign: async (assignment) => {
    const members = state.household.members;
    let name = '';
    const ok = await openReassignDialog(assignment, members, async (values) => {
      await api('PATCH', `/assignments/${assignment.id}`, values);
      name = members.find((m) => m.id === values.userId)?.name;
    });
    if (ok) toast(`“${assignment.choreTitle}” now belongs to ${name}.`);
    await refresh();
  },

  newChore: async () => {
    let title = '';
    const ok = await openNewChoreDialog(async (values) => {
      const chore = await api('POST', '/chores', values);
      title = chore.title;
    });
    if (ok) toast(`Added “${title}”. Use “+ Assign next” to give it to someone.`);
    await refresh();
  },
};

// --- Drawing ---------------------------------------------------------

// Redrawing replaces the buttons, so remember which one had keyboard focus
// and put focus back on its new copy (same data-focus-key) afterwards.
function render() {
  const focusKey = document.activeElement?.dataset?.focusKey;
  draw();
  if (focusKey) document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
}

function draw() {
  renderTopbar(state.me);
  syncControls();
  if (!state.me.householdId) {
    side.replaceChildren();
    banner.replaceChildren();
    progressNarrow.replaceChildren();
    renderNoHousehold(content, state.me, refresh);
    return;
  }
  renderBanner(banner, state, actions);
  renderSidePanel(side, state, actions);
  progressNarrow.replaceChildren(progressSection(state, '-narrow'));
  if (state.view === 'week') renderWeek(content, state, actions);
  else renderCards(content, state, actions);
}

// --- Controls: the Week | Chores switch, filter, sort, week arrows.
// They live in the HTML and are wired up once; render() keeps them in step.

function syncControls() {
  const inHousehold = Boolean(state.me.householdId);
  controls.hidden = !inHousehold;
  if (!inHousehold) return;
  for (const button of controls.querySelectorAll('[data-view]')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  }
  document.getElementById('week-nav').hidden = state.view !== 'week';
  document.getElementById('sort-wrap').hidden = state.view !== 'chores';
  document.getElementById('week-label').textContent = weekLabel(state.weekStart);
  document.getElementById('this-week').hidden = state.weekStart === startOfWeek(today());
  const isAdmin = state.me.role === 'admin';
  const needsOption = document.querySelector('#filter option[value="needs"]');
  needsOption.hidden = !isAdmin;
  needsOption.disabled = !isAdmin;
  if (!isAdmin && state.filter === 'needs') state.filter = 'everyone';
  document.getElementById('filter').value = state.filter;
  document.getElementById('sort').value = state.sort;
}

function setupControls() {
  for (const button of controls.querySelectorAll('[data-view]')) {
    // Switching view only redraws: the data is already loaded.
    button.addEventListener('click', () => { setView(button.dataset.view); render(); });
  }
  document.getElementById('filter').addEventListener('change', (event) => { state.filter = event.target.value; render(); });
  document.getElementById('sort').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
  // Another week needs that week's data, so these do fetch.
  document.getElementById('prev-week').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, -7); refresh(); });
  document.getElementById('next-week').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, 7); refresh(); });
  document.getElementById('this-week').addEventListener('click', () => { state.weekStart = startOfWeek(today()); refresh(); });
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
    // Already showing data? Keep it on screen and just say what went wrong.
    if (lastJson) toast(err.message, 'error');
    else showLoadError(err);
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

setupControls();
refresh();
setInterval(poll, POLL_MS);
