import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the chores area is not a live region (screen readers would re-read it on every update)', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const main = html.match(/<main[^>]*id="content"[^>]*>/)[0];
  assert.doesNotMatch(main, /aria-live/);
});
