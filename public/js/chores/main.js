// The Chores page: load the data, draw it, and handle what people click.
import { api } from '../api.js';
import { el, toast, handleError, withBusy } from '../ui.js';
import { state, loadAll } from './state.js';
import { renderCards } from './cards-view.js';
import { renderNoHousehold } from './no-household.js';

const content = document.getElementById('content');
const nav = document.getElementById('nav');
const who = document.getElementById('who');

const POLL_MS = 10000;
let noHouseholdTimer = null;

// --- Actions: what buttons do. Each one talks to the server, says what
// happened, then reloads and redraws so the page matches the database.

async function run(button, request, successMessage) {
  try {
    await withBusy(button, request);
    if (successMessage) toast(successMessage);
  } catch (err) {
    handleError(err);
  }
  await refresh();
}

const actions = {
  complete: (assignment, button) =>
    run(button, () => api('POST', `/assignments/${assignment.id}/complete`), `Nice! "${assignment.choreTitle}" is done.`),
};

// --- Drawing ---------------------------------------------------------

function renderTopbar() {
  const { me } = state;
  const inHousehold = Boolean(me.householdId);
  nav.hidden = !inHousehold;
  const logout = el('button', { class: 'secondary small', onclick: logOut }, 'Log out');
  who.replaceChildren(
    el('span', {}, inHousehold ? `${me.householdName} · ${me.name}${me.role === 'admin' ? ' (admin)' : ''}` : me.name),
    logout,
  );
}

function render() {
  renderTopbar();
  if (!state.me.householdId) {
    renderNoHousehold(content, state.me, refresh);
    waitForHousehold();
    return;
  }
  stopWaitingForHousehold();
  renderCards(content, state, actions);
}

async function refresh() {
  try {
    await loadAll();
    render();
  } catch (err) {
    if (err.status === 401) return; // api() is already sending us to the login page
    showLoadError(err);
  }
}

function showLoadError(err) {
  content.replaceChildren(el('div', { class: 'empty' },
    el('p', {}, err.message),
    el('button', { onclick: refresh }, 'Try again'),
  ));
}

// While you're not in a household, check every 10 s whether the admin has added you.
function waitForHousehold() {
  if (noHouseholdTimer) return;
  noHouseholdTimer = setInterval(async () => {
    try {
      const me = await api('GET', '/me');
      if (me.householdId) refresh();
    } catch { /* try again next time */ }
  }, POLL_MS);
}

function stopWaitingForHousehold() {
  clearInterval(noHouseholdTimer);
  noHouseholdTimer = null;
}

async function logOut() {
  try { await api('POST', '/logout'); } finally { location.href = '/login.html'; }
}

refresh();
