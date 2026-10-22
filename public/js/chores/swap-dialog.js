// "Can't do it…" → "Who could take it?"
import { el, openFormDialog } from '../ui.js';
import { formatShort } from '../dates.js';

// `send({ targetUserId, message })` makes the request; it may throw, and
// then the error appears in the dialog. Resolves to the chosen person, or
// null if cancelled.
export async function openSwapDialog(assignment, members, meId, send) {
  const others = members.filter((m) => m.id !== meId);
  let chosen = null;

  const options = el('fieldset', {},
    el('legend', {}, 'Choose a roommate'),
    others.map((member) =>
      el('label', {},
        el('input', { type: 'radio', name: 'targetUserId', value: member.id, onchange: () => { chosen = member; } }),
        member.name,
      )),
  );

  const ok = await openFormDialog({
    title: 'Who could take it?',
    fields: [
      el('p', {}, el('strong', {}, assignment.choreTitle), ` · due ${formatShort(assignment.dueDate)}`),
      others.length === 0 ? el('p', {}, 'There is nobody else in your household yet.') : options,
      el('label', { for: 'swap-message' }, 'Message (optional)'),
      el('textarea', { id: 'swap-message', name: 'message', maxlength: '200', rows: '2' }),
      el('p', { class: 'hint' }, 'It stays yours until they say yes.'),
    ],
    submitLabel: 'Send request',
    onSubmit: async (form) => {
      if (!chosen) {
        const error = new Error('Please choose who to ask.');
        error.field = 'targetUserId';
        throw error;
      }
      await send({ targetUserId: chosen.id, message: form.elements.message.value });
    },
  });
  return ok ? chosen : null;
}
