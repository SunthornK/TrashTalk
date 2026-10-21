# Trash Talk

A web app for roommates to share household chores. Everyone can see who has which chore, when it's due and whether it's done or overdue. If you can't do yours, you **hand it off**: you ask a roommate to take it, and they accept or say no. The page updates without reloading.

Web Development course project by Sunthorn Kompita and Teerapat Trepopsakulsin.

## Setup

Requirements: **Node.js 22.9 or newer** (check with `node --version`).

```bash
npm install      # installs express and better-sqlite3
npm run seed     # creates data/trashtalk.db with the demo household
npm start        # http://localhost:3000
```

Optional settings go in `.env` (see `.env.example`): `PORT` (default 3000), `DB_PATH` (default `data/trashtalk.db`), and `NODE_ENV=production` to mark the session cookie `Secure` (needs HTTPS).

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | start and restart automatically when a file changes |
| `npm test` | run the automated tests (Node's built-in test runner) |
| `npm run seed` | reset the database to the demo data. Do this before a demo; it also logs everyone out. |

### Demo logins

All demo accounts use the password `password123`. The data is synthetic.

| Email | Who |
|---|---|
| `alex@example.com` | admin of Flat 4B |
| `sam@example.com`, `jamie@example.com`, `robin@example.com` | members of Flat 4B |
| `kim@example.com` | registered, but not in a household |

The demo dates are relative to the day you seed. Alex always has an overdue chore, a request from Jamie to answer, and a request waiting on Sam. One chore belongs to nobody, and the past two weeks have history.

**Try the live handoff:** log in as Alex in a normal window and as Jamie in a private window, side by side. Alex clicks **Can't do it…** on a chore and asks Jamie. Within about 10 seconds Jamie's page shows the request.

## Features

- **Chores page**, with two views of the same data:
  - **Chores**: one card per chore, showing who has it now, when it's due, and who's next.
  - **Week**: a fridge-style chart with people × days. Past weeks are the history ("late", "via Jamie").
- **Handoff requests:**
  - "Can't do it…" → pick a roommate (with how many chores each has this week) → optional message.
  - The roommate can **Take it** or say **No**. The requester can cancel.
  - At most one pending request per chore. The chore stays yours until someone accepts.
- **Filter** (everyone / just me / waiting on someone / needs a new person), **sort** (due date / name), **group** (by week / by chore).
- **This week so far:** done / assigned per person.
- **Admin, on the same page:**
  - assign the next turn, with person and date pre-filled,
  - reassign overdue or unassigned chores,
  - add chores.
- **Household page:**
  - add members by email,
  - hand over the admin role, remove members, leave,
  - edit, archive and restore chores.
- **Overdue** is computed, never stored. When someone leaves, their unfinished chores become "Nobody" for the admin to reassign.
- **Loading, success, empty, validation-error and server-error states** on every action, inline field errors, and a layout that works from phone to laptop.

## Technical description

### Architecture

```
Browser: HTML + CSS + plain JavaScript modules  ──fetch (JSON)──▶  Node + Express  ──SQL──▶  SQLite (one file)
```

- **Client:** plain JavaScript only (ES modules, `fetch`, DOM APIs), no frameworks. Styling is Pico.css plus our own theme (`public/css/theme.css`).
- **Server:** Node.js + Express 5. The only runtime dependencies are `express` and `better-sqlite3`. Express serves both the JSON API (`/api/...`) and the static files.
- **Database:** SQLite via `better-sqlite3`. `server/db.js` is the only file that uses the driver.

### Data model (`server/schema.sql`)

| Table | One row is |
|---|---|
| `households` | a shared flat |
| `users` | a person: name, unique email, password hash, household, role (`admin` / `member`) |
| `sessions` | a logged-in browser (stores only a hash of the token) |
| `chores` | a recurring task: title, frequency, active/archived |
| `assignments` | one turn of a chore: who, due date, assigned/completed |
| `swap_requests` | a handoff request: assignment, requester, target, message, status |

A partial unique index allows **only one pending request per assignment**:
`CREATE UNIQUE INDEX one_pending_swap ON swap_requests(assignment_id) WHERE status = 'pending'`.

### Authentication and authorization

- **Passwords:** hashed with Node's built-in `crypto.scrypt`, with a random 16-byte salt per user, and compared with `timingSafeEqual`.
- **Login:** creates a random 32-byte session token. It's sent as an `HttpOnly`, `SameSite=Lax` cookie, and only its SHA-256 hash is stored.
- **Route checks:** middleware checks every route: `requireUser` (401), `requireHousehold` (403), `requireAdmin` (403).
- **Household scope:** every query is limited to the caller's own household. IDs from another household give 404.
- **JSON only:** the API only accepts JSON bodies (415 otherwise). Together with `SameSite` cookies this protects against cross-site form posts.

### Handoffs and collisions

Accepting a request runs in a **transaction** with two **conditional updates**:
1. The request becomes accepted, but only `WHERE status = 'pending'`.
2. The chore moves to the person who accepted, but only `WHERE` it's still the requester's and unfinished.

If either changes 0 rows, someone else got there first (for example, the requester cancelled at the same moment). Everything is rolled back, and the user sees "This request is no longer available." (409).

### Client

- **One state object, re-rendered:** the Chores page keeps everything in one `state` object (`public/js/chores/state.js`). After every action it reloads from the server and re-renders, so the page always matches the database.
- **Live updates:** every 10 seconds it polls. It only redraws if the data changed and no dialog is open, so text being typed is never lost. Keyboard focus is kept on the same button across redraws.
- **Tested logic:** the decisions about what to show (status labels, filters, sorting, the week grid, the "assign next" suggestion) are pure functions in `public/js/chores/filters.js` and `status.js`, unit-tested like the server.

### Tests

`npm test` runs 86 tests:
- **API:** each test starts the real app on a fresh in-memory database.
- **Client logic:** the pure functions behind what the page shows.
- **Covered cases** include duplicate emails in different letter case, a chore due today not counting as overdue, another household's IDs, two people acting on the same request at once, and archiving.

### Project structure

```
server/          index.js (start), app.js (middleware + routes), db.js, schema.sql,
                 auth.js (passwords, sessions, guards), views.js (SQL → JSON), validate.js,
                 routes/ (auth, households, chores, assignments, swaps), seed.js
public/          index.html (Chores), household.html, login.html, css/, vendor/ (Pico), fonts/
public/js/       api.js (fetch wrapper), ui.js (DOM + feedback helpers), dates.js (shared with the server),
                 topbar.js, login.js, household.js, chores/ (state, views, dialogs, side panel)
tests/           API and client-logic tests
docs/            design, build plan, decisions log, study guide
```

### How the course requirements are met

| Requirement | Where |
|---|---|
| Create, modify and remove DOM elements | cards, week chips, requests panel, dialogs, all built with `el()` and redrawn with `replaceChildren` |
| Different user events | `click`, `submit`, `change`, `keydown` (arrow keys in tabs, Esc in dialogs) |
| Feedback without reloads | every action uses `fetch`, then shows a toast or inline error and redraws |
| A substantial interactive feature | the handoff flow: dialog → request → accept/reject/cancel, live in other browsers |
| Interface kept in sync with stored data | reload + re-render after every action, plus 10-second polling |
| Async requests, relational DB, CRUD | JSON API over `fetch`; SQLite with 6 related tables; create/read/update/archive chores, assignments, requests and members |
| Loading, success, empty, validation-error, server-error states | "Loading…", toasts, empty messages, field errors, "Something went wrong, try again" (page stays usable) |
| Users and administrators | members manage their own chores and requests; the household admin manages members and chores, all checked on the server |
| Authentication with cookies and securely stored passwords | scrypt + salt, HttpOnly SameSite session cookie, hashed session tokens |
| Search, filtering, sorting or grouping | filter, sort, and grouping by week or by chore |
| Responsive and accessible | works from 360px; labels on every input, real buttons, `<dialog>`, ARIA tabs, status always as text, visible keyboard focus |

More detail: [design](docs/superpowers/specs/2026-10-20-trashtalk-design.md) · [decision log](docs/decisions.md) · [how it works](docs/how-it-works.md)

## Credits

- [Pico CSS](https://picocss.com) v2.1.1 (MIT), included in `public/vendor/`.
- [Gloria Hallelujah](https://fonts.google.com/specimen/Gloria+Hallelujah) font (SIL Open Font License), included in `public/fonts/`.
