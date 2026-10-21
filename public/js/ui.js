// Small helpers for building the page and giving feedback, shared by all pages.

// Create an element in one call:
//   el('button', { class: 'primary', onclick: save }, 'Save')
// - class / text set className / textContent
// - on<event> adds an event listener
// - anything else becomes an attribute (true → present, false/null → left out)
// - children can be elements, strings, or arrays of them
export function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'class') element.className = value;
    else if (name === 'text') element.textContent = value;
    else if (name.startsWith('on') && typeof value === 'function') {
      element.addEventListener(name.slice(2), value);
    } else element.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

// A short message in the corner. The #toasts box has aria-live="polite", so
// screen readers read it out too.
export function toast(message, kind = 'ok') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const note = el('div', { class: `toast toast--${kind} wobble`, role: kind === 'error' ? 'alert' : 'status' }, message);
  box.append(note);
  setTimeout(() => note.remove(), 4000);
}

// Show a message under one input, and mark the input invalid.
export function showFieldError(form, field, message) {
  const input = form.elements[field];
  if (!input) return toast(message, 'error');
  const id = `${input.id || field}-error`;
  let note = document.getElementById(id);
  if (!note) {
    note = el('small', { id, class: 'field-error' });
    input.after(note);
  }
  note.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', id);
  input.focus();
}

// A message for the whole form (e.g. "Wrong email or password."), shown at
// the top of the form. role="alert" makes screen readers announce it.
export function showFormError(form, message) {
  let note = form.querySelector('.form-error');
  if (!note) {
    note = el('p', { class: 'form-error', role: 'alert' });
    form.prepend(note);
  }
  note.textContent = message;
}

export function clearFormErrors(form) {
  for (const note of form.querySelectorAll('.field-error, .form-error')) note.remove();
  for (const input of form.querySelectorAll('[aria-invalid]')) {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
}

// Disable a button while its request runs, so a double-click can't send it twice.
export async function withBusy(button, fn) {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

// Show an error from api(): next to its input if the server named a field
// in this form, at the top of the form for other form errors, and as a
// toast when there's no form.
export function handleError(err, form) {
  const message = err.message ?? 'Something went wrong, try again';
  if (form && err.field && form.elements[err.field]) showFieldError(form, err.field, message);
  else if (form) showFormError(form, message);
  else toast(message, 'error');
}

// "Are you sure?" using the built-in <dialog> (keyboard and Esc work).
// Resolves to true if the person confirms.
export function confirmDialog(message, confirmLabel) {
  return new Promise((resolve) => {
    const dialog = el('dialog', {},
      el('article', { class: 'wobble' },
        el('p', {}, message),
        el('footer', {},
          el('button', { class: 'secondary', value: 'cancel', onclick: () => dialog.close('cancel') }, 'Cancel'),
          el('button', { class: 'danger', value: 'ok', onclick: () => dialog.close('ok') }, confirmLabel),
        ),
      ),
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
