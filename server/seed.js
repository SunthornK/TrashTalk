// Demo data (spec §12). Wipes the database and fills it with Flat 4B.
// Dates are relative to "today", so the demo always has something overdue,
// something waiting for an answer, and some history.
//
//   npm run seed
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb, transaction } from './db.js';
import { hashPassword } from './auth.js';
import { today, startOfWeek, addDays } from '../public/js/dates.js';

const PASSWORD = 'password123';

export function seed(db, todayString) {
  const monday = startOfWeek(todayString);
  const lastWeek = addDays(monday, -7);
  const twoWeeksAgo = addDays(monday, -14);
  const nextWeek = addDays(monday, 7);
  const now = new Date().toISOString();

  // Finished at noon local time on the given day.
  const doneOn = (dateString) => {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d, 12).toISOString();
  };

  transaction(db, () => {
    for (const table of ['swap_requests', 'assignments', 'sessions', 'chores', 'users', 'households']) {
      db.prepare(`DELETE FROM ${table}`).run();
    }

    const flat = Number(db.prepare('INSERT INTO households (name, created_at) VALUES (?, ?)')
      .run('Flat 4B', now).lastInsertRowid);

    const addUser = db.prepare(`
      INSERT INTO users (name, email, password_hash, household_id, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const user = (name, householdId, role = 'member') => Number(addUser.run(
      name, `${name.toLowerCase()}@example.com`, hashPassword(PASSWORD), householdId, role, now,
    ).lastInsertRowid);
    const alex = user('Alex', flat, 'admin');
    const sam = user('Sam', flat);
    const jamie = user('Jamie', flat);
    const robin = user('Robin', flat);
    const kim = user('Kim', null); // moved out: shows the "not in a household" screen

    const addChore = db.prepare(`
      INSERT INTO chores (household_id, title, frequency, active, created_at) VALUES (?, ?, ?, ?, ?)
    `);
    const chore = (title, frequency = 'weekly', active = 1) =>
      Number(addChore.run(flat, title, frequency, active, now).lastInsertRowid);
    const trash = chore('Take out trash');
    const bathroom = chore('Clean bathroom');
    const vacuum = chore('Vacuum living room');
    const dishes = chore('Wash dishes');
    const mop = chore('Mop kitchen');
    const groceries = chore('Groceries');
    chore('Water plants', 'weekly', 0); // archived, to show "Restore"

    const addAssignment = db.prepare(`
      INSERT INTO assignments (chore_id, user_id, due_date, status, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const open = (choreId, userId, dueDate) =>
      Number(addAssignment.run(choreId, userId, dueDate, 'assigned', null, now).lastInsertRowid);
    const done = (choreId, userId, dueDate, finishedDate = dueDate) =>
      Number(addAssignment.run(choreId, userId, dueDate, 'completed', doneOn(finishedDate), now).lastInsertRowid);

    const addSwap = db.prepare(`
      INSERT INTO swap_requests (assignment_id, requester_id, target_user_id, message, status, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Two weeks ago: history, including Kim before she moved out.
    done(trash, kim, addDays(twoWeeksAgo, 1));
    done(bathroom, sam, addDays(twoWeeksAgo, 4), addDays(twoWeeksAgo, 5)); // a day late
    done(vacuum, jamie, addDays(twoWeeksAgo, 3));

    // Last week: one chore came to Sam through an accepted handoff from Jamie.
    const handedOver = done(trash, sam, addDays(lastWeek, 1));
    addSwap.run(handedOver, jamie, sam, 'Away this weekend, sorry!', 'accepted', now, now);
    done(bathroom, kim, addDays(lastWeek, 4));
    done(dishes, robin, lastWeek);
    done(mop, alex, addDays(lastWeek, 5), addDays(lastWeek, 6)); // a day late

    // This week.
    open(trash, alex, addDays(todayString, -1)); // overdue
    const vacuumNow = open(vacuum, jamie, addDays(todayString, 1));
    addSwap.run(vacuumNow, jamie, alex, 'Exam on Thursday, could you take this one?', 'pending', now, null);
    const bathroomNow = open(bathroom, alex, addDays(todayString, 2));
    addSwap.run(bathroomNow, alex, sam, null, 'pending', now, null);
    done(dishes, sam, todayString);
    open(mop, null, addDays(todayString, 3)); // Nobody: Kim moved out
    open(groceries, robin, addDays(todayString, 4));

    // Next week.
    open(trash, sam, addDays(nextWeek, 1));
    open(bathroom, jamie, addDays(nextWeek, 4));
  });
}

// Only runs when started as a script (npm run seed), not when a test imports it.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbPath = process.env.DB_PATH ?? 'data/trashtalk.db';
  mkdirSync(dirname(dbPath), { recursive: true });
  seed(openDb(dbPath), today());
  console.log(`Seeded ${dbPath}. Log in as alex@example.com / ${PASSWORD} (also sam, jamie, robin, kim).`);
}
