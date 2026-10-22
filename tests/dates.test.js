import { test } from 'node:test';
import assert from 'node:assert/strict';
import { today, addDays, formatShort, localDate } from '../public/js/dates.js';

test('today is a YYYY-MM-DD string', () => {
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});

test('localDate formats a Date in local time', () => {
  assert.equal(localDate(new Date(2026, 9, 20, 23, 59)), '2026-10-20');
});

test('addDays crosses month ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
});

test('formatShort', () => {
  assert.equal(formatShort('2026-10-20'), 'Tue 20 Oct');
});

