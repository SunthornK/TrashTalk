import { Router } from 'express';
import { HttpError } from '../errors.js';
import {
  hashPassword, verifyPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie, getMe, requireUser,
} from '../auth.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function authRoutes(db) {
  const router = Router();

  router.post('/register', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!name) throw new HttpError(400, 'Please enter your name.', 'name');
    if (name.length > 50) throw new HttpError(400, 'Name must be at most 50 characters.', 'name');
    if (!EMAIL_PATTERN.test(email)) throw new HttpError(400, 'Please enter a valid email.', 'email');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.', 'password');

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) throw new HttpError(409, 'Email already registered.', 'email');

    const { lastInsertRowid } = db.prepare(
      'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, email, hashPassword(password), new Date().toISOString());

    const userId = Number(lastInsertRowid);
    setSessionCookie(res, createSession(db, userId));
    res.status(201).json(getMe(db, userId));
  });

  router.post('/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);

    // Same message whether the email or the password is wrong, so the
    // login form can't be used to find out who has an account.
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'Wrong email or password.');
    }
    setSessionCookie(res, createSession(db, user.id));
    res.json(getMe(db, user.id));
  });

  router.post('/logout', (req, res) => {
    if (req.sessionToken) destroySession(db, req.sessionToken);
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get('/me', requireUser, (req, res) => {
    res.json(req.user);
  });

  return router;
}
