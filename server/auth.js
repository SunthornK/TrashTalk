// Passwords, sessions and the middleware that protects routes.
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { HttpError } from './errors.js';

const SESSION_DAYS = 7;
const KEY_LENGTH = 64;

// --- Passwords ---------------------------------------------------------

// A new random salt per user means two people with the same password get
// different hashes. scrypt is deliberately slow, which makes guessing hard.
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  // timingSafeEqual takes the same time whether the first byte or the last
  // byte differs, so an attacker can't learn anything from response times.
  return timingSafeEqual(expected, actual);
}

// --- Cookies and sessions ---------------------------------------------

export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

// Only the hash of the token goes in the database. If the database leaked,
// nobody could use the stored values to log in as someone else.
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, expires.toISOString());
  return token;
}

export function destroySession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function setSessionCookie(res, token) {
  res.cookie('sid', token, {
    httpOnly: true,         // page JavaScript can't read it, so XSS can't steal it
    sameSite: 'lax',        // not sent on form posts from other websites
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie('sid', { path: '/' });
}

// --- Who is logged in --------------------------------------------------

const ME_COLUMNS = `
  u.id, u.name, u.email, u.role,
  u.household_id AS householdId, h.name AS householdName
`;

// The shape returned by GET /api/me and stored on req.user.
export function getMe(db, userId) {
  return db.prepare(`
    SELECT ${ME_COLUMNS}
    FROM users u LEFT JOIN households h ON h.id = u.household_id
    WHERE u.id = ?
  `).get(userId);
}

// Runs on every request: turns the sid cookie into req.user (or null).
export function loadUser(db) {
  const findBySession = db.prepare(`
    SELECT ${ME_COLUMNS}
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN households h ON h.id = u.household_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `);
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie).sid;
    req.sessionToken = token;
    req.user = token ? findBySession.get(sha256(token), new Date().toISOString()) ?? null : null;
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in');
  next();
}

export function requireHousehold(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in');
  if (!req.user.householdId) throw new HttpError(403, 'Join a household first');
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in');
  if (!req.user.householdId) throw new HttpError(403, 'Join a household first');
  if (req.user.role !== 'admin') throw new HttpError(403, "You don't have permission to do that.");
  next();
}
