// The Household page (spec §8.5): People (members, add, make admin,
// remove, leave) and Chore list (edit, archive, restore).
import { api } from './api.js';
import { el, toast, handleError, withBusy, clearFormErrors, confirmDialog } from './ui.js';
import { renderTopbar } from './topbar.js';
import { avatar, FREQUENCY_LABELS } from './chores/bits.js';

const peoplePanel = document.getElementById('panel-people');
const choresPanel = document.getElementById('panel-chores');
const heading = document.getElementById('household-name');

let me = null;
let household = null;
let editingChoreId = null; // which chore row is showing its edit form

// --- Tabs ------------------------------------------------------------------

const tabs = [...document.querySelectorAll('[role="tab"]')];

function selectTab(tab) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1; // only the selected tab is in the Tab order
    document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
  }
  tab.focus();
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  // Arrow keys move between tabs, like in desktop apps.
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const step = event.key === 'ArrowRight' ? 1 : -1;
    selectTab(tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length]);
  });
}

// --- Loading -----------------------------------------------------------------

async function load() {
  try {
    me = await api('GET', '/me');
    if (!me.householdId) {
      location.href = '/'; // the Chores page shows "not in a household yet"
      return;
    }
    household = await api('GET', '/household');
    render();
  } catch (err) {
    if (err.status === 401) return;
    peoplePanel.replaceChildren(el('p', {}, err.message), el('button', { onclick: load }, 'Try again'));
  }
}

function render() {
  renderTopbar(me);
  heading.textContent = household.name;
  renderPeople();
  renderChores();
}

// Run a request from a button, say what happened, then reload.
async function run(button, request, successMessage) {
  try {
    await withBusy(button, request);
    toast(successMessage);
  } catch (err) {
    handleError(err);
  }
  await load();
}

// --- People ------------------------------------------------------------------

function renderPeople() {
  const isAdmin = me.role === 'admin';

  const list = el('ul', { class: 'people' }, household.members.map((member) => {
    const isMe = member.id === me.id;
    return el('li', { class: 'person' },
      avatar(member.name),
      el('span', { class: 'person-name' },
        el('strong', {}, isMe ? `${member.name} (you)` : member.name),
        el('span', { class: 'hint' }, member.email)),
      member.role === 'admin' && el('span', { class: 'tag tag--admin' }, 'Admin'),
      isAdmin && !isMe && el('span', { class: 'person-actions' },
        el('button', { class: 'admin small', onclick: (e) => makeAdmin(member, e.currentTarget) }, 'Make admin'),
        el('button', { class: 'danger small', onclick: (e) => remove(member, e.currentTarget) }, 'Remove'),
      ),
    );
  }));

  const sections = [list];
  if (isAdmin) sections.push(addMemberForm());
  sections.push(el('div', { class: 'leave' },
    el('button', { class: 'danger', onclick: (e) => leave(e.currentTarget) }, 'Leave household')));
  peoplePanel.replaceChildren(...sections);
}

function addMemberForm() {
  const input = el('input', { id: 'add-email', name: 'email', type: 'email', placeholder: 'roommate@example.com', autocomplete: 'off' });
  const submit = el('button', { type: 'submit', class: 'admin' }, 'Add');
  const form = el('form', { class: 'add-member', novalidate: true },
    el('label', { for: 'add-email' }, 'Add someone by email'),
    el('div', { class: 'inline-form' }, input, submit),
    el('p', { class: 'hint' }, 'They need to create an account first.'),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    try {
      const member = await withBusy(submit, () => api('POST', '/household/members', { email: input.value }));
      toast(`${member.name} has joined ${household.name}.`);
      await load();
    } catch (err) {
      handleError(err, form); // e.g. "No account with that email…" under the input
    }
  });
  return form;
}

async function makeAdmin(member, button) {
  const ok = await confirmDialog(`Make ${member.name} the admin? You'll become a regular member.`, 'Make admin');
  if (ok) await run(button, () => api('POST', `/household/members/${member.id}/make-admin`), `${member.name} is now the admin.`);
}

async function remove(member, button) {
  const ok = await confirmDialog(`Remove ${member.name} from ${household.name}? Their unfinished chores will need a new person.`, 'Remove');
  if (ok) await run(button, () => api('DELETE', `/household/members/${member.id}`), `${member.name} was removed.`);
}

async function leave(button) {
  // The admin can't leave: ask the server anyway, so the reason comes from
  // the one place that enforces it ("Make someone else admin first.").
  if (me.role !== 'admin') {
    const ok = await confirmDialog(`Leave ${household.name}? Your unfinished chores will need a new person.`, 'Leave');
    if (!ok) return;
  }
  try {
    await withBusy(button, () => api('DELETE', `/household/members/${me.id}`));
    location.href = '/';
  } catch (err) {
    handleError(err);
  }
}

// --- Chore list -----------------------------------------------------------------

function renderChores() {
  const isAdmin = me.role === 'admin';
  if (household.chores.length === 0) {
    choresPanel.replaceChildren(el('p', { class: 'empty' },
      isAdmin ? 'No chores yet. Add one on the Chores page with "+ New chore".' : 'No chores yet.'));
    return;
  }
  // Active chores first, then archived ones.
  const chores = [...household.chores].sort((a, b) => Number(b.active) - Number(a.active));
  choresPanel.replaceChildren(el('ul', { class: 'chore-list' }, chores.map((chore) =>
    el('li', { class: chore.active ? 'chore-row' : 'chore-row archived' },
      isAdmin && editingChoreId === chore.id ? editForm(chore) : choreSummary(chore, isAdmin)))));
}

function choreSummary(chore, isAdmin) {
  return [
    el('span', { class: 'chore-row-name' }, el('strong', {}, chore.title), el('span', { class: 'hint' }, FREQUENCY_LABELS[chore.frequency])),
    !chore.active && el('span', { class: 'tag' }, 'Archived'),
    isAdmin && el('span', { class: 'person-actions' },
      chore.active
        ? [
          el('button', { class: 'secondary small', onclick: () => { editingChoreId = chore.id; renderChores(); } }, 'Edit'),
          el('button', { class: 'danger small', onclick: (e) => archive(chore, e.currentTarget) }, 'Archive'),
        ]
        : el('button', { class: 'admin small', onclick: (e) =>
          run(e.currentTarget, () => api('PATCH', `/chores/${chore.id}`, { active: true }), `“${chore.title}” is back.`) }, 'Restore'),
    ),
  ];
}

function editForm(chore) {
  const title = el('input', { id: `title-${chore.id}`, name: 'title', value: chore.title, maxlength: '60', 'aria-label': 'Chore name' });
  const frequency = el('select', { name: 'frequency', 'aria-label': 'How often' },
    Object.entries(FREQUENCY_LABELS).map(([value, label]) => el('option', { value, selected: value === chore.frequency }, label)));
  const save = el('button', { type: 'submit', class: 'admin small' }, 'Save');
  const form = el('form', { class: 'edit-chore', novalidate: true },
    el('div', { class: 'inline-form' }, title, frequency, save,
      el('button', { type: 'button', class: 'secondary small', onclick: () => { editingChoreId = null; renderChores(); } }, 'Cancel')));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    try {
      await withBusy(save, () => api('PATCH', `/chores/${chore.id}`, { title: title.value, frequency: frequency.value }));
      editingChoreId = null;
      toast('Saved.');
      await load();
    } catch (err) {
      handleError(err, form);
    }
  });
  setTimeout(() => title.focus());
  return form;
}

async function archive(chore, button) {
  const ok = await confirmDialog(`Archive “${chore.title}”? Unfinished assignments of this chore will be deleted. Finished ones stay in the history.`, 'Archive');
  if (ok) await run(button, () => api('PATCH', `/chores/${chore.id}`, { active: false }), `“${chore.title}” was archived.`);
}

load();
