// The login page: one form that switches between "Log in" and "Create account".
import { api } from './api.js';
import { clearFormErrors, handleError, withBusy } from './ui.js';

const form = document.getElementById('auth-form');
const title = document.getElementById('title');
const nameField = document.getElementById('name-field');
const password = document.getElementById('password');
const submit = document.getElementById('submit');
const switchText = document.getElementById('switch-text');
const switchButton = document.getElementById('switch');

let mode = 'login'; // or 'register'

function showMode() {
  const registering = mode === 'register';
  title.textContent = registering ? 'Create an account' : 'Log in';
  submit.textContent = registering ? 'Create account' : 'Log in';
  nameField.hidden = !registering;
  password.autocomplete = registering ? 'new-password' : 'current-password';
  switchText.textContent = registering ? 'Already have an account?' : 'New here?';
  switchButton.textContent = registering ? 'Log in' : 'Create an account';
  clearFormErrors(form);
}

switchButton.addEventListener('click', () => {
  mode = mode === 'login' ? 'register' : 'login';
  showMode();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault(); // stay on the page: we send the data with fetch instead
  clearFormErrors(form);

  const body = { email: form.elements.email.value, password: form.elements.password.value };
  if (mode === 'register') body.name = form.elements.name.value;

  try {
    await withBusy(submit, () => api('POST', mode === 'login' ? '/login' : '/register', body));
    location.href = '/'; // logged in: go to the chores page
  } catch (err) {
    handleError(err, form);
  }
});

// Already logged in? Skip the login page.
api('GET', '/me').then(() => { location.href = '/'; }).catch(() => {});
