// Turns database rows into the JSON shapes the browser receives. Shared by
// several routes so every response describes an assignment the same way.
import { HttpError } from './errors.js';
import { today, localDate } from '../public/js/dates.js';

// One query with JOINs: for each assignment, also fetch its chore, the
// assigned user, any pending swap (and who was asked), and who handed it
// over if it came through an accepted swap.
const ASSIGNMENT_SELECT = `
  SELECT a.id, a.chore_id AS choreId, c.title AS choreTitle,
         a.user_id AS userId, u.name AS userName,
         (u.id IS NOT NULL AND (u.household_id IS NULL OR u.household_id <> c.household_id)) AS userLeft,
         a.due_date AS dueDate, a.status, a.completed_at AS completedAt,
         ps.id AS pendingSwapId, ps.target_user_id AS pendingTargetId, pt.name AS pendingTargetName,
         (SELECT r.name FROM swap_requests acc JOIN users r ON r.id = acc.requester_id
           WHERE acc.assignment_id = a.id AND acc.status = 'accepted'
           ORDER BY acc.resolved_at DESC LIMIT 1) AS viaName
  FROM assignments a
  JOIN chores c ON c.id = a.chore_id
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN swap_requests ps ON ps.assignment_id = a.id AND ps.status = 'pending'
  LEFT JOIN users pt ON pt.id = ps.target_user_id
`;

// The computed fields are worked out here, every time, so they can never
// be out of date.
function toView(row) {
  const todayString = today();
  return {
    id: row.id,
    choreId: row.choreId,
    choreTitle: row.choreTitle,
    userId: row.userId,
    userName: row.userName,
    userLeft: row.userLeft === 1,
    dueDate: row.dueDate,
    status: row.status,
    completedAt: row.completedAt,
    overdue: row.status === 'assigned' && row.dueDate < todayString,
    wasLate: row.status === 'completed' && localDate(new Date(row.completedAt)) > row.dueDate,
    pendingSwap: row.pendingSwapId
      ? { id: row.pendingSwapId, targetUserId: row.pendingTargetId, targetName: row.pendingTargetName }
      : null,
    viaName: row.viaName,
  };
}

// With from/to: everything due in that range (used by the week view, also
// for past weeks). Without: every unfinished assignment plus the latest
// completed one per chore (used by the chore cards).
export function assignmentsQuery(db, householdId, { from, to } = {}) {
  if (from && to) {
    return db.prepare(`${ASSIGNMENT_SELECT}
      WHERE c.household_id = ? AND a.due_date BETWEEN ? AND ?
      ORDER BY a.due_date, a.id
    `).all(householdId, from, to).map(toView);
  }
  return db.prepare(`${ASSIGNMENT_SELECT}
    WHERE c.household_id = ? AND (
      a.status = 'assigned' OR a.id = (
        SELECT a2.id FROM assignments a2
        WHERE a2.chore_id = a.chore_id AND a2.status = 'completed'
        ORDER BY a2.due_date DESC, a2.id DESC LIMIT 1
      )
    )
    ORDER BY a.due_date, a.id
  `).all(householdId).map(toView);
}

export function assignmentView(db, id) {
  return toView(db.prepare(`${ASSIGNMENT_SELECT} WHERE a.id = ?`).get(id));
}

// The raw assignment row, but only if it belongs to this household.
export function findAssignmentInHousehold(db, id, householdId) {
  const row = db.prepare(`
    SELECT a.*, c.active AS choreActive FROM assignments a
    JOIN chores c ON c.id = a.chore_id
    WHERE a.id = ? AND c.household_id = ?
  `).get(Number(id), householdId);
  if (!row) throw new HttpError(404, 'Not found');
  return row;
}
