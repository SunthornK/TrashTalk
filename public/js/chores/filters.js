// Pure functions that decide *what* to show. No page code here, so they
// can be tested with node:test like the server.
import { addDays, addFrequency, today } from '../dates.js';

const byDueDate = (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id;

// The "Show" filter.
export function applyFilter(assignments, filter, meId) {
  switch (filter) {
    case 'mine': return assignments.filter((a) => a.userId === meId);
    case 'waiting': return assignments.filter((a) => a.pendingSwap !== null);
    case 'needs': return assignments.filter((a) => a.status === 'assigned' && (a.overdue || a.userId === null));
    default: return assignments;
  }
}

// One card per active chore. "current" is the assignment the card is about:
// the earliest unfinished one, or the latest finished one if all are done.
export function buildChoreCards(chores, assignments) {
  return chores.filter((chore) => chore.active).map((chore) => {
    const mine = assignments.filter((a) => a.choreId === chore.id).sort(byDueDate);
    const unfinished = mine.filter((a) => a.status === 'assigned');
    const finished = mine.filter((a) => a.status === 'completed');
    return {
      chore,
      current: unfinished[0] ?? finished.at(-1) ?? null,
      upcoming: unfinished.slice(1),
    };
  });
}

export function sortCards(cards, sort) {
  const copy = [...cards];
  if (sort === 'name') return copy.sort((x, y) => x.chore.title.localeCompare(y.chore.title));
  return copy.sort((x, y) => {
    if (!x.current) return y.current ? 1 : 0;
    if (!y.current) return -1;
    return byDueDate(x.current, y.current);
  });
}

// Should the 10-second refresh redraw the page? Only if the data actually
// changed, and never while a dialog is open: redrawing would wipe what
// someone is typing.
export function shouldRender(previousJson, nextJson, dialogOpen) {
  return !dialogOpen && previousJson !== nextJson;
}

// "Everyone" shows every card (including chores nobody is assigned to yet);
// the other filters keep the cards whose current assignment matches.
export function filterCards(cards, filter, meId) {
  if (filter === 'everyone') return cards;
  return cards.filter((card) => card.current && applyFilter([card.current], filter, meId).length > 0);
}

// --- Week view -----------------------------------------------------------

function inWeek(assignment, monday) {
  return assignment.dueDate >= monday && assignment.dueDate <= addDays(monday, 6);
}

// 0 = Monday … 6 = Sunday
function dayIndex(dateString, monday) {
  for (let i = 0; i < 7; i++) if (addDays(monday, i) === dateString) return i;
  return -1;
}

// The rows of the fridge chart: you first, then the other members, then
// people who have left (only in weeks where they had chores), then
// "Nobody" (only if a chore that week has no one). Each row has 7 day cells.
export function weekRows(assignments, members, meId, monday) {
  const thisWeek = assignments.filter((a) => inWeek(a, monday)).sort(byDueDate);
  const row = (label, userId, isMe = false) => {
    const days = Array.from({ length: 7 }, () => []);
    for (const a of thisWeek) if (a.userId === userId) days[dayIndex(a.dueDate, monday)].push(a);
    return { label, userId, isMe, days };
  };

  const me = members.find((m) => m.id === meId);
  const rows = me ? [row('You', me.id, true)] : [];
  for (const member of members) if (member.id !== meId) rows.push(row(member.name, member.id));

  const memberIds = new Set(members.map((m) => m.id));
  const formerIds = [...new Set(thisWeek.filter((a) => a.userId !== null && !memberIds.has(a.userId)).map((a) => a.userId))];
  for (const id of formerIds) {
    const name = thisWeek.find((a) => a.userId === id).userName;
    rows.push(row(`${name} (left)`, id));
  }
  if (thisWeek.some((a) => a.userId === null)) rows.push(row('Nobody', null));
  return rows;
}

// "This week so far": per current member, how many of their chores due
// this week are done.
export function weekProgress(assignments, members, monday) {
  const thisWeek = assignments.filter((a) => inWeek(a, monday));
  return members.map((member) => {
    const theirs = thisWeek.filter((a) => a.userId === member.id);
    return {
      userId: member.id,
      name: member.name,
      done: theirs.filter((a) => a.status === 'completed').length,
      total: theirs.length,
    };
  });
}

// --- Admin: "+ Assign next" ------------------------------------------------

// What to pre-fill: the person after the last one who had this chore (in
// member order, wrapping round), due on the last due date + the chore's
// frequency. With no history: the first member, due today.
export function suggestNext(chore, assignments, members) {
  const history = assignments.filter((a) => a.choreId === chore.id).sort(byDueDate);
  const last = history.at(-1);
  if (!last) return { userId: members[0]?.id ?? null, dueDate: today() };
  const lastIndex = members.findIndex((m) => m.id === last.userId);
  const next = lastIndex === -1 ? members[0] : members[(lastIndex + 1) % members.length];
  return { userId: next?.id ?? null, dueDate: addFrequency(last.dueDate, chore.frequency) };
}
