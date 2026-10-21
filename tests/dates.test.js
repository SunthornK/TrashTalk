import { test } from 'node:test';
import assert from 'node:assert/strict';
import { today, addDays, addFrequency, startOfWeek, formatShort, weekLabel, localDate } from '../public/js/dates.js';

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

test('addFrequency', () => {
  assert.equal(addFrequency('2026-10-20', 'daily'), '2026-10-21');
  assert.equal(addFrequency('2026-10-20', 'weekly'), '2026-10-27');
  assert.equal(addFrequency('2026-10-20', 'monthly'), '2026-11-20');
  assert.equal(addFrequency('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(addFrequency('2020-01-01', 'once'), today());
});

test('startOfWeek is the Monday', () => {
  assert.equal(startOfWeek('2026-10-25'), '2026-10-19'); // Sunday → Monday before
  assert.equal(startOfWeek('2026-10-19'), '2026-10-19'); // Monday stays
  assert.equal(startOfWeek('2026-10-21'), '2026-10-19');
});

test('formatShort', () => {
  assert.equal(formatShort('2026-10-20'), 'Tue 20 Oct');
});

test('weekLabel', () => {
  assert.equal(weekLabel('2026-10-19'), '19–25 Oct');
  assert.equal(weekLabel('2026-10-26'), '26 Oct – 1 Nov');
});
