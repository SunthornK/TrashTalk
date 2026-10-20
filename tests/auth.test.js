import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../server/auth.js';
import { startServer, client } from './helpers.js';

let server;
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { await server.close(); });

const alex = { name: 'Alex', email: 'alex@example.com', password: 'password123' };

test('hashPassword output verifies and differs per call', () => {
  const a = hashPassword('password123');
  const b = hashPassword('password123');
  assert.notEqual(a, b);
  assert.ok(verifyPassword('password123', a));
  assert.ok(!verifyPassword('wrong-password', a));
});

test('register logs you in', async () => {
  const c = client(server.base);
  const reg = await c.req('POST', '/api/register', alex);
  assert.equal(reg.status, 201);
  const me = await c.req('GET', '/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.name, 'Alex');
  assert.equal(me.body.email, 'alex@example.com');
  assert.equal(me.body.householdId, null);
});

test('register validates', async () => {
  const c = client(server.base);
  const noName = await c.req('POST', '/api/register', { ...alex, name: '  ' });
  assert.equal(noName.status, 400);
  assert.equal(noName.body.field, 'name');

  const badEmail = await c.req('POST', '/api/register', { ...alex, email: 'not-an-email' });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.body.field, 'email');

  const shortPw = await c.req('POST', '/api/register', { ...alex, password: '1234567' });
  assert.equal(shortPw.status, 400);
  assert.equal(shortPw.body.field, 'password');
  assert.match(shortPw.body.error, /at least 8/);
});

test('duplicate email is refused case-insensitively', async () => {
  await client(server.base).req('POST', '/api/register', alex);
  const dup = await client(server.base).req('POST', '/api/register', { ...alex, email: 'Alex@Example.com' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.field, 'email');

  const login = await client(server.base).req('POST', '/api/login', { email: 'ALEX@example.com', password: 'password123' });
  assert.equal(login.status, 200);
});

test('wrong password and unknown email give the same message', async () => {
  await client(server.base).req('POST', '/api/register', alex);
  const wrong = await client(server.base).req('POST', '/api/login', { email: alex.email, password: 'nope-nope' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'Wrong email or password.');

  const unknown = await client(server.base).req('POST', '/api/login', { email: 'who@example.com', password: 'nope-nope' });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, 'Wrong email or password.');
});

test('logout ends the session', async () => {
  const c = client(server.base);
  await c.req('POST', '/api/register', alex);
  const out = await c.req('POST', '/api/logout');
  assert.equal(out.status, 204);
  const me = await c.req('GET', '/api/me');
  assert.equal(me.status, 401);
});

test('session row stores a hash, not the token', async () => {
  const res = await fetch(server.base + '/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(alex),
  });
  const token = res.headers.get('set-cookie').split(';')[0].split('=')[1];
  const row = server.db.prepare('SELECT token_hash FROM sessions').get();
  assert.ok(token.length > 20);
  assert.notEqual(row.token_hash, token);
});

test('session cookie is HttpOnly and SameSite=Lax', async () => {
  const res = await fetch(server.base + '/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(alex),
  });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^sid=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});
