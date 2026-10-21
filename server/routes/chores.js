import { Router } from 'express';
import { HttpError } from '../errors.js';
import { transaction } from '../db.js';
import { requireAdmin } from '../auth.js';
import { requireText, requireFrequency } from '../validate.js';

function toChore(row) {
  return { id: row.id, title: row.title, frequency: row.frequency, active: row.active === 1 };
}

export function choreRoutes(db) {
  const router = Router();

  router.post('/chores', requireAdmin, (req, res) => {
    const title = requireText(req.body?.title, 'title', 'a chore name', 60);
    const frequency = requireFrequency(req.body?.frequency);
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO chores (household_id, title, frequency, created_at) VALUES (?, ?, ?, ?)'
    ).run(req.user.householdId, title, frequency, new Date().toISOString());
    res.status(201).json(toChore(db.prepare('SELECT * FROM chores WHERE id = ?').get(lastInsertRowid)));
  });

  // Edit the title or frequency, archive (active: false) or restore (active: true).
  router.patch('/chores/:id', requireAdmin, (req, res) => {
    const chore = db.prepare('SELECT * FROM chores WHERE id = ? AND household_id = ?')
      .get(Number(req.params.id), req.user.householdId);
    if (!chore) throw new HttpError(404, 'Not found');

    const body = req.body ?? {};
    const title = body.title === undefined ? chore.title : requireText(body.title, 'title', 'a chore name', 60);
    const frequency = body.frequency === undefined ? chore.frequency : requireFrequency(body.frequency);
    const active = body.active === undefined ? chore.active === 1 : Boolean(body.active);

    transaction(db, () => {
      if (chore.active === 1 && !active) {
        // Archiving removes the chore's unfinished assignments (and their
        // swap requests, which point at them). Completed ones stay as history.
        const openIds = `SELECT id FROM assignments WHERE chore_id = ? AND status = 'assigned'`;
        db.prepare(`DELETE FROM swap_requests WHERE assignment_id IN (${openIds})`).run(chore.id);
        db.prepare(`DELETE FROM assignments WHERE id IN (${openIds})`).run(chore.id);
      }
      db.prepare('UPDATE chores SET title = ?, frequency = ?, active = ? WHERE id = ?')
        .run(title, frequency, active ? 1 : 0, chore.id);
    });
    res.json(toChore(db.prepare('SELECT * FROM chores WHERE id = ?').get(chore.id)));
  });

  return router;
}
