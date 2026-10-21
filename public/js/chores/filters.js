// Pure functions that decide *what* to show. No page code here, so they
// can be tested with node:test like the server.

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

// "Everyone" shows every card (including chores nobody is assigned to yet);
// the other filters keep the cards whose current assignment matches.
export function filterCards(cards, filter, meId) {
  if (filter === 'everyone') return cards;
  return cards.filter((card) => card.current && applyFilter([card.current], filter, meId).length > 0);
}
