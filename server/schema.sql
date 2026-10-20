-- Trash Talk database schema (spec §9). Safe to run on every start.

CREATE TABLE IF NOT EXISTS households (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,      -- stored lowercase
  password_hash TEXT NOT NULL,             -- "salt:hash" hex (scrypt)
  household_id  INTEGER NULL REFERENCES households(id),
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,             -- SHA-256 of the cookie token, never the token itself
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chores (
  id           INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  title        TEXT NOT NULL,
  frequency    TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'once')),
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id           INTEGER PRIMARY KEY,
  chore_id     INTEGER NOT NULL REFERENCES chores(id),
  user_id      INTEGER NULL REFERENCES users(id),   -- NULL = nobody
  due_date     TEXT NOT NULL,                       -- 'YYYY-MM-DD'
  status       TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed')),
  completed_at TEXT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS swap_requests (
  id             INTEGER PRIMARY KEY,
  assignment_id  INTEGER NOT NULL REFERENCES assignments(id),
  requester_id   INTEGER NOT NULL REFERENCES users(id),
  target_user_id INTEGER NOT NULL REFERENCES users(id),
  message        TEXT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at     TEXT NOT NULL,
  resolved_at    TEXT NULL
);

-- At most one pending request per assignment, enforced by the database itself.
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_swap
  ON swap_requests (assignment_id) WHERE status = 'pending';
