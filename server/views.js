// Turns database rows into the JSON shapes the browser receives. Shared by
// several routes so every response describes an assignment the same way.
import { HttpError } from './errors.js';
import { today } from '../public/js/dates.js';

// One query with JOINs: for each assignment, also fetch its chore, the
// assigned user, and any pending swap (and who was asked).
const ASSIGNMENT_SELECT = `
  SELECT a.id, a.chore_id AS choreId, c.title AS choreTitle,
         a.user_id AS userId, u.name AS userName,
         a.due_date AS dueDate, a.status, a.completed_at AS completedAt,
         ps.id AS pendingSwapId, ps.target_user_id AS pendingTargetId, pt.name AS pendingTargetName
  FROM assignments a
  JOIN chores c ON c.id = a.chore_id
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN swap_requests ps ON ps.assignment_id = a.id AND ps.status = 'pending'
  LEFT JOIN users pt ON pt.id = ps.target_user_id
`;

// "overdue" is worked out here, every time, so it can never be out of date.
function toView(row) {
  const todayString = today();
  return {
    id: row.id,
    choreId: row.choreId,
    choreTitle: row.choreTitle,
    userId: row.userId,
    userName: row.userName,
    dueDate: row.dueDate,
    status: row.status,
    completedAt: row.completedAt,
    overdue: row.status === 'assigned' && row.dueDate < todayString,
    pendingSwap: row.pendingSwapId
      ? { id: row.pendingSwapId, targetUserId: row.pendingTargetId, targetName: row.pendingTargetName }
      : null,
  };
}

// Every unfinished assignment plus the latest completed one per chore
// (what the chore cards show).
export function assignmentsQuery(db, householdId) {
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

// The pending requests a user is involved in: ones asking them (incoming)
// and ones they sent (sent).
export function swapsQuery(db, userId) {
  const incoming = db.prepare(`
    SELECT s.id, s.assignment_id AS assignmentId, c.title AS choreTitle, a.due_date AS dueDate,
           r.name AS requesterName, s.message, s.created_at AS createdAt
    FROM swap_requests s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN chores c ON c.id = a.chore_id
    JOIN users r ON r.id = s.requester_id
    WHERE s.target_user_id = ? AND s.status = 'pending'
    ORDER BY s.created_at
  `).all(userId);
  const sent = db.prepare(`
    SELECT s.id, s.assignment_id AS assignmentId, c.title AS choreTitle, a.due_date AS dueDate,
           t.name AS targetName, s.created_at AS createdAt
    FROM swap_requests s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN chores c ON c.id = a.chore_id
    JOIN users t ON t.id = s.target_user_id
    WHERE s.requester_id = ? AND s.status = 'pending'
    ORDER BY s.created_at
  `).all(userId);
  return { incoming, sent };
}

// The raw assignment row, but only if it belongs to this household.
export function findAssignmentInHousehold(db, id, householdId) {
  const row = db.prepare(`
    SELECT a.* FROM assignments a
    JOIN chores c ON c.id = a.chore_id
    WHERE a.id = ? AND c.household_id = ?
  `).get(Number(id), householdId);
  if (!row) throw new HttpError(404, 'Not found');
  return row;
}
