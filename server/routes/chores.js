import { Router } from 'express';
import { HttpError } from '../errors.js';
import { transaction } from '../db.js';
import { requireAdmin } from '../auth.js';
import { requireText, requireFrequency } from '../validate.js';

function toChore(row) {
  return { id: row.id, title: row.title, frequency: row.frequency };
}

export function choreRoutes(db) {
  const router = Router();

  // A chore of *my* household from the :id in the URL; anything else is 404.
  function choreFromParams(req) {
    const chore = db.prepare('SELECT * FROM chores WHERE id = ? AND household_id = ?')
      .get(Number(req.params.id), req.user.householdId);
    if (!chore) throw new HttpError(404, 'Not found');
    return chore;
  }

  router.post('/chores', requireAdmin, (req, res) => {
    const title = requireText(req.body?.title, 'title', 'a chore name', 60);
    const frequency = requireFrequency(req.body?.frequency);
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO chores (household_id, title, frequency, created_at) VALUES (?, ?, ?, ?)'
    ).run(req.user.householdId, title, frequency, new Date().toISOString());
    res.status(201).json(toChore(db.prepare('SELECT * FROM chores WHERE id = ?').get(lastInsertRowid)));
  });

  // Edit the name and how often.
  router.patch('/chores/:id', requireAdmin, (req, res) => {
    const chore = choreFromParams(req);
    const title = requireText(req.body?.title, 'title', 'a chore name', 60);
    const frequency = requireFrequency(req.body?.frequency);
    db.prepare('UPDATE chores SET title = ?, frequency = ? WHERE id = ?').run(title, frequency, chore.id);
    res.json(toChore(db.prepare('SELECT * FROM chores WHERE id = ?').get(chore.id)));
  });

  // Delete a chore with all its turns. Swap requests point at the turns, so
  // they go first; all three deletes happen together or not at all.
  router.delete('/chores/:id', requireAdmin, (req, res) => {
    const chore = choreFromParams(req);
    transaction(db, () => {
      db.prepare('DELETE FROM swap_requests WHERE assignment_id IN (SELECT id FROM assignments WHERE chore_id = ?)').run(chore.id);
      db.prepare('DELETE FROM assignments WHERE chore_id = ?').run(chore.id);
      db.prepare('DELETE FROM chores WHERE id = ?').run(chore.id);
    });
    res.status(204).end();
  });

  return router;
}
