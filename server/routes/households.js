import { Router } from 'express';
import { HttpError } from '../errors.js';
import { transaction } from '../db.js';
import { requireUser, requireHousehold, requireAdmin } from '../auth.js';

// Takes someone out of their household. Their unfinished chores
// become "Nobody", their pending swap requests are cancelled, and their
// completed chores keep their name so the history stays true.
export function removeFromHousehold(db, userId) {
  const now = new Date().toISOString();
  transaction(db, () => {
    db.prepare(`
      UPDATE swap_requests SET status = 'cancelled', resolved_at = ?
      WHERE status = 'pending' AND (requester_id = ? OR target_user_id = ?)
    `).run(now, userId, userId);
    db.prepare(`
      UPDATE assignments SET user_id = NULL
      WHERE user_id = ? AND status = 'assigned'
    `).run(userId);
    db.prepare(`
      UPDATE users SET household_id = NULL, role = 'member' WHERE id = ?
    `).run(userId);
  });
}

export function householdRoutes(db) {
  const router = Router();

  const findMember = db.prepare(
    'SELECT id, name, email, role FROM users WHERE id = ? AND household_id = ?'
  );

  // Look up a member of *my* household from the :id in the URL. Someone in
  // another household gives the same 404 as someone who doesn't exist.
  function memberFromParams(req) {
    const member = findMember.get(Number(req.params.id), req.user.householdId);
    if (!member) throw new HttpError(404, 'Not found');
    return member;
  }

  router.post('/households', requireUser, (req, res) => {
    if (req.user.householdId) throw new HttpError(409, "You're already in a household");
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw new HttpError(400, 'Please give your household a name.', 'name');
    if (name.length > 50) throw new HttpError(400, 'Name must be at most 50 characters.', 'name');

    const householdId = transaction(db, () => {
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO households (name, created_at) VALUES (?, ?)'
      ).run(name, new Date().toISOString());
      db.prepare("UPDATE users SET household_id = ?, role = 'admin' WHERE id = ?")
        .run(lastInsertRowid, req.user.id);
      return Number(lastInsertRowid);
    });
    res.status(201).json({ id: householdId, name });
  });

  router.get('/household', requireHousehold, (req, res) => {
    const householdId = req.user.householdId;
    const household = db.prepare('SELECT id, name FROM households WHERE id = ?').get(householdId);
    const members = db.prepare(
      'SELECT id, name, email, role FROM users WHERE household_id = ? ORDER BY id'
    ).all(householdId);
    const chores = db.prepare(
      'SELECT id, title, frequency FROM chores WHERE household_id = ? ORDER BY id'
    ).all(householdId);
    res.json({ ...household, members, chores });
  });

  router.post('/household/members', requireAdmin, (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = db.prepare('SELECT id, name, email, household_id FROM users WHERE email = ?').get(email);
    if (!user) {
      throw new HttpError(404, 'No account with that email. Ask them to create an account first.', 'email');
    }
    if (user.household_id) {
      throw new HttpError(409, 'That person is already in a household.', 'email');
    }
    db.prepare("UPDATE users SET household_id = ?, role = 'member' WHERE id = ?")
      .run(req.user.householdId, user.id);
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: 'member' });
  });

  // Admin only: take someone out of the household.
  router.delete('/household/members/:id', requireAdmin, (req, res) => {
    const member = memberFromParams(req);
    if (member.id === req.user.id) throw new HttpError(400, "You can't remove yourself.");
    removeFromHousehold(db, member.id);
    res.status(204).end();
  });

  return router;
}
