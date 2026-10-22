// The Chores page: load the data, draw it, and handle what people click.
import { api } from '../api.js';
import { el, toast, handleError, withBusy, confirmDialog } from '../ui.js';
import { state, fetchAll } from './state.js';
import { renderCards } from './cards-view.js';
import { renderRequests } from './requests.js';
import { openSwapDialog } from './swap-dialog.js';
import { openAssignDialog, openReassignDialog, openChoreDialog } from './admin-dialogs.js';
import { renderNoHousehold } from './no-household.js';
import { renderTopbar } from '../topbar.js';

const content = document.getElementById('content');
const requests = document.getElementById('requests');
const controls = document.getElementById('controls');

const POLL_MS = 10000;
let lastJson = '';

// --- Actions: what buttons do. Each one talks to the server, says what
// happened, then reloads and redraws so the page matches the database.

async function run(button, request, successMessage) {
  try {
    await withBusy(button, request);
    toast(successMessage);
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
    const target = await openSwapDialog(assignment, state.household.members, state.me.id,
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
  assign: async (chore) => {
    const ok = await openAssignDialog(chore, state.household.members,
      (values) => api('POST', '/assignments', { choreId: chore.id, ...values }));
    if (ok) toast(`“${chore.title}” assigned.`);
    await refresh();
  },

  reassign: async (assignment) => {
    const ok = await openReassignDialog(assignment, state.household.members,
      (values) => api('PATCH', `/assignments/${assignment.id}`, values));
    if (ok) toast(`“${assignment.choreTitle}” reassigned.`);
    await refresh();
  },

  newChore: async () => {
    const ok = await openChoreDialog(null, (values) => api('POST', '/chores', values));
    if (ok) toast('Chore added. Use “Assign…” to give it to someone.');
    await refresh();
  },

  editChore: async (chore) => {
    const ok = await openChoreDialog(chore, (values) => api('PATCH', `/chores/${chore.id}`, values));
    if (ok) toast('Saved.');
    await refresh();
  },

  deleteChore: async (chore, button) => {
    const ok = await confirmDialog(`Delete “${chore.title}” and all its turns?`, 'Delete');
    if (ok) await run(button, () => api('DELETE', `/chores/${chore.id}`), `“${chore.title}” was deleted.`);
  },
};

// --- Drawing ---------------------------------------------------------

function render() {
  renderTopbar(state.me);
  controls.hidden = !state.me.householdId;
  if (!state.me.householdId) {
    requests.replaceChildren();
    renderNoHousehold(content, state.me, refresh);
    return;
  }
  renderRequests(requests, state, actions);
  renderCards(content, state, actions);
}

// Load and redraw now (after an action, or on first load).
async function refresh() {
  try {
    const data = await fetchAll();
    lastJson = JSON.stringify(data);
    Object.assign(state, data);
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
    if (dialogOpen || json === lastJson) return;
    lastJson = json;
    Object.assign(state, data);
    render();
  } catch {
    // Offline for a moment? Just try again on the next tick.
  }
}

function showLoadError(err) {
  content.replaceChildren(
    el('p', {}, err.message),
    el('button', { onclick: refresh }, 'Try again'),
  );
}

// Filter and sort only redraw: the data is already loaded.
document.getElementById('filter').addEventListener('change', (event) => { state.filter = event.target.value; render(); });
document.getElementById('sort').addEventListener('change', (event) => { state.sort = event.target.value; render(); });

refresh();
setInterval(poll, POLL_MS);
