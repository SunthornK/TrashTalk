// Everything the Chores page knows, in one place. The render functions only
// read from here; after any change we reload from the server and redraw.
import { api } from '../api.js';

export const state = {
  me: null,                            // GET /api/me
  household: null,                     // GET /api/household: { name, members, chores }
  assignments: [],                     // GET /api/assignments (unfinished + latest done)
  swaps: { incoming: [], sent: [] },   // GET /api/swaps
  filter: 'everyone',                  // 'everyone' | 'mine' | 'waiting'
  sort: 'due',                         // 'due' | 'name'
};

// Fetch everything the page needs. The household requests run at the same
// time (Promise.all) instead of one after another.
export async function fetchAll() {
  const me = await api('GET', '/me');
  if (!me.householdId) {
    return { me, household: null, assignments: [], swaps: { incoming: [], sent: [] } };
  }
  const [household, assignments, swaps] = await Promise.all([
    api('GET', '/household'),
    api('GET', '/assignments'),
    api('GET', '/swaps'),
  ]);
  return { me, household, assignments, swaps };
}
