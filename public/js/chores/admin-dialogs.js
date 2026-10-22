// The admin's dialogs on the Chores page: assign, reassign, new chore.
// Each takes a `send(values)` function that does the request; if the
// server refuses, the error shows inside the dialog and it stays open.
import { el, openFormDialog } from '../ui.js';
import { today } from '../dates.js';
import { FREQUENCY_LABELS } from './bits.js';

function memberSelect(id, members) {
  return el('select', { id, name: 'userId' }, members.map((m) => el('option', { value: m.id }, m.name)));
}

export function openAssignDialog(chore, members, send) {
  return openFormDialog({
    title: `Assign “${chore.title}”`,
    fields: [
      el('label', { for: 'assign-user' }, 'To'),
      memberSelect('assign-user', members),
      el('label', { for: 'assign-due' }, 'Due'),
      el('input', { id: 'assign-due', name: 'dueDate', type: 'date', value: today(), required: true }),
    ],
    submitLabel: 'Assign',
    onSubmit: (form) => send({ userId: Number(form.elements.userId.value), dueDate: form.elements.dueDate.value }),
  });
}

export function openReassignDialog(assignment, members, send) {
  return openFormDialog({
    title: `Reassign “${assignment.choreTitle}”`,
    fields: [
      el('label', { for: 'reassign-user' }, 'Give it to'),
      memberSelect('reassign-user', members),
    ],
    submitLabel: 'Reassign',
    onSubmit: (form) => send({ userId: Number(form.elements.userId.value) }),
  });
}

// New chore and Edit chore are the same form; editing starts with the chore's values.
export function openChoreDialog(chore, send) {
  return openFormDialog({
    title: chore ? `Edit “${chore.title}”` : 'New chore',
    fields: [
      el('label', { for: 'chore-title' }, 'Name'),
      el('input', { id: 'chore-title', name: 'title', value: chore?.title ?? '', maxlength: '60', autocomplete: 'off' }),
      el('label', { for: 'chore-frequency' }, 'How often'),
      el('select', { id: 'chore-frequency', name: 'frequency' },
        Object.entries(FREQUENCY_LABELS).map(([value, label]) =>
          el('option', { value, selected: value === (chore?.frequency ?? 'weekly') }, label))),
    ],
    submitLabel: chore ? 'Save' : 'Add chore',
    onSubmit: (form) => send({ title: form.elements.title.value, frequency: form.elements.frequency.value }),
  });
}
