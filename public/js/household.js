// The Household page: the members, and for the admin: add and remove people.
import { api } from './api.js';
import { el, toast, handleError, withBusy, clearFormErrors, confirmDialog } from './ui.js';
import { renderTopbar } from './topbar.js';

const peopleSection = document.getElementById('people');
const heading = document.getElementById('household-name');

let me = null;
let household = null;

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
    peopleSection.replaceChildren(el('p', {}, err.message), el('button', { onclick: load }, 'Try again'));
  }
}

function render() {
  renderTopbar(me);
  heading.textContent = household.name;
  const isAdmin = me.role === 'admin';

  const list = el('ul', { class: 'people' }, household.members.map((member) => {
    const isMe = member.id === me.id;
    return el('li', {},
      el('strong', {}, isMe ? `${member.name} (you)` : member.name), ' ',
      el('span', { class: 'hint' }, member.email), ' ',
      member.role === 'admin' && el('span', { class: 'tag' }, 'Admin'),
      isAdmin && !isMe && el('button', { class: 'secondary outline', onclick: (e) => remove(member, e.currentTarget) }, 'Remove'),
    );
  }));

  peopleSection.replaceChildren(list, isAdmin && addMemberForm());
}

function addMemberForm() {
  const input = el('input', { id: 'add-email', name: 'email', type: 'email', placeholder: 'roommate@example.com', autocomplete: 'off' });
  const submit = el('button', { type: 'submit' }, 'Add');
  const form = el('form', { novalidate: true },
    el('label', { for: 'add-email' }, 'Add someone by email'),
    el('div', { role: 'group' }, input, submit),
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

async function remove(member, button) {
  const ok = await confirmDialog(`Remove ${member.name} from ${household.name}? Their unfinished chores will need a new person.`, 'Remove');
  if (!ok) return;
  try {
    await withBusy(button, () => api('DELETE', `/household/members/${member.id}`));
    toast(`${member.name} was removed.`);
  } catch (err) {
    handleError(err);
  }
  await load();
}

load();
