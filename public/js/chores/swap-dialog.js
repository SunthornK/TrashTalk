// "Can't do it…" → "Who could take it?" (spec §8.4).
import { el, openFormDialog } from '../ui.js';
import { formatShort, today, startOfWeek, addDays } from '../dates.js';
import { avatar } from './bits.js';

// How many unfinished chores each person has this week, to help pick someone fair.
function choresThisWeek(assignments, userId) {
  const monday = startOfWeek(today());
  const sunday = addDays(monday, 6);
  return assignments.filter((a) =>
    a.userId === userId && a.status === 'assigned' && a.dueDate >= monday && a.dueDate <= sunday).length;
}

// `send({ targetUserId, message })` makes the request; it may throw, and
// then the error appears in the dialog. Resolves to the chosen person, or
// null if cancelled.
export async function openSwapDialog(assignment, members, assignments, meId, send) {
  const others = members.filter((m) => m.id !== meId);
  let chosen = null;

  const note = el('p', { class: 'muted swap-note' }, 'It stays yours until they say yes.');
  const options = el('fieldset', { class: 'pick-list' },
    el('legend', { class: 'sr-only' }, 'Choose a roommate'),
    others.map((member) => {
      const count = choresThisWeek(assignments, member.id);
      const radio = el('input', {
        type: 'radio', name: 'targetUserId', value: member.id, id: `pick-${member.id}`,
        onchange: () => {
          chosen = member;
          note.textContent = `It stays yours until ${member.name} says yes.`;
        },
      });
      return el('label', { class: 'pick wobble', for: `pick-${member.id}` },
        radio, avatar(member.name), el('span', { class: 'pick-name' }, member.name),
        el('span', { class: 'muted' }, `${count} ${count === 1 ? 'chore' : 'chores'} this week`),
      );
    }),
  );

  const ok = await openFormDialog({
    title: 'Who could take it?',
    fields: [
      el('p', {}, el('strong', {}, assignment.choreTitle), ` · due ${formatShort(assignment.dueDate)}`),
      others.length === 0 ? el('p', { class: 'muted' }, 'There is nobody else in your household yet.') : options,
      el('label', { for: 'swap-message' }, 'Message (optional)'),
      el('textarea', { id: 'swap-message', name: 'message', maxlength: '200', rows: '2', placeholder: 'Sorry, exam on Tuesday!' }),
      note,
    ],
    submitLabel: 'Send request',
    onSubmit: async (form) => {
      if (!chosen) {
        const error = new Error('Choose who you want to ask.');
        error.field = 'targetUserId';
        throw error;
      }
      await send({ targetUserId: chosen.id, message: form.elements.message.value });
    },
  });
  return ok ? chosen : null;
}
