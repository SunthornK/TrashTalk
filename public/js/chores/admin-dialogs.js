// The admin's dialogs on the Chores page: assign, reassign, new chore.
// Each takes a `send(values)` function that does the request; if the
// server refuses, the error shows inside the dialog and it stays open.
import { el, openFormDialog } from '../ui.js';
import { formatShort } from '../dates.js';
import { FREQUENCY_LABELS } from './bits.js';

function memberSelect(id, members, selectedId) {
  return el('select', { id, name: 'userId' },
    members.map((m) => el('option', { value: m.id, selected: m.id === selectedId }, m.name)));
}

export function openAssignDialog(chore, members, suggestion, send) {
  return openFormDialog({
    title: `Assign "${chore.title}"`,
    fields: [
      el('label', { for: 'assign-user' }, 'To'),
      memberSelect('assign-user', members, suggestion.userId),
      el('label', { for: 'assign-due' }, 'Due'),
      el('input', { id: 'assign-due', name: 'dueDate', type: 'date', value: suggestion.dueDate, required: true }),
      el('p', { class: 'muted small-print' }, `Filled in for you: next in line, ${FREQUENCY_LABELS[chore.frequency].toLowerCase()} after the last one.`),
    ],
    submitLabel: 'Assign',
    submitClass: 'admin',
    onSubmit: (form) => send({ userId: Number(form.elements.userId.value), dueDate: form.elements.dueDate.value }),
  });
}

export function openReassignDialog(assignment, members, send) {
  const firstOther = members.find((m) => m.id !== assignment.userId) ?? members[0];
  return openFormDialog({
    title: `Reassign "${assignment.choreTitle}"`,
    fields: [
      el('p', {}, `Due ${formatShort(assignment.dueDate)} · now: `, el('strong', {}, assignment.userName ?? 'Nobody')),
      el('label', { for: 'reassign-user' }, 'Give it to'),
      memberSelect('reassign-user', members, firstOther?.id),
      assignment.pendingSwap && el('p', { class: 'muted small-print' }, `The pending request to ${assignment.pendingSwap.targetName} will be cancelled.`),
    ],
    submitLabel: 'Reassign',
    submitClass: 'admin',
    onSubmit: (form) => send({ userId: Number(form.elements.userId.value) }),
  });
}

export function openNewChoreDialog(send) {
  return openFormDialog({
    title: 'New chore',
    fields: [
      el('label', { for: 'chore-title' }, 'Name'),
      el('input', { id: 'chore-title', name: 'title', placeholder: 'e.g. Water the plants', maxlength: '60', autocomplete: 'off' }),
      el('label', { for: 'chore-frequency' }, 'How often'),
      el('select', { id: 'chore-frequency', name: 'frequency' },
        Object.entries(FREQUENCY_LABELS).map(([value, label]) => el('option', { value, selected: value === 'weekly' }, label))),
    ],
    submitLabel: 'Add chore',
    submitClass: 'admin',
    onSubmit: (form) => send({ title: form.elements.title.value, frequency: form.elements.frequency.value }),
  });
}
