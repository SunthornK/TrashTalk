// "You're not in a household yet" (spec §8.3): ask the admin to add you,
// or start your own household.
import { api } from '../api.js';
import { el, clearFormErrors, handleError, withBusy } from '../ui.js';

export function renderNoHousehold(container, me, onJoined) {
  const input = el('input', { id: 'household-name', name: 'name', placeholder: 'e.g. Flat 4B', autocomplete: 'off' });
  const submit = el('button', { type: 'submit' }, 'Create & become admin');
  const form = el('form', { novalidate: true },
    el('label', { for: 'household-name' }, 'Start a new household'),
    input,
    submit,
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    try {
      await withBusy(submit, () => api('POST', '/households', { name: input.value }));
      onJoined();
    } catch (err) {
      handleError(err, form);
    }
  });

  container.replaceChildren(el('article', { class: 'no-household wobble' },
    el('h2', {}, "You're not in a household yet"),
    el('p', {}, 'Ask your household\'s admin to add ', el('strong', {}, me.email), '. This page updates once they do.'),
    el('p', { class: 'or muted' }, '— or —'),
    form,
  ));
}
