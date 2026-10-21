// Everything the Chores page knows, in one place. The render functions only
// read from here; after any change we reload from the server and redraw.
import { api } from '../api.js';
import { today, startOfWeek, addDays } from '../dates.js';

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
  assignments: [],                     // GET /api/assignments (unfinished + latest done): the cards
  weekAssignments: [],                 // everything due in the week shown in the week view
  thisWeekAssignments: [],             // everything due this week: the progress bars
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

const weekRange = (monday) => `/assignments?from=${monday}&to=${addDays(monday, 6)}`;

// Fetch everything the page needs. The household requests run at the same
// time (Promise.all) instead of one after another.
export async function fetchAll() {
  const me = await api('GET', '/me');
  if (!me.householdId) {
    return { me, household: null, assignments: [], weekAssignments: [], thisWeekAssignments: [], swaps: { incoming: [], sent: [] } };
  }
  const thisMonday = startOfWeek(today());
  const showingThisWeek = state.weekStart === thisMonday;
  const [household, assignments, swaps, weekAssignments, otherWeek] = await Promise.all([
    api('GET', '/household'),
    api('GET', '/assignments'),
    api('GET', '/swaps'),
    api('GET', weekRange(state.weekStart)),
    showingThisWeek ? null : api('GET', weekRange(thisMonday)),
  ]);
  const thisWeekAssignments = showingThisWeek ? weekAssignments : otherWeek;
  return { me, household, assignments, swaps, weekAssignments, thisWeekAssignments };
}

// Put freshly fetched data into the state.
export function applyData(data) {
  Object.assign(state, data);
}

export async function loadAll() {
  applyData(await fetchAll());
}
