// The only file that talks to the SQLite driver. If better-sqlite3 is ever
// not allowed, swapping in node:sqlite only means changing this file.
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export function openDb(path) {
  const db = new Database(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schema);
  return db;
}

// Run fn inside a transaction: either everything it writes is saved, or
// (if it throws) nothing is.
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
