// Handoff requests (spec §7): "Can you take my chore?" → accept / reject / cancel.
import { Router } from 'express';
import { HttpError } from '../errors.js';
import { transaction, isUniqueViolation } from '../db.js';
import { requireHousehold } from '../auth.js';
import { requireMember } from '../validate.js';
import { swapsQuery, assignmentView, findAssignmentInHousehold } from '../views.js';

const GONE = 'This request is no longer available.';

export function swapRoutes(db) {
  const router = Router();

  // A swap I'm part of (as requester or target), in my household. Anyone
  // else gets the same 404 as for a swap that doesn't exist.
  function mySwap(req) {
    const swap = db.prepare(`
      SELECT s.* FROM swap_requests s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN chores c ON c.id = a.chore_id
      WHERE s.id = ? AND c.household_id = ? AND ? IN (s.requester_id, s.target_user_id)
    `).get(Number(req.params.id), req.user.householdId, req.user.id);
    if (!swap) throw new HttpError(404, 'Not found');
    return swap;
  }

  // Finish a pending swap. The WHERE clause only matches while it's still
  // pending, so if two clicks race, the second one changes 0 rows.
  function resolve(swapId, newStatus) {
    const { changes } = db.prepare(`
      UPDATE swap_requests SET status = ?, resolved_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(newStatus, new Date().toISOString(), swapId);
    if (changes === 0) throw new HttpError(409, GONE);
  }

  router.get('/swaps', requireHousehold, (req, res) => {
    res.json(swapsQuery(db, req.user.id));
  });

  router.post('/swaps', requireHousehold, (req, res) => {
    const assignment = findAssignmentInHousehold(db, req.body?.assignmentId, req.user.householdId);
    if (assignment.user_id !== req.user.id) {
      throw new HttpError(403, 'You can only ask about your own chores.');
    }
    if (assignment.status === 'completed') throw new HttpError(409, 'This chore is already done.');
    if (Number(req.body?.targetUserId) === req.user.id) {
      throw new HttpError(400, 'Choose someone else in your household.', 'targetUserId');
    }
    const targetId = requireMember(db, req.body?.targetUserId, req.user.householdId, 'targetUserId');
    const message = String(req.body?.message ?? '').trim();
    if (message.length > 200) throw new HttpError(400, 'Keep the message under 200 characters.', 'message');

    try {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO swap_requests (assignment_id, requester_id, target_user_id, message, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(assignment.id, req.user.id, targetId, message || null, new Date().toISOString());
      res.status(201).json({ id: Number(lastInsertRowid), assignmentId: assignment.id, targetUserId: targetId, status: 'pending' });
    } catch (err) {
      // The one_pending_swap index refused a second pending request.
      if (isUniqueViolation(err)) throw new HttpError(409, 'This chore already has a pending request.');
      throw err;
    }
  });

  router.post('/swaps/:id/accept', requireHousehold, (req, res) => {
    const swap = mySwap(req);
    if (swap.target_user_id !== req.user.id) throw new HttpError(403, 'Only the person asked can accept.');

    // Both steps or neither. Each UPDATE only matches if nothing changed in
    // the meantime; 0 changed rows means someone else got there first.
    transaction(db, () => {
      resolve(swap.id, 'accepted');
      const { changes } = db.prepare(`
        UPDATE assignments SET user_id = ?
        WHERE id = ? AND user_id = ? AND status = 'assigned'
      `).run(swap.target_user_id, swap.assignment_id, swap.requester_id);
      if (changes === 0) throw new HttpError(409, GONE); // rolls back the first UPDATE too
    });
    res.json(assignmentView(db, swap.assignment_id));
  });

  router.post('/swaps/:id/reject', requireHousehold, (req, res) => {
    const swap = mySwap(req);
    if (swap.target_user_id !== req.user.id) throw new HttpError(403, 'Only the person asked can say no.');
    resolve(swap.id, 'rejected');
    res.json({ id: swap.id, status: 'rejected' });
  });

  router.post('/swaps/:id/cancel', requireHousehold, (req, res) => {
    const swap = mySwap(req);
    if (swap.requester_id !== req.user.id) throw new HttpError(403, 'Only the person who asked can cancel.');
    resolve(swap.id, 'cancelled');
    res.json({ id: swap.id, status: 'cancelled' });
  });

  return router;
}
