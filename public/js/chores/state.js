// Everything the Chores page knows, in one place. The render functions only
// read from here; after any change we reload from the server and redraw.
import { api } from '../api.js';
import { today, startOfWeek } from '../dates.js';

function savedView() {
  try {
    return localStorage.getItem('tt.view') === 'week' ? 'week' : 'chores';
  } catch {
    return 'chores'; // storage can be blocked (private mode); just use the default
  }
}

export const state = {
  me: null,                            // GET /api/me
  household: null,                     // GET /api/household: { name, members, chores }
  assignments: [],                     // GET /api/assignments
  swaps: { incoming: [], sent: [] },   // GET /api/swaps
  view: savedView(),                   // 'chores' | 'week'
  filter: 'everyone',                  // 'everyone' | 'mine' | 'waiting' | 'needs'
  sort: 'due',                         // 'due' | 'name'
  weekStart: startOfWeek(today()),     // Monday of the week shown in the week view
};

export function setView(view) {
  state.view = view;
  try { localStorage.setItem('tt.view', view); } catch { /* not important */ }
}

// Load everything the page needs. The three household requests run at the
// same time (Promise.all) instead of one after another.
export async function loadAll() {
  state.me = await api('GET', '/me');
  if (!state.me.householdId) return;
  const [household, assignments, swaps] = await Promise.all([
    api('GET', '/household'),
    api('GET', '/assignments'),
    api('GET', '/swaps'),
  ]);
  state.household = household;
  state.assignments = assignments;
  state.swaps = swaps;
}
