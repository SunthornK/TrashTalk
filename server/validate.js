// Small input checks shared by several routes. Each throws a 400 HttpError
// naming the field, so the browser can show the message next to the input.
import { HttpError } from './errors.js';

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'once'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function requireText(value, field, label, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) throw new HttpError(400, `Please enter ${label}.`, field);
  if (text.length > maxLength) throw new HttpError(400, `Must be at most ${maxLength} characters.`, field);
  return text;
}

export function requireFrequency(value) {
  if (!FREQUENCIES.includes(value)) {
    throw new HttpError(400, 'Choose daily, weekly, monthly or once.', 'frequency');
  }
  return value;
}

export function requireDate(value, field) {
  if (!DATE_PATTERN.test(String(value ?? '')) || Number.isNaN(new Date(value).getTime())) {
    throw new HttpError(400, 'Please choose a valid date.', field);
  }
  return value;
}

// The user must be a current member of this household.
export function requireMember(db, userId, householdId, field = 'userId') {
  const member = db.prepare('SELECT id FROM users WHERE id = ? AND household_id = ?')
    .get(Number(userId), householdId);
  if (!member) throw new HttpError(400, 'Choose someone in your household.', field);
  return member.id;
}
