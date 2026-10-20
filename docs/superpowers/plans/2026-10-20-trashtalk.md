# Trash Talk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Trash Talk, a household chore app whose core feature is a one-way chore handoff (request → accept/reject/cancel) that updates the page without reloads.

**Architecture:** One Express 5 process serves a JSON API under `/api` and static files from `public/`. SQLite (one file) holds the data. The browser is plain ES modules: pure logic modules (dates, status, filters) are unit-tested with `node:test`, and render modules build the DOM from one shared `state` object. The project is ESM (`"type": "module"`), so the server imports the same `public/js/dates.js` the browser uses.

**Tech Stack:** Node 22, Express 5, better-sqlite3, `node:crypto`, `node:test`, Pico.css 2, Gloria Hallelujah (self-hosted).

**Spec:** `docs/superpowers/specs/2026-10-20-trashtalk-design.md`. Section references like §7 point there; read it alongside this plan.

## Global Constraints

- Client: plain JavaScript only, no JS libraries. Server runtime dependencies: **only** `express` and `better-sqlite3`. No dev dependencies either (tests use `node:test` + global `fetch`).
- `better-sqlite3` is imported **only** in `server/db.js` (fallback to `node:sqlite` must be a one-file change).
- Passwords: `crypto.scrypt`, 16-byte salt, stored `"salt:hash"` hex, compared with `crypto.timingSafeEqual`. Minimum length 8.
- Sessions: cookie `sid` = `crypto.randomBytes(32)` base64url, `HttpOnly`, `SameSite=Lax`, `Path=/`, 7-day expiry, `Secure` only when `NODE_ENV=production`. DB stores only the SHA-256 hex of the token.
- Errors are always JSON `{ error, field? }` with 400 / 401 / 403 / 404 / 409 / 500. Request bodies must be `application/json` (otherwise 415 `{error}`).
- Dates are `'YYYY-MM-DD'` strings in server-local time. Overdue = `status = 'assigned' AND due_date < today`. Weeks run Monday–Sunday.
- UI copy is fixed by spec §5–§8 (e.g. "This request is no longer available.", "Make someone else admin first.", "No account with that email. Ask them to register first.", "That person is already in a household.", "It stays yours until *Name* says yes.").
- Every status is shown as text; colour is extra. Doodle font only on the logo, headings and chore titles.
- Every task ends with an **explain checkpoint**: Sunthorn explains the task's code back in their own words before the next task starts (the course examines both students on all of it).

## Review Focus

1. **Email case:** registering `Alex@Example.com` after `alex@example.com` must be refused (409, field `email`), and login must work in any case. Test in Task 2.
2. **Due today is not overdue:** an assignment due today is `overdue: false`; due yesterday is `true`. Test in Task 4.
3. **Another household's IDs:** completing, reassigning or requesting a swap on an assignment from another household returns 404, not success or 500. Tests in Tasks 4 and 5.
4. **Accept after cancel (two browsers):** the requester cancels, then the target clicks Accept → 409 "This request is no longer available." and the assignment is unchanged. Test in Task 5.
5. **Polling while typing:** the 10-second refresh must not re-render while a dialog is open, or when nothing changed (it would wipe typed text and focus). Test `shouldRender` in Task 9.

---

## File map

```
package.json                    scripts + 2 deps
server/
  index.js                      open DB from env, createApp, listen
  app.js                        createApp(db): middleware, routers, 404 + error handler
  db.js                         openDb(path), transaction(db, fn): the only driver import
  schema.sql                    spec §9 verbatim
  errors.js                     HttpError
  auth.js                       hashing, sessions, cookie parsing, middleware
  views.js                      SQL → JSON shapes shared by routes (assignment, swap)
  routes/auth.js households.js chores.js assignments.js swaps.js
  seed.js                       seed(db, today) + CLI
public/
  index.html login.html household.html
  css/theme.css  vendor/pico.min.css  fonts/gloria-hallelujah.woff2
  js/api.js ui.js dates.js login.js household.js
  js/chores/main.js state.js status.js filters.js cards-view.js week-view.js
            side-panel.js swap-dialog.js admin-dialogs.js
tests/
  helpers.js                    startServer, client, makeHousehold
  db.test.js auth.test.js households.test.js assignments.test.js swaps.test.js
  seed.test.js dates.test.js status.test.js filters.test.js
README.md
```

---

### Task 1: Project skeleton, database, app shell

**Files:**
- Create: `package.json`, `server/index.js`, `server/app.js`, `server/db.js`, `server/schema.sql`, `server/errors.js`, `tests/helpers.js`, `tests/db.test.js`, `.env.example`

**Interfaces:**
- Produces:
  - `openDb(path: string): Database`: opens the DB, runs `PRAGMA foreign_keys = ON`, executes `schema.sql` (all `CREATE ... IF NOT EXISTS`).
  - `transaction(db, fn: () => T): T`: `BEGIN`, run `fn`, `COMMIT`; on throw `ROLLBACK` and rethrow.
  - `class HttpError extends Error { constructor(status: number, message: string, field?: string) }`
  - `createApp(db): express.Express`: `express.json()`, the 415 guard for `/api` POST/PATCH/DELETE with a body, `express.static('public')`, routers mounted at `/api` (added in later tasks), `/api/*` 404 → `{error:"Not found"}`, error handler (HttpError → its status, else log + 500 `{error:"Something went wrong, try again"}`).
  - `tests/helpers.js`:
    - `startServer(): Promise<{ db, base: string, close(): Promise<void> }>` (`openDb(':memory:')`, `listen(0)`)
    - `client(base): { req(method, path, body?): Promise<{ status, body }> }`, which keeps the `sid` cookie from `set-cookie` between calls
    - `makeHousehold(base, names: string[]): Promise<{ admin, members, users }>`: registers `names[0]` as admin (creates household "Flat 4B") and adds the rest, returns clients and the `/api/me` bodies. *(Fill this in during Task 3 once those routes exist; stub in Task 1.)*

- [ ] **Step 1:** `npm init -y`, set `"type": "module"`, scripts `start: node --env-file-if-exists=.env server/index.js`, `dev: node --watch --env-file-if-exists=.env server/index.js`, `seed: node server/seed.js`, `test: node --test`. Run `npm install express@5 better-sqlite3@12`. Check that `package.json` lists exactly those two dependencies.
- [ ] **Step 2: Write failing tests** in `tests/db.test.js`:
  - `schema creates all six tables`: `sqlite_master` contains households, users, sessions, chores, assignments, swap_requests.
  - `one_pending_swap allows only one pending request per assignment`: insert household/users/chore/assignment, insert a pending swap, and a second pending insert throws `/UNIQUE/`. Insert a `rejected` one and it succeeds.
  - `transaction rolls back on throw`: inside `transaction` insert a household then throw. Count stays 0.
  - `unknown api route returns JSON 404`: `startServer`, `GET /api/nope` → 404, `body.error === 'Not found'`.
  - `POST without JSON content type is rejected`: `fetch(base+'/api/nope', {method:'POST', body:'x'})` → 415.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 4:** Implement the files above. Copy `schema.sql` from spec §9, adding `IF NOT EXISTS`. `server/index.js` reads `DB_PATH` (default `data/trashtalk.db`, create `data/`) and `PORT` (default 3000).
- [ ] **Step 5:** Run `npm test`. Expected: all pass. Run `npm start`, open `http://localhost:3000/api/nope` and see the JSON 404.
- [ ] **Step 6: Commit** `chore: project skeleton, schema, app shell`
- [ ] **Explain checkpoint:** why `transaction()` and the partial unique index exist (§7), and why `createApp` is separate from `listen`.

### Task 2: Authentication

**Files:**
- Create: `server/auth.js`, `server/routes/auth.js`, `tests/auth.test.js`
- Modify: `server/app.js` (mount router, `loadUser` before routers)

**Interfaces:**
- Consumes: `openDb`, `transaction`, `HttpError`, test helpers.
- Produces (`server/auth.js`):
  - `hashPassword(pw: string): string`, `verifyPassword(pw: string, stored: string): boolean`
  - `parseCookies(header?: string): Record<string, string>`
  - `createSession(db, userId: number): string` (returns the raw token), `destroySession(db, token: string): void`
  - `loadUser(db)`: middleware. Sets `req.user = { id, name, email, role, householdId } | null` from a valid, unexpired `sid`.
  - `requireUser` (401 "Please log in"), `requireHousehold` (403 "Join a household first"), `requireAdmin` (403 "You don't have permission to do that.").
  - `setSessionCookie(res, token)`, `clearSessionCookie(res)`
- Routes: `POST /api/register {name, email, password}` → 201 + cookie + me. `POST /api/login {email, password}` → 200 + cookie + me. `POST /api/logout` → 204. `GET /api/me` → `{ id, name, email, role, householdId, householdName }`.

- [ ] **Step 1: Write failing tests** in `tests/auth.test.js`:
  - `hashPassword output verifies and differs per call`
  - `register logs you in`: register then `GET /api/me` → 200, `householdId === null`.
  - `register validates`: empty name → 400 `field:'name'`. Bad email → 400 `field:'email'`. 7-char password → 400 `field:'password'`, `error` mentions "at least 8".
  - `duplicate email is refused case-insensitively` *(Review Focus 1)*: register `alex@example.com`, then `Alex@Example.com` → 409 `field:'email'`. Login with `ALEX@example.com` → 200.
  - `wrong password` → 401 `error === 'Wrong email or password.'`. Unknown email gives the same message.
  - `logout ends the session`: after logout `GET /api/me` → 401.
  - `session row stores a hash, not the token`: the `sessions.token_hash` value is not equal to the cookie value.
- [ ] **Step 2:** `npm test`. Expected: auth tests FAIL.
- [ ] **Step 3:** Implement. Store the email trimmed and lowercased. Validate the email with a simple `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: register, login, logout, sessions`
- [ ] **Explain checkpoint:** salt + scrypt, why only the token hash is stored, what `HttpOnly`/`SameSite` protect against.

### Task 3: Households and members

**Files:**
- Create: `server/routes/households.js`, `tests/households.test.js`
- Modify: `server/app.js`, `tests/helpers.js` (`makeHousehold`)

**Interfaces:**
- Consumes: auth middleware, `transaction`.
- Produces routes (spec §5, §10):
  - `POST /api/households {name}` (user without household; else 409 "You're already in a household") → 201. Caller gets `role='admin'`.
  - `GET /api/household` → `{ id, name, members: [{id, name, email, role}], chores: [{id, title, frequency, active}] }` (members ordered by `id`).
  - `POST /api/household/members {email}` (admin) → 201 member. 404 `field:'email'` "No account with that email. Ask them to register first." 409 `field:'email'` "That person is already in a household."
  - `DELETE /api/household/members/:id`: the admin removing someone else, or a non-admin removing themselves. The admin targeting self → 409 "Make someone else admin first." A member targeting someone else → 403. → 204.
  - `POST /api/household/members/:id/make-admin` (admin) → 200.
- Produces `removeFromHousehold(db, userId: number): void` in `routes/households.js`, used by the DELETE route: in one transaction, cancel pending swaps where the user is requester or target (`resolved_at = now`), set `user_id = NULL` on their `assigned` assignments, and clear `household_id` and set `role='member'`.

- [ ] **Step 1: Write failing tests:**
  - `creating a household makes you admin`
  - `no-household user gets 403 on GET /api/household` with `error === 'Join a household first'`.
  - `admin adds by email (any case)`, `unknown email → 404 field email`, `already-in-household → 409`.
  - `member cannot add members` → 403.
  - `make-admin swaps roles`: after the call, exactly one admin, and the old admin is a member.
  - `admin cannot leave` → 409 with the exact copy.
  - `member leaving unassigns unfinished chores, keeps completed ones, cancels pending swaps`: set up rows directly via `db` (chores, assignments, swap) and assert the three effects.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: households, members, admin transfer`
- [ ] **Explain checkpoint:** why make-admin and leave are transactions, and why completed assignments keep `user_id`.

### Task 4: Chores and assignments API

**Files:**
- Create: `public/js/dates.js`, `tests/dates.test.js`, `server/views.js`, `server/routes/chores.js`, `server/routes/assignments.js`, `tests/assignments.test.js`
- Modify: `server/app.js`

**Interfaces:**
- Produces `public/js/dates.js` (pure, shared by browser and server):
  - `today(): string` (local date), `addDays(d: string, n: number): string`, `addFrequency(d: string, freq: 'daily'|'weekly'|'monthly'|'once'): string` (once → `today()`), `startOfWeek(d: string): string` (Monday), `formatShort(d: string): string` → `"Tue 20 Oct"`, `weekLabel(monday: string): string` → `"19–25 Oct"` (en dash; across months → `"26 Oct – 1 Nov"`).
- Produces `server/views.js`:
  - `assignmentsQuery(db, householdId, { from?, to? }): AssignmentView[]` with `AssignmentView = { id, choreId, choreTitle, userId, userName, userLeft: boolean, dueDate, status, completedAt, overdue, wasLate, pendingSwap: {id, targetUserId, targetName} | null, viaName: string | null }`. `wasLate` = completed and the date part of `completedAt` > `dueDate`. `viaName` = requester name of an accepted swap on this assignment. `userLeft` = the user's `household_id` ≠ this household. With no range: all `assigned` assignments plus the latest completed one per chore (spec §10).
  - `findAssignmentInHousehold(db, id, householdId): row` (throws `HttpError(404, 'Not found')`).
- Routes: `POST /api/chores {title, frequency}` (admin) → 201. `PATCH /api/chores/:id {title?, frequency?, active?}` (admin). Archiving (`active:false`) deletes that chore's `assigned` assignments after cancelling their pending swaps (spec §6), in one transaction. `GET /api/assignments?from&to` → `AssignmentView[]`. `POST /api/assignments {choreId, userId, dueDate}` (admin, chore active, user in household) → 201. `PATCH /api/assignments/:id {userId}` (admin, `assigned` only, cancels the pending swap) → 200. `POST /api/assignments/:id/complete` (assignee only, else 403, already completed → 409) sets `completed_at`, cancels the pending swap → 200.

- [ ] **Step 1: Write failing tests** `tests/dates.test.js`: `addFrequency('2026-10-20','weekly') === '2026-10-27'`, `'monthly' → '2026-11-20'`, `startOfWeek('2026-10-25') === '2026-10-19'` (Sunday → Monday), `formatShort('2026-10-20') === 'Tue 20 Oct'`, `weekLabel('2026-10-19') === '19–25 Oct'`, `weekLabel('2026-10-26') === '26 Oct – 1 Nov'`.
- [ ] **Step 2: Write failing tests** `tests/assignments.test.js`:
  - `due today is not overdue, due yesterday is` *(Review Focus 2)*
  - `completed late shows wasLate`
  - `range filter returns only assignments in [from, to]`
  - `no range returns unfinished + latest completed per chore`
  - `member cannot create chores or assignments` → 403
  - `only the assignee can complete` → 403 for others, 409 when completed twice
  - `completing cancels a pending swap`
  - `reassign cancels a pending swap and moves the chore`
  - `archiving deletes unfinished assignments but keeps completed`
  - `another household's assignment is 404` *(Review Focus 3)*: a second household's admin PATCHes and completes an assignment from household 1 → 404.
- [ ] **Step 3:** `npm test` → FAIL. **Step 4:** implement. **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Commit** `feat: chores and assignments API with computed status`
- [ ] **Explain checkpoint:** why overdue is computed, not stored, and how `assignmentsQuery` builds `pendingSwap` and `viaName` with joins.

### Task 5: Swap requests API

**Files:**
- Create: `server/routes/swaps.js`, `tests/swaps.test.js`
- Modify: `server/app.js`, `server/views.js` (`swapsQuery`)

**Interfaces:**
- Produces `swapsQuery(db, userId): { incoming: [{id, assignmentId, choreTitle, dueDate, requesterName, message, createdAt}], sent: [{id, assignmentId, choreTitle, dueDate, targetName, createdAt}] }` (pending only).
- Routes (spec §7): `GET /api/swaps`. `POST /api/swaps {assignmentId, targetUserId, message?}` → 201. Rules: caller is the assignee, assignment `assigned`, target is another member of the household, message ≤ 200 chars (400 `field:'message'`). Already pending → 409 "This chore already has a pending request." (catch the UNIQUE error). `POST /api/swaps/:id/accept` (target only) runs the two conditional UPDATEs from §7 inside `transaction`. Either one changing 0 rows → 409 "This request is no longer available." `POST /api/swaps/:id/reject` (target), `POST /api/swaps/:id/cancel` (requester): `WHERE status='pending'` guard, 0 rows → 409 with the same copy. A swap the caller isn't party to → 404.

- [ ] **Step 1: Write failing tests:**
  - `request → accept moves the assignment to the target` and `GET /api/assignments` shows `viaName`.
  - `reject leaves it with the requester`, `cancel by requester`.
  - `second pending request on the same assignment → 409`. After a reject, a new request → 201.
  - `cannot request a swap on someone else's or a completed chore` → 403 / 409.
  - `cannot target yourself or a non-member` → 400 `field:'targetUserId'`.
  - `accept after cancel → 409 with exact copy, assignment unchanged` *(Review Focus 4)*
  - `accept after admin reassign → 409` (the reassign cancelled it).
  - `swap from another household → 404` *(Review Focus 3)*
  - `GET /api/swaps splits incoming and sent`
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: swap requests with atomic accept`
- [ ] **Explain checkpoint:** walk through what happens when Accept and Cancel arrive at the same moment.

### Task 6: Seed data

**Files:**
- Create: `server/seed.js`, `tests/seed.test.js`

**Interfaces:**
- Produces `seed(db, todayStr: string): void`: deletes all rows (child tables first), then inserts the spec §12 data, with dates relative to `todayStr`. Running as a script (`npm run seed`) uses `openDb(process.env.DB_PATH ?? 'data/trashtalk.db')` and `today()`. Passwords `password123`. Emails `alex@example.com`, `sam@…`, `jamie@…`, `robin@…`, `kim@…`.

- [ ] **Step 1: Write failing test** `seed gives the demo every state`: after `seed(db, '2026-10-20')`, `assignmentsQuery` for Flat 4B contains at least one each of `overdue`, `pendingSwap !== null`, `userId === null`, `wasLate`, `viaName !== null`, `userLeft` (Kim), and one assignment due next week. Alex is admin. Kim's `household_id` is null. Logging in as `alex@example.com` / `password123` succeeds.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: demo seed data`
- [ ] **Explain checkpoint:** why the dates are relative to today.

### Task 7: Front-end foundation and login page

**Files:**
- Create: `public/vendor/pico.min.css`, `public/fonts/gloria-hallelujah.woff2`, `public/css/theme.css`, `public/js/api.js`, `public/js/ui.js`, `public/login.html`, `public/js/login.js`

**Interfaces:**
- Produces `public/js/api.js`:
  - `api(method: string, path: string, body?: object): Promise<any>`: JSON fetch to `/api${path}`, `credentials: 'same-origin'`. A 204 resolves `null`. A 401 (except on `/login`, `/register`) → `location.href = '/login.html'`. Other non-2xx → throws `ApiError`. A network failure → throws `ApiError(0, 'Something went wrong, try again')`.
  - `class ApiError extends Error { status: number; field?: string }`
- Produces `public/js/ui.js`:
  - `el(tag: string, attrs?: object, ...children: (Node|string)[]): HTMLElement`: the one DOM-creation helper. `class`, `text`, `on<Event>` and `aria-*`/`data-*` attrs are handled.
  - `toast(message: string, kind?: 'ok'|'error'): void`: writes into `#toasts` (`aria-live="polite"`), auto-removes after 4 s.
  - `showFieldError(form, field, message)`, `clearFormErrors(form)`: set `aria-invalid` and an `aria-describedby` message element.
  - `withBusy(button, fn: () => Promise<T>): Promise<T>`: disables while running.
  - `handleError(err, form?)`: field error if `err.field` and a form are given, else toast `err.message`.
  - `confirmDialog(message: string, confirmLabel: string): Promise<boolean>` using `<dialog>`.
- `theme.css`: tokens from spec §8.1 as CSS custom properties, `@font-face` for the self-hosted font, `.wobble`, `.tag` + `.tag--todo|over|pend|done|none`, `.btn-admin` (purple), `.card--mine`, `.card--needs`, Pico variable overrides (`--pico-primary` etc.).

- [ ] **Step 1:** Download `https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css` and the Gloria Hallelujah latin-400 woff2 (from `@fontsource/gloria-hallelujah` on jsDelivr) into the paths above. Check that both are non-empty and that the CSS starts with `@charset` or `:root`.
- [ ] **Step 2:** Implement `api.js`, `ui.js`, `theme.css`. Build `login.html`/`login.js` as one form that toggles between Log in and Create account (spec §8.2), with errors shown inline via `handleError`. On success → `/`.
- [ ] **Step 3: Verify in a browser** (`npm run seed && npm run dev`): a wrong password shows "Wrong email or password." under the form. Registering with a 5-char password shows the field error. `alex@example.com`/`password123` reaches `/` (an empty page is fine). Tab order reaches every control and the focus ring is visible. At 360 px wide there's no horizontal scroll.
- [ ] **Step 4: Commit** `feat: front-end foundation and login`
- [ ] **Explain checkpoint:** how `api()` turns server errors into field messages and toasts.

### Task 8: Chores page — cards view, Done, no-household screen

**Files:**
- Create: `public/index.html`, `public/js/chores/main.js`, `state.js`, `status.js`, `filters.js`, `cards-view.js`, `tests/status.test.js`, `tests/filters.test.js`

**Interfaces:**
- Produces `status.js`: `displayStatus(a: AssignmentView, meId: number): { label: string, kind: 'todo'|'over'|'pend'|'done'|'none' }`. Labels per spec §6: "To do", "Overdue", "Waiting on Sam" / "Waiting on you", "Nobody", "Done". `pendingSwap` wins over overdue for `kind`, but an overdue + pending assignment gets the label "Overdue · Waiting on Sam".
- Produces `filters.js`:
  - `applyFilter(list: AssignmentView[], filter: 'everyone'|'mine'|'waiting'|'needs', meId): AssignmentView[]` (`needs` = overdue or `userId === null`, assigned only)
  - `buildChoreCards(chores, assignments): { chore, current: AssignmentView|null, upcoming: AssignmentView[] }[]` (active chores only. `current` per spec §8.4 builder's call. `upcoming` = later unfinished ones by due date)
  - `sortCards(cards, sort: 'due'|'name')` (cards with no current go last for `due`)
- Produces `state.js`: `export const state = { me, household, assignments, swaps, view: 'chores'|'week', filter, sort, weekStart }`. `loadAll(): Promise<void>` (me → if a household: household, assignments, swaps, in parallel). `view` is persisted in `localStorage` under `tt.view`, wrapped in try/catch.
- Produces `cards-view.js`: `renderCards(container: HTMLElement, state, actions): void`, which clears and rebuilds. `actions` is defined in `main.js`: `{ complete(a), openSwap(a), cancelSwap(swapId), accept(swapId), reject(swapId), assignNext(chore), reassign(a), newChore() }`. Each action awaits `api`, toasts, then calls `refresh()`.

- [ ] **Step 1: Write failing tests** `status.test.js`: one case per row of the §6 table, plus "Waiting on you" when `pendingSwap.targetUserId === meId`. `filters.test.js`: `mine` keeps only `userId === meId`. `needs` includes `userId === null` and overdue, excluding completed. `buildChoreCards` picks the earliest unfinished as `current` and falls back to the latest completed. Archived chores are excluded. `sortCards('name')` is alphabetical.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement pure modules → `npm test` PASS.
- [ ] **Step 4:** Implement `index.html` (top bar, `#banner`, controls row, `<main id="content">`, `<aside id="side">`, `#toasts`), `main.js` (load, render, actions), `cards-view.js` (spec §8.4 card contents, Done ✓ for your unfinished chore). Show the "not in a household yet" screen when `me.householdId === null` (§8.3), with the create-household form. While it's showing, poll `GET /api/me` every 10 000 ms and switch to the Chores page once `householdId` is set. Loading → "Loading…" in `#content`. No chores → spec §8.6 empty copy.
- [ ] **Step 5: Verify in a browser** as Alex: cards show with the correct tags. Clicking Done ✓ disables the button, shows a toast, and the card updates without a reload. As Kim: the not-in-household screen shows. Creating a household switches to the (empty) Chores page with "No chores yet".
- [ ] **Step 6: Commit** `feat: chores page cards view`
- [ ] **Explain checkpoint:** one data load, many renders. Trace from clicking Done to the re-rendered card.

### Task 9: The handoff UI and live sync

**Files:**
- Create: `public/js/chores/swap-dialog.js`, `public/js/chores/side-panel.js`
- Modify: `public/js/chores/main.js`, `state.js`, `cards-view.js`, `public/css/theme.css`, `tests/filters.test.js`

**Interfaces:**
- Produces `swap-dialog.js`: `openSwapDialog(a: AssignmentView, members, assignments, meId): Promise<{ targetUserId, message } | null>`. The `<dialog>` follows spec §8.4 exactly: "Who could take it?", members except me as radio options, each with "*n* chores this week" (unfinished, due in the current week). Optional message (maxlength 200). The note "It stays yours until *Name* says yes." updates with the selection. Esc/Cancel → `null`.
- Produces `side-panel.js`: `renderSidePanel(container, state, actions)` (Requests: incoming with Take it / No plus the message, sent with "You asked Sam: Clean bathroom · waiting". The other two sections are added in Task 10/11), and `renderBanner(container, state, actions)` for narrow screens (incoming only).
- Produces in `filters.js`: `shouldRender(prevJson: string, nextJson: string, dialogOpen: boolean): boolean`.
- `main.js`: `startPolling()` every 10 000 ms → fetch assignments + swaps, `JSON.stringify` the result, and re-render only if `shouldRender(...)`. `dialogOpen` = `document.querySelector('dialog[open]') !== null`.
- CSS: `#side` shown at `min-width: 900px`, `#banner` hidden there. Below 900px the reverse (spec §8.4).

- [ ] **Step 1: Write failing test** *(Review Focus 5)*: `shouldRender('a','a',false) === false`, `shouldRender('a','b',false) === true`, `shouldRender('a','b',true) === false`.
- [ ] **Step 2:** `npm test` → FAIL → implement `shouldRender` → PASS.
- [ ] **Step 3:** Implement the dialog, side panel, banner, polling, and the actions `openSwap`, `cancelSwap`, `accept`, `reject`. A 409 shows its message as a toast and then refreshes.
- [ ] **Step 4: Verify in two browsers** (normal + private window). Alex sends Jamie a request with a message: Alex's card shows "Waiting on Jamie" and a toast "Request sent to Jamie". Within ~10 s, Jamie's panel shows the request with the message. Jamie clicks Take it, and both screens show the chore as Jamie's within ~10 s. Repeat, and have Alex cancel before Jamie accepts: Jamie sees "This request is no longer available." Typing in the dialog while a poll fires is not wiped. At 375 px the banner replaces the side panel.
- [ ] **Step 5: Commit** `feat: handoff dialog, requests panel, polling`
- [ ] **Explain checkpoint:** this is the main demo. Rehearse the two-browser flow and explain the 409 path end to end.

> **Cut line:** Tasks 1–9 plus Task 13 are the minimum presentable app. Tasks 10–12 add the week view, admin UI and Household page. If time runs out, finish Task 13 first and cut in this order: progress bars (10), Restore in the chore list (12), sort by name (10).

### Task 10: Week view, filter/sort controls, progress bars

**Files:**
- Create: `public/js/chores/week-view.js`
- Modify: `main.js`, `state.js`, `side-panel.js`, `filters.js`, `tests/filters.test.js`, `index.html`, `theme.css`

**Interfaces:**
- Produces `filters.js`:
  - `weekRows(assignments, members, meId, weekStart): { label: string, userId: number|null, isMe: boolean, days: AssignmentView[][] }[]`: current members with "You" first, then "*Name* (left)" for former members with assignments that week, then "Nobody" if there are unassigned chores that week. `days` has length 7 (Mon–Sun).
  - `weekProgress(assignments, members, weekStart): { userId, name, done: number, total: number }[]`
- Produces `week-view.js`: `renderWeek(container, state, actions)`: a `<table>` with a caption of `weekLabel`, a today column highlighted, and chips as `<button>`s showing title + status text (strike-through + "Done" for completed, "Was overdue", "via *Name*"). Clicking a chip opens a popover (`<dialog>`) with details + the same actions as the cards. The table scrolls inside a wrapper on narrow screens.
- Controls: the Week | Chores toggle (`aria-pressed`), Show filter (the `needs` option only for admins), Sort (only shown in Chores view), ◀ ▶ (Week view only; changes `state.weekStart` and fetches `GET /api/assignments?from&to` for that week).
- Side panel: the "This week so far" section from `weekProgress` ("1 / 2" text plus a bar).

- [ ] **Step 1: Write failing tests:** `weekRows` puts me first, adds "Kim (left)" only in weeks where Kim has assignments, adds Nobody only when needed, and places an assignment due Wednesday at `days[2]`. `weekProgress` counts done/total for the given week only.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Implement the view, controls and progress section.
- [ ] **Step 4: Verify in a browser:** toggling Week/Chores redraws with no network request (DevTools Network tab is quiet). ◀ to last week shows crossed-out done chips, "Was overdue" and "via …". The filter "Just me" works in both views. The view choice survives a reload.
- [ ] **Step 5: Commit** `feat: week view, filters, progress`
- [ ] **Explain checkpoint:** "grouping" = two render functions over the same `state`.

### Task 11: Admin actions on the Chores page

**Files:**
- Create: `public/js/chores/admin-dialogs.js`
- Modify: `cards-view.js`, `week-view.js`, `side-panel.js`, `main.js`, `filters.js`, `tests/filters.test.js`

**Interfaces:**
- Produces `filters.js`: `suggestNext(chore, assignments, members): { userId: number, dueDate: string }`. The due date is `addFrequency(latest dueDate for the chore, chore.frequency)` (no assignments yet → `today()`). The user is the member after the last assignee in `members` order, wrapping (no previous assignee → the first member).
- Produces `admin-dialogs.js`: `openAssignDialog(chore, members, suggestion): Promise<{userId, dueDate}|null>`, `openReassignDialog(a, members): Promise<{userId}|null>`, `openNewChoreDialog(): Promise<{title, frequency}|null>`. All are `<dialog>`s with labelled fields. Server validation errors are shown in the dialog via `showFieldError` (the dialog stays open).
- Cards: purple `+ Assign next` on every card, `Reassign…` + the `card--needs` outline on overdue/Nobody, and a final `+ New chore` card. All admin-only. The side panel gets the "Needs a new person" section (admin only) using `applyFilter(..., 'needs')`.

- [ ] **Step 1: Write failing tests** for `suggestNext`: weekly chore last due `2026-10-20` assigned to Alex, members [Alex, Sam, Jamie] → `{ userId: Sam, dueDate: '2026-10-27' }`. Last assignee is the final member → wraps to the first. No assignments → first member, today.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Implement the dialogs and admin controls.
- [ ] **Step 4: Verify in a browser** as Alex: Assign next pre-fills Sam + next week and creates the assignment. Reassign on the Nobody chore moves it. New chore with an empty title shows the field error inside the dialog. As Sam, no purple buttons are visible.
- [ ] **Step 5: Commit** `feat: admin actions on chores page`
- [ ] **Explain checkpoint:** the client hides admin buttons for convenience, and the server's `requireAdmin` is the real protection.

### Task 12: Household page

**Files:**
- Create: `public/household.html`, `public/js/household.js`

**Interfaces:**
- Consumes `GET /api/household`, the member routes (Task 3), the chore routes (Task 4), `confirmDialog`, `handleError`.
- Two tabs (buttons with `aria-selected`, panels with `role="tabpanel"`): **People** and **Chore list**, as in spec §8.5. Remove and Leave use `confirmDialog`. Leave as the admin shows "Make someone else admin first." (from the 409). Make admin re-renders, and the admin controls disappear for the old admin. Chore list: inline edit (title, frequency), Archive (confirm: "Unfinished assignments of this chore will be deleted."), Restore.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify in a browser:** add `kim@example.com` and Kim's not-in-household page switches to Chores within ~10 s. An unknown email shows the field error. Make Sam admin, and Alex's page loses the admin controls. As Sam, removing Jamie sends Jamie's unfinished chores to Nobody. Archiving a chore removes its card. Restore brings it back.
- [ ] **Step 3: Commit** `feat: household page`
- [ ] **Explain checkpoint:** the remove/leave cascade (§5).

### Task 13: States, accessibility, responsive pass, README

**Files:**
- Modify: any `public/` file as needed. Create: `README.md` (replace).

- [ ] **Step 1: Go through every async action** and check the five states from spec §8.6. With the server stopped, clicking Done shows "Something went wrong, try again" and the UI stays usable. Fix the gaps.
- [ ] **Step 2: Accessibility pass:** keyboard-only run through login → send request → accept → assign. Every input has a `<label>`. Dialogs close on Esc and return focus to the button that opened them. Tag text contrast is black on colour. `lang="en"` and page `<title>`s are set.
- [ ] **Step 3: Responsive pass** at 360, 768, 1280 px: no page-level horizontal scroll, the side panel only at ≥ 900 px.
- [ ] **Step 4: README:** what it is, requirements (Node ≥ 22), `npm install`, `npm run seed`, `npm start`, the demo logins table, `npm test`, and a brief technical description (architecture, data model, auth, the atomic accept) covering course requirements → where they're met.
- [ ] **Step 5:** `npm test` → all pass. Run the full demo script from Task 9 Step 4 once more.
- [ ] **Step 6: Commit** `docs: README; polish states and accessibility`
- [ ] **Explain checkpoint:** a full rehearsal of the presentation, with Teerapat if possible.
