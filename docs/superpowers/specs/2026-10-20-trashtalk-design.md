# Trash Talk: Design

**Date:** 2026-10-20
**Team:** Sunthorn Kompita, Teerapat Trepopsakulsin
**Course:** Web Development (client-side JS, DOM, async communication)
**Presentation deadline:** Friday 23 Oct 2026

Items marked **[builder's call]** were decided while writing this document, not by the team. Everything else was agreed in conversation.

---

## 1. Intent

Roommates agree on a fair chore split, but it decays: rotations get forgotten, chores end up owned by whoever started them, and when someone can't do theirs, the chore is silently skipped because nobody can see who's responsible.

Trash Talk makes the household's chores **visible** (who has what, when it's due, whether it's done or overdue). It also lets someone who can't do a chore **hand it off** to a roommate through a request the roommate accepts or rejects, instead of a group-chat negotiation.

The handoff is the app's main interactive feature. Mainstream chore apps (Flatastic, Flatmate, Tody, OurHome) do rotation and reminders but not request-and-accept swaps. Shift-scheduling apps (When I Work, Sling) do, and our rules match theirs: *the chore stays yours until the other person accepts.*

## 2. Goals, non-goals, anti-goals

**Goals**
- The full handoff flow works end to end and updates the page without reloading: request → accept/reject/cancel.
- Everyone sees the household's chores in two views (by week, by chore) with filter and sort.
- A household admin can set up and run the household: members, chores, assigning, and reassigning overdue or orphaned chores.
- Every async action visibly handles loading, success, empty, validation-error and server-error states.
- The code is small and plain enough that **both** students can explain any part of it at the presentation.

**Non-goals (explicitly out of scope)**
- Automatic recurring assignment generation (the admin assigns by hand; the next due date is only *suggested*).
- Points, rewards, join codes, email or push notifications, password reset.
- A user in more than one household; deleting a household; an admin who is the only member leaving.
- Trades (two-way swaps). Handoffs are one-way.
- Deployment. The demo runs on a laptop.
- WebSockets or other real-time transport. Polling is enough.

**Anti-goals (failure even if it "works")**
- Using any client-side JS library or any server package beyond Express and the DB driver (fails the course rules).
- A large set of half-finished features. The course explicitly grades a smaller, complete app higher.
- Code either student can't explain when questioned.
- Status shown by colour alone (fails accessibility).

## 3. Constraints

- **Client:** plain JavaScript only (ES modules, `fetch`, DOM APIs). No JS libraries or frameworks. CSS frameworks are allowed.
- **Server:** Node.js + Express + the database driver. Nothing else at runtime.
- Relational database, meaningful CRUD, async requests, users + admins, authentication with cookies and securely stored passwords.
- Search/filter/sort/grouping; responsive and accessible; clear handling of invalid input; setup instructions and a brief technical description (README).
- Synthetic data only.
- **To confirm with the TA:** that `better-sqlite3` counts as an allowed DB module (fallback: Node's built-in `node:sqlite`), and that loading a Google Font is fine (fallback: self-host the font file, which we do anyway).

## 4. Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22 (the team has 22.14) |
| Server | Express 5 (async route errors reach the error handler automatically) |
| Database | SQLite in one file, via `better-sqlite3` (synchronous API) |
| Passwords | `crypto.scrypt`, 16-byte random salt per user, compared with `crypto.timingSafeEqual` |
| Sessions | Random token (`crypto.randomBytes(32)`) in an `HttpOnly`, `SameSite=Lax` cookie. Only the token's SHA-256 hash is stored in a `sessions` table. 7-day expiry. `Secure` flag when `NODE_ENV=production`. No `cookie-parser` / `express-session`: the cookie header is parsed by hand (a few lines). |
| Client | Static HTML + ES modules served by Express (`express.static`), `fetch` to a JSON API under `/api` |
| Styling | Pico.css as the base (layout, forms, focus states, responsive), plus our own theme CSS for the doodle look |
| Dev | `node --watch`, `node --env-file=.env`; tests (if any) with the built-in `node:test` |

Express serves both the API and the static files from one process, so there's no CORS.

## 5. Accounts, households and roles

- Anyone can **register** (name, email, password) and **log in**. Email is unique and stored lowercase. Password minimum 8 characters.
- A user belongs to **at most one household** (`users.household_id`, nullable). The role is a column on the user: `admin` or `member`.
- A logged-in user with no household sees **"You're not in a household yet"**. It shows their email ("ask your admin to add robin@example.com") and a form to **start a new household**. Starting one makes them its admin. This page polls, so it switches to the household once they're added.
- The **admin adds members by email**. The person must already have registered and must not be in a household. Errors: "No account with that email. Ask them to register first." / "That person is already in a household."
- **Make admin:** transfers the role. In one transaction the target becomes `admin` and the current admin becomes `member`, so a household always has exactly one admin.
- **Remove member (admin)** and **Leave household (member)** do the same thing. The user's `household_id` and role are cleared. Their **unfinished** assignments become unassigned (`user_id = NULL`), which puts them in "Needs a new person". Every **pending** swap where they are requester or target is cancelled. Completed assignments keep their `user_id` for history.
- **The admin cannot leave or remove themselves.** The Leave button explains: "Make someone else admin first." (This is also an "invalid action" case for the demo.)

## 6. Chores, assignments and status

- A **chore** belongs to a household: `title`, `frequency` (`daily` / `weekly` / `monthly` / `once`), `active`. The `assignmentType` from the proposal is dropped.
- An **assignment** is one instance: `chore_id`, `user_id` (nullable = nobody), `due_date` (date only), `status` (`assigned` / `completed`), `completed_at`.
- **The admin creates assignments manually** ("+ Assign next" on a chore card). The dialog pre-fills the due date as *the chore's latest due date + frequency* (daily +1 day, weekly +7, monthly +1 month, once → today) and the next person **[builder's call: pre-select the member after the last assignee in member order; the admin can change it]**.
- **Overdue is computed when assignments are read**, never stored: `status = 'assigned' AND due_date < today`. "Today" means the server's local date.
- **Only the assignee can mark it done.** Completing an assignment cancels any pending swap on it.
- **Statuses shown in the UI** (always as text, colour is extra):

| Shown | Rule |
|---|---|
| To do | assigned, not overdue, no pending swap |
| Overdue | assigned, `due_date < today` (can combine with a waiting tag) |
| Waiting on *Name* / Waiting on you | has a pending swap request |
| Nobody | `user_id IS NULL` |
| Done | completed |
| Was overdue (history) | completed and `completed_at` date > `due_date` |

- **Archiving a chore** (admin) sets `active = 0`. **[builder's call]** It also deletes that chore's *unfinished* assignments and cancels their pending swaps. Completed ones stay for history. Archived chores can be restored. This is the app's Delete/Archive operation for chores.
- **Reassign (admin)** sets `user_id` on an unfinished assignment and cancels any pending swap on it.

## 7. The handoff (swap request)

One-way: the requester asks one specific roommate to **take** one of the requester's unfinished chores. Nothing is given back.

**Rules**
1. You can only request a handoff for **your own unfinished** assignment, overdue ones included.
2. The target can be **any other member** of your household, whatever their current workload.
3. **At most one pending request per assignment.** To ask someone else, the requester cancels first (or waits for a rejection). Enforced in the database:
   `CREATE UNIQUE INDEX one_pending_swap ON swap_requests(assignment_id) WHERE status = 'pending';`
4. An assignment can collect **many requests over time** (rejected, cancelled, accepted). They're kept as history.
5. A pending request stays pending until the **target accepts or rejects**, the **requester cancels**, or it's auto-cancelled (assignment completed, reassigned or archived, or either person leaves).
6. **Until it's accepted, the chore stays the requester's**, including its overdue status.
7. Optional short **message** from the requester (max 200 chars).

**Accepting is conditional and atomic** (one transaction). Whoever's action reaches the server first wins. The loser gets HTTP 409 and "This request is no longer available."
```sql
UPDATE swap_requests SET status = 'accepted', resolved_at = ?
 WHERE id = ? AND target_user_id = ? AND status = 'pending';
-- 0 rows → 409, stop

UPDATE assignments SET user_id = ?        -- the target
 WHERE id = ? AND user_id = ? AND status = 'assigned';  -- still the requester's, unfinished
-- 0 rows → roll back, 409
```
Cancel and reject use the same `WHERE ... AND status = 'pending'` guard.

## 8. Screens

The visual style is **"doodle frame, clean text"**. Mockups are in `.superpowers/brainstorm/` (not committed); this section is the source of truth.

### 8.1 Visual style
- Hand-drawn wobbly outlines: `border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px`, 2–2.5px near-black (`#222`) borders, hard offset shadows (`3px 3px 0 #222`).
- **Doodle font (Gloria Hallelujah) only for the logo, headings and chore titles.** Everything else uses the normal system font, for readability.
- Colours: yellow `#ffd84d` primary buttons and active nav, orange `#ff7a59` overdue, blue `#8fd3ff` waiting, green `#b8f2a0` done, pale yellow `#fffbe6` highlights *your* rows and cards, purple `#e8dcff` **admin-only buttons**, red outline for "needs a new person". Defined as CSS custom properties layered over Pico's variables.
- Self-host the font file in `public/fonts/` so the demo works offline.

### 8.2 Log in / Register (`login.html`)
One page that toggles between log in and register. Labelled inputs, inline errors ("Wrong email or password.", "Email already registered.", "Password must be at least 8 characters."). On success → `index.html`.

### 8.3 Not in a household yet
Shown inside `index.html` when `me.householdId` is null (see §5).

### 8.4 Chores page (`index.html`): the main screen
**Top bar:** logo · **Chores** · **Household** · "Flat 4B · Alex (admin) · Log out".

**Controls row:**
- **Week | Chores** switch: two ways to draw the *same* loaded data (this is the "grouping": by week vs by chore). The last choice is remembered in `localStorage` (convenience only).
- **Show** filter: Everyone · Just me · Waiting on someone · Needs a new person (admin only).
- **Sort** (Chores view only): due date (default) · chore name.
- **Week view only:** ◀ week ▶ navigation, showing "19–25 Oct".

**Week view (fridge chart):** a real `<table>`. Rows are current members ("You" first, highlighted), plus a "Nobody" row if any unassigned chores fall in that week. **[builder's call]** Former members also get a row, labelled "*Name* (left)", in any week where they have completed assignments, so past weeks keep their history. The user row still exists, so the name is a simple join. Columns are Mon–Sun, with today highlighted. Each assignment is a small chip in its cell, showing the chore title and status colour plus text/strike-through. Clicking a chip opens a small popover with the details and the same actions the cards have. **Past weeks are the history:** done chips are crossed out, late ones say "Was overdue", accepted handoffs say "via *Name*". Weeks run Monday–Sunday.

**Chores view (one card per active chore):** each card shows the title, status tag, the **current** assignment (who + due date), and "then *Name*, *Name*" for later unfinished assignments. **[builder's call]** The "current" assignment is the earliest unfinished one, or the latest completed one if none is unfinished. Your cards are highlighted. Actions on the current assignment:
- Yours, unfinished, no pending swap: **Done ✓**, **Can't do it…**
- Yours with a pending swap: **Cancel request**
- Admin (purple): **+ Assign next**, **Reassign…** (on overdue/Nobody cards, which also get the red outline)
- Last card (admin only): **+ New chore** (title + frequency).

**Side panel (wide screens, ≥ 900px **[builder's call]**):** a right-hand column with
1. **Requests:** incoming ("**Jamie** asks you to take **Vacuum living room** (Thu)." + message) with **Take it** / **No**, and your sent pending ones ("You asked Sam: Clean bathroom · waiting").
2. **This week so far:** per member, a done / assigned bar for the current week, with text like "1 / 2".
3. **Needs a new person** (admin only): overdue + unassigned assignments, each with **Reassign…**.

**Narrow screens (< 900px):** no side panel. Incoming requests show as a banner above the controls, the progress bars sit above the content, and "Needs a new person" is available through the filter. The Chores view is the default on first visit. The Week table scrolls horizontally inside its own box.

**"Can't do it…" dialog** (`<dialog>`): "Who could take it?" lists the other members, each with their number of unfinished chores this week. Pick one, add an optional message, **Send request**. The note says "It stays yours until *Name* says yes." On success the dialog closes, the card shows "Waiting on *Name*", and a toast says "Request sent to *Name*".

**Reassign / Assign next dialogs** (`<dialog>`): a member dropdown (plus a due date for Assign next), then confirm.

**Live sync:** the page re-fetches assignments + swaps every **10 seconds** and re-renders only if the data changed. It does not re-render while a dialog is open. Two browsers side by side (Alex and Jamie) show a request appearing within seconds. That's a planned demo moment.

### 8.5 Household page (`household.html`)
Two tabs: **People** and **Chore list**.
- **People:** the member list (avatar initial, name, Admin tag). Admin sees **Make admin** and **Remove** (with a confirm dialog) on each other member, plus "Add someone by email". Members see the list read-only, plus **Leave household** (with a confirm dialog).
- **Chore list:** all chores including archived. Admin can **edit** (title, frequency), **archive** and **restore**. Members see it read-only.

### 8.6 Feedback states (everywhere)
- **Loading:** a "Loading…" placeholder in the area being filled. Buttons disable while their request is in flight (which also stops double-submits).
- **Success:** a short toast in an `aria-live="polite"` region, plus the DOM updated in place.
- **Empty:** "No chores yet": the admin is pointed to "+ New chore", members to "ask your admin". "Nothing for you right now 🎉" when a filter returns nothing. "No requests" in the panel.
- **Validation error:** shown next to the field (`aria-invalid`, message linked with `aria-describedby`). The server returns `400 { error, field }`.
- **Server error / network failure:** a toast "Something went wrong, try again", and the UI goes back to its previous state.
- **401:** redirect to `login.html`. **403:** "You don't have permission to do that." **409:** the specific conflict message.

### 8.7 Accessibility and responsiveness (must-haves)
Semantic HTML (`nav`, `main`, `aside`, `table`, `button`, `dialog`, `label`). Every status has text. Visible focus (keep Pico's). Keyboard works for chips, cards, dialogs (Esc closes). Colour contrast: black text on the coloured tags. Layout works from 360px phone width up.

## 9. Data model (SQLite)

```sql
households    (id INTEGER PK, name TEXT NOT NULL, created_at TEXT NOT NULL)
users         (id INTEGER PK, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
               password_hash TEXT NOT NULL,          -- "salt:hash" hex
               household_id INTEGER NULL REFERENCES households(id),
               role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
               created_at TEXT NOT NULL)
sessions      (token_hash TEXT PK, user_id INTEGER NOT NULL REFERENCES users(id),
               expires_at TEXT NOT NULL)
chores        (id INTEGER PK, household_id INTEGER NOT NULL REFERENCES households(id),
               title TEXT NOT NULL, frequency TEXT NOT NULL
               CHECK (frequency IN ('daily','weekly','monthly','once')),
               active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)
assignments   (id INTEGER PK, chore_id INTEGER NOT NULL REFERENCES chores(id),
               user_id INTEGER NULL REFERENCES users(id),
               due_date TEXT NOT NULL,              -- 'YYYY-MM-DD'
               status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','completed')),
               completed_at TEXT NULL, created_at TEXT NOT NULL)
swap_requests (id INTEGER PK, assignment_id INTEGER NOT NULL REFERENCES assignments(id),
               requester_id INTEGER NOT NULL REFERENCES users(id),
               target_user_id INTEGER NOT NULL REFERENCES users(id),
               message TEXT NULL,
               status TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','rejected','cancelled')),
               created_at TEXT NOT NULL, resolved_at TEXT NULL)
CREATE UNIQUE INDEX one_pending_swap ON swap_requests(assignment_id) WHERE status = 'pending';
```
`PRAGMA foreign_keys = ON` at startup. The principal entity is **Chore/Assignment**; related entities are Household, User and SwapRequest.

## 10. API (JSON over `fetch`, all under `/api`)

Every route except register/login requires a session. Every household-scoped route checks the target belongs to the caller's household.

| Method & path | Who | Does |
|---|---|---|
| `POST /register` | anyone | create account, log in |
| `POST /login` · `POST /logout` | anyone · user | session cookie set / cleared |
| `GET /me` | user | `{ id, name, email, role, householdId, householdName }` |
| `POST /households` | user without household | create, become admin |
| `GET /household` | member | members + chores (incl. archived) |
| `POST /household/members` `{email}` | admin | add member |
| `DELETE /household/members/:id` | admin (others) or self (non-admin) | remove / leave (§5) |
| `POST /household/members/:id/make-admin` | admin | transfer role |
| `POST /chores` · `PATCH /chores/:id` | admin | create · edit / archive / restore |
| `GET /assignments?from=YYYY-MM-DD&to=YYYY-MM-DD` | member | household assignments in range, with computed `overdue`, `wasLate`, `pendingSwap {id, targetName}`, `viaName` |
| `POST /assignments` `{choreId, userId, dueDate}` | admin | create |
| `PATCH /assignments/:id` `{userId}` | admin | reassign |
| `POST /assignments/:id/complete` | assignee | mark done |
| `GET /swaps` | member | `{ incoming: [...pending to me], sent: [...my pending] }` |
| `POST /swaps` `{assignmentId, targetUserId, message?}` | assignee | create (409 if one is already pending) |
| `POST /swaps/:id/accept` · `/reject` | target | §7 |
| `POST /swaps/:id/cancel` | requester | §7 |

Errors are always `{ error: "human message", field?: "name" }` with 400 / 401 / 403 / 404 / 409 / 500. The API only accepts `application/json` bodies. Together with `SameSite=Lax` cookies, this is our CSRF protection.

**[builder's call]** The Chores view needs each chore's latest/upcoming assignments, not just this week's. `GET /assignments` without `from`/`to` returns all unfinished assignments plus the latest completed one per chore.

## 11. Project layout

```
TrashTalk/
  server/
    index.js            # express app, static files, error handler
    db.js               # open SQLite, run schema.sql, a small transaction(fn) helper
                        # using BEGIN/COMMIT/ROLLBACK; the only file that imports
                        # the driver, so switching to node:sqlite is a one-file change
    schema.sql
    seed.js             # demo data (npm run seed)
    auth.js             # hashing, sessions, requireUser / requireAdmin middleware
    routes/             # auth.js, households.js, chores.js, assignments.js, swaps.js
  public/
    index.html  login.html  household.html
    css/theme.css       # doodle theme over Pico
    vendor/pico.min.css
    fonts/
    js/
      api.js            # fetch wrapper: JSON, error mapping, 401 redirect
      ui.js             # toast, loading, dialogs, form errors
      login.js  household.js
      chores/           # main.js (state + polling), week-view.js, cards-view.js,
                        # side-panel.js, swap-dialog.js, admin-dialogs.js
  README.md             # setup + brief technical description
```
`npm start` runs `node server/index.js`, `npm run dev` adds `--watch`, `npm run seed` resets the DB with demo data.

**Who builds it:** Sunthorn implements everything together with Claude (AI pair-programming), in one track following §13. Since both students are examined on all of the code, each build step ends with an **explain checkpoint**: Sunthorn can explain what was built and why, and Teerapat gets a walkthrough of it before the presentation.

## 12. Demo data (seed)

Dates are generated **relative to today**, so the demo always has something overdue, due this week and upcoming.
- Household **Flat 4B**: **Alex** (admin), **Sam**, **Jamie**, **Robin**. Plus **Kim**, who has no household, to show the "not in a household" screen. **[builder's call]** Kim is the backstory for the seeded "Nobody" chores and has some completed assignments in past weeks (shown as "Kim (left)"). The UI never shows "Kim moved out": unassigned chores simply say **Nobody**, as in §6. No previous-assignee column is needed.
- All passwords `password123`, listed in the README.
- 5–6 chores (Take out trash, Clean bathroom, Vacuum living room, Wash dishes, Mop kitchen, Groceries). Assignments over the previous 2 weeks (done, one done late, one via an accepted handoff), this week (one overdue, one with a pending request, one Nobody), and next week.

## 13. Suggested build order

Make the handoff work end to end first, then widen.
1. Server skeleton, schema, seed, auth (register/login/logout/me).
2. `GET /assignments` + Chores view cards + Done ✓.
3. Swap API + "Can't do it…" dialog + Requests panel (accept/reject/cancel) + polling. **The core demo works here.**
4. Week view + filter/sort + side-panel progress bars.
5. Admin: assign next, reassign, new chore. Household page (people, chore list).
6. Not-in-household screen, all empty/error states, accessibility pass, responsive pass, README.

Available hours are unknown, so the plan carries a cut line. Steps 1–3 are the must-have, and step 6's error/empty states and README are also required by the course. If time runs short, cut from the bottom of step 4–5 extras (progress bars, sort by name, restore archived) before touching steps 1–3.
