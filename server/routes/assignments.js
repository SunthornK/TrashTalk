import { Router } from 'express';
import { HttpError } from '../errors.js';
import { transaction } from '../db.js';
import { requireHousehold, requireAdmin } from '../auth.js';
import { requireDate, requireMember } from '../validate.js';
import { assignmentsQuery, assignmentView, findAssignmentInHousehold } from '../views.js';

export function assignmentRoutes(db) {
  const router = Router();

  const cancelPendingSwap = db.prepare(`
    UPDATE swap_requests SET status = 'cancelled', resolved_at = ?
    WHERE assignment_id = ? AND status = 'pending'
  `);

  router.get('/assignments', requireHousehold, (req, res) => {
    res.json(assignmentsQuery(db, req.user.householdId));
  });

  router.post('/assignments', requireAdmin, (req, res) => {
    const householdId = req.user.householdId;
    const chore = db.prepare('SELECT id FROM chores WHERE id = ? AND household_id = ?')
      .get(Number(req.body?.choreId), householdId);
    if (!chore) throw new HttpError(400, 'Choose a chore.', 'choreId');
    const userId = requireMember(db, req.body?.userId, householdId);
    const dueDate = requireDate(req.body?.dueDate, 'dueDate');

    const { lastInsertRowid } = db.prepare(
      'INSERT INTO assignments (chore_id, user_id, due_date, created_at) VALUES (?, ?, ?, ?)'
    ).run(chore.id, userId, dueDate, new Date().toISOString());
    res.status(201).json(assignmentView(db, lastInsertRowid));
  });

  // Reassign (admin): give an unfinished chore to someone else.
  router.patch('/assignments/:id', requireAdmin, (req, res) => {
    const assignment = findAssignmentInHousehold(db, req.params.id, req.user.householdId);
    if (assignment.status === 'completed') throw new HttpError(409, 'This chore is already done.');
    const userId = requireMember(db, req.body?.userId, req.user.householdId);

    transaction(db, () => {
      cancelPendingSwap.run(new Date().toISOString(), assignment.id);
      db.prepare('UPDATE assignments SET user_id = ? WHERE id = ?').run(userId, assignment.id);
    });
    res.json(assignmentView(db, assignment.id));
  });

  // Mark done: only the person it's assigned to.
  router.post('/assignments/:id/complete', requireHousehold, (req, res) => {
    const assignment = findAssignmentInHousehold(db, req.params.id, req.user.householdId);
    if (assignment.user_id !== req.user.id) {
      throw new HttpError(403, "Only the person it's assigned to can mark it done.");
    }
    if (assignment.status === 'completed') throw new HttpError(409, 'This chore is already done.');

    const now = new Date().toISOString();
    transaction(db, () => {
      db.prepare("UPDATE assignments SET status = 'completed', completed_at = ? WHERE id = ?")
        .run(now, assignment.id);
      cancelPendingSwap.run(now, assignment.id);
    });
    res.json(assignmentView(db, assignment.id));
  });

  return router;
}
