// Demo data. Wipes the database and fills it with Flat 4B.
// Dates are relative to "today", so the demo always has something overdue
// and something waiting for an answer.
//
//   npm run seed
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb, transaction } from './db.js';
import { hashPassword } from './auth.js';
import { today, addDays } from '../public/js/dates.js';

const PASSWORD = 'password123';

export function seed(db, todayString) {
  const day = (n) => addDays(todayString, n); // today + n days
  const now = new Date().toISOString();

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
    user('Kim', null); // has an account but no household: shows the "not in a household" screen

    const addChore = db.prepare('INSERT INTO chores (household_id, title, frequency, created_at) VALUES (?, ?, ?, ?)');
    const chore = (title) => Number(addChore.run(flat, title, 'weekly', now).lastInsertRowid);
    const trash = chore('Take out trash');
    const bathroom = chore('Clean bathroom');
    const vacuum = chore('Vacuum living room');
    const dishes = chore('Wash dishes');
    const mop = chore('Mop kitchen');
    const groceries = chore('Groceries');

    const addAssignment = db.prepare(`
      INSERT INTO assignments (chore_id, user_id, due_date, status, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const open = (choreId, userId, dueDate) =>
      Number(addAssignment.run(choreId, userId, dueDate, 'assigned', null, now).lastInsertRowid);
    const done = (choreId, userId, dueDate) =>
      Number(addAssignment.run(choreId, userId, dueDate, 'completed', now, now).lastInsertRowid);

    const addSwap = db.prepare(`
      INSERT INTO swap_requests (assignment_id, requester_id, target_user_id, message, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `);

    open(trash, alex, day(-1)); // overdue
    const vacuumNow = open(vacuum, jamie, day(1));
    addSwap.run(vacuumNow, jamie, alex, 'Exam on Thursday, could you take this one?', now); // Alex can answer
    const bathroomNow = open(bathroom, alex, day(2));
    addSwap.run(bathroomNow, alex, sam, null, now); // Alex is waiting on Sam
    done(dishes, sam, todayString);
    open(mop, null, day(3)); // nobody: for the admin to reassign
    open(groceries, robin, day(4));
    open(trash, sam, day(6)); // the next turn: shows "Next: Sam"
  });
}

// Only runs when started as a script (npm run seed), not when a test imports it.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbPath = process.env.DB_PATH ?? 'data/trashtalk.db';
  mkdirSync(dirname(dbPath), { recursive: true });
  seed(openDb(dbPath), today());
  console.log(`Seeded ${dbPath}. Log in as alex@example.com / ${PASSWORD} (also sam, jamie, robin, kim).`);
}
