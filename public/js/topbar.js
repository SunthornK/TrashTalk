// The top bar shared by the Chores and Household pages: the nav links and
// "Flat 4B · Alex (admin) · Log out".
import { api } from './api.js';
import { el } from './ui.js';

export function renderTopbar(me) {
  const inHousehold = Boolean(me.householdId);
  document.getElementById('nav').hidden = !inHousehold;
  document.getElementById('who').replaceChildren(
    el('span', {}, inHousehold ? `${me.householdName} · ${me.name}${me.role === 'admin' ? ' (admin)' : ''}` : me.name),
    el('button', { class: 'secondary small', onclick: logOut }, 'Log out'),
  );
}

async function logOut() {
  try { await api('POST', '/logout'); } finally { location.href = '/login.html'; }
}
