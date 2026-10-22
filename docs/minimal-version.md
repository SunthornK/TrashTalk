# The minimal version, explained

This explains the `minimal` branch: the smaller Trash Talk with only what the course brief asks for, styled with plain Pico.css. It's written for studying before the oral exam, in plain language. Every section ends with a **Say this** line you can use when the TA asks.

The full version (week view, side panel, history, doodle style) is on `main`. Its study guide is [how-it-works.md](how-it-works.md). Many of its sections still apply here; this file says what is different.

---

## 1. Run it

```bash
git switch minimal
npm install       # only the first time
npm run seed      # fresh demo data (also logs everyone out)
npm start         # http://localhost:3000
```

Log in as `alex@example.com` (the admin) with password `password123`. Other accounts: `sam`, `jamie`, `robin` and `kim`, all `@example.com` with the same password. Kim has no household.

To see a handoff live, log in as Alex in a normal window and as Jamie in a private window, side by side.

To go back to the full version: stop the server, run `git switch main`, then `npm run seed` and `npm start`.

---

## 2. The big picture

```
Browser                               Server (Node + Express)            Database (SQLite file)
─────────                             ───────────────────────            ──────────────────────
HTML skeleton + Pico.css              /api/... routes                    6 tables
plain JavaScript modules   ──fetch──▶ checks who you are and what  ──SQL──▶ data/trashtalk.db
draws the page from data   ◀──JSON──  you're allowed to do
```

- One server does two jobs. Addresses under `/api/...` go to our routes and answer in JSON. Everything else is a file from `public/`.
- The browser never reloads the page. It calls `fetch`, gets JSON back and redraws part of the page.

**Say this:** "Frontend in `public/`, backend in `server/`. They only talk through the JSON API under `/api`."

---

## 3. Every file in one line

### Server (`server/`)

| File | Job |
|---|---|
| `index.js` | starts the server on port 3000 |
| `app.js` | sets up Express: JSON, static files, who's logged in, the routes, error handling |
| `db.js` | opens SQLite; `transaction()` = "all or nothing" |
| `schema.sql` | the 6 tables and the "one pending request" rule |
| `auth.js` | passwords, cookies, sessions, and the guards `requireUser` / `requireHousehold` / `requireAdmin` |
| `errors.js` | `HttpError`: an error with a status code (400, 403, 404, 409…) |
| `validate.js` | checks input: text not empty, real date, person in your household |
| `views.js` | the SQL that reads assignments and requests, turned into JSON; works out "overdue" |
| `routes/auth.js` | register, login, logout, "who am I" |
| `routes/households.js` | create a household, list it, add or remove members |
| `routes/chores.js` | add, edit, delete chores |
| `routes/assignments.js` | list, assign, reassign, mark done |
| `routes/swaps.js` | the handoff: ask, accept, say no, cancel |
| `seed.js` | fills the database with the demo flat |

### Browser (`public/`)

| File | Job |
|---|---|
| `index.html`, `household.html`, `login.html` | the skeletons: mostly empty boxes with an `id` |
| `css/style.css` | ~80 lines of layout on top of Pico |
| `js/api.js` | `api()`: the **only** place that calls `fetch` |
| `js/ui.js` | `el()` to build elements, `toast()`, form errors, dialogs, `withBusy()` |
| `js/dates.js` | dates as `'YYYY-MM-DD'`; **shared with the server** |
| `js/topbar.js` | "Flat 4B · Alex (admin) · Log out" |
| `js/login.js` | the login / create-account form |
| `js/household.js` | the Household page: members, add, remove |
| `js/chores/main.js` | the Chores page: the actions, `render()`, `refresh()`, `poll()` |
| `js/chores/state.js` | the one `state` object and `fetchAll()` |
| `js/chores/cards-view.js` | builds, filters and sorts the cards |
| `js/chores/requests.js` | "Jamie asks you to take…" with Take it / No |
| `js/chores/bits.js` | small shared pieces: the buttons, the status tag |
| `js/chores/status.js` | which status text to show ("Overdue", "Waiting on Sam"…) |
| `js/chores/swap-dialog.js` | "Who could take it?" |
| `js/chores/admin-dialogs.js` | assign, reassign, new/edit chore |
| `js/chores/no-household.js` | "You're not in a household yet" |

---

## 4. The HTML is only a skeleton

[index.html](../public/index.html) has empty boxes, and JavaScript fills them:

| Box | Filled by |
|---|---|
| `#who` in the header | `topbar.js` |
| `#requests` | `requests.js` |
| `#controls` (Show / Sort) | real HTML, because it never changes; `main.js` listens for `change` |
| `<main id="content">` | starts as "Loading…", then `cards-view.js` puts the cards there |
| `#toasts` | `toast()` |

The cards are **not** in the HTML. JavaScript creates them with `document.createElement`, through `el()` in [ui.js:9](../public/js/ui.js#L9):

```js
el('button', { onclick: save }, 'Save')
// is the same as:
const b = document.createElement('button');
b.addEventListener('click', save);
b.textContent = 'Save';
```

**Say this:** "The page loads empty. JavaScript fetches the data and creates the cards. After every change we fetch again and redraw."

---

## 5. Follow one click: Jamie presses "Take it"

This is the most important thing to be able to explain.

1. **The button** is made in [requests.js:14](../public/js/chores/requests.js#L14) with `onclick: … actions.accept(swap, …)`.
2. **The action** in [main.js:47](../public/js/chores/main.js#L47) calls `run()`. That disables the button (`withBusy`) and calls `api('POST', '/swaps/5/accept')`.
3. **`api()`** in [api.js](../public/js/api.js) calls `fetch('/api/swaps/5/accept')`. The browser sends the `sid` cookie automatically.
4. **On the server**, [app.js](../server/app.js) passes the request through the middleware in order:
   - `loadUser` ([auth.js:96](../server/auth.js#L96)) reads the cookie, hashes it, and finds Jamie in the `sessions` table, which gives `req.user`;
   - `requireHousehold` checks Jamie is logged in (otherwise 401) and in a household (otherwise 403).
5. **The route** in [swaps.js:67](../server/routes/swaps.js#L67) does three things:
   - `mySwap()` finds the request, **only within Jamie's household** (anything else gives 404);
   - it checks Jamie is the one who was asked (otherwise 403);
   - it runs a **transaction** with two UPDATEs: the request becomes "accepted", and the chore moves to Jamie. If either UPDATE changes 0 rows, someone else got there first, so the transaction rolls back and the answer is 409.
6. **The answer** comes back as JSON. `run()` shows a toast ("… is yours now"), then `refresh()` fetches everything again and `render()` redraws.
7. **Robin's page**, in another browser, picks up the change within 10 seconds through `poll()`.

**Say this:** "Click → `fetch` with the cookie → `loadUser` finds who you are → guard checks → route checks you're allowed → transaction → JSON back → we refetch and redraw."

---

## 6. The API: every route

| Method + address | Who may use it | What it does |
|---|---|---|
| `POST /api/register` | anyone | create an account and log in |
| `POST /api/login` | anyone | log in (sets the cookie) |
| `POST /api/logout` | anyone | log out (deletes the session and the cookie) |
| `GET /api/me` | logged in | who am I, which household, which role |
| `POST /api/households` | logged in, no household yet | create a household; you become its admin |
| `GET /api/household` | in a household | the name, members and chores |
| `POST /api/household/members` | admin | add someone by email |
| `DELETE /api/household/members/:id` | admin | remove someone (not yourself) |
| `POST /api/chores` | admin | add a chore |
| `PATCH /api/chores/:id` | admin | rename it or change how often |
| `DELETE /api/chores/:id` | admin | delete it and all its turns |
| `GET /api/assignments` | in a household | all unfinished turns + the latest done one per chore |
| `POST /api/assignments` | admin | give a turn to someone with a due date |
| `PATCH /api/assignments/:id` | admin | reassign a turn |
| `POST /api/assignments/:id/complete` | the person it's assigned to | mark it done |
| `GET /api/swaps` | in a household | requests to you, and requests you sent |
| `POST /api/swaps` | the owner of the chore | ask someone to take it |
| `POST /api/swaps/:id/accept` | the person asked | take it |
| `POST /api/swaps/:id/reject` | the person asked | say no |
| `POST /api/swaps/:id/cancel` | the person who asked | take the request back |

**CRUD:**
- **Create:** chores, assignments, requests, members.
- **Read:** all the GETs.
- **Update:** edit a chore, reassign, mark done, accept/reject/cancel.
- **Delete:** delete a chore, remove a member.

---

## 7. The database

Six tables, in [schema.sql](../server/schema.sql):

```
households ──▶ chores ──▶ assignments ──▶ swap_requests
    │                         (one turn: who, due date, status)
    ▼
  users ──▶ sessions
```

- An **assignment** is one turn of a chore. `user_id` can be empty, which means **Nobody** (for example after the admin removes someone).
- **One pending request per chore** is a rule in the database itself ([schema.sql:57](../server/schema.sql#L57)): a unique index that only counts rows where `status = 'pending'`. A second pending request is refused, and the route turns that into 409.
- **"Overdue" is not stored.** It is worked out every time we read ([views.js:32](../server/views.js#L32)): not done, and the due date is before today. So it can never be out of date.
- **Transactions** ([db.js:23](../server/db.js#L23)) use `BEGIN`, then `COMMIT` if everything worked or `ROLLBACK` if anything threw. We use them where two changes must happen together: accepting a request, removing a member, deleting a chore, creating a household.

> The `chores` table still has an `active` column from the full version. This branch doesn't use it. It was kept so both branches can share one database file.

---

## 8. Login and cookies (matches the lecture `wd_04_server_03_cookies_csr_ssr`)

| Step | Code |
|---|---|
| Password stored with **scrypt + a random salt**, never as text | `hashPassword` [auth.js:12](../server/auth.js#L12) |
| Login compares with `timingSafeEqual` | `verifyPassword` [auth.js:18](../server/auth.js#L18) |
| A random **session ID** (32 bytes) | `createSession` [auth.js:53](../server/auth.js#L53) |
| Only its **SHA-256 hash** goes in the `sessions` table | same function |
| `Set-Cookie: sid=…; HttpOnly; SameSite=Lax; Path=/; Max-Age=7 days` (+ `Secure` in production) | `setSessionCookie` [auth.js:65](../server/auth.js#L65) |
| Every request: read the cookie, find the user | `parseCookies` [auth.js:29](../server/auth.js#L29), `loadUser` [auth.js:96](../server/auth.js#L96) |
| Logout: delete the session, clear the cookie with the same `Path` | `routes/auth.js` |

Compared with the lecture's example:
- We **don't use `cookie-parser`**. The brief only allows Express + a database driver, so `parseCookies` does the same job in 15 lines.
- We keep sessions in a **table** instead of a JavaScript object, so they survive a restart.
- We store only the **hash** of the token, so a leaked database can't be used to log in.
- We use **fetch + JSON** (client-side rendering) instead of form posts and redirects (server-side rendering).

**Say this:** "Login sets an HttpOnly, SameSite=Lax cookie holding a random session ID. The browser sends it with every fetch, and `loadUser` looks up its hash in the sessions table."

---

## 9. Permissions: 401, 403, 404

| Code | Means | Example |
|---|---|---|
| **401** | not logged in | no cookie, or an expired session → `api()` sends you to the login page |
| **403** | logged in, but not allowed | a member tries to add a chore; Sam tries to mark Alex's chore done |
| **404** | not found, **or** it belongs to another household | we answer the same, so you can't even tell it exists |
| **400** | bad input, with the field name | empty chore name → the message appears under that input |
| **409** | conflict: the situation changed | the request was already cancelled; the chore already has a pending request |

The checks are **on the server**. The browser only hides buttons you can't use, for convenience. Even if someone sent the request by hand, the server would still refuse it.

---

## 10. The five states the brief asks for

| State | Where you see it |
|---|---|
| **Loading** | "Loading…" in `<main>` before the first fetch; buttons are disabled while their request runs (`withBusy`) |
| **Success** | a toast in the corner ("Request sent to Jamie."), and the page redraws |
| **Empty** | "No chores yet…", "Nothing matches this filter.", "There is nobody else in your household yet." |
| **Validation error** | red text under the wrong input ("Please choose who to ask.", "No account with that email…") |
| **Server error** | "Something went wrong, try again" as a toast; if the first load fails, a **Try again** button |

---

## 11. Filter and sort (the brief: "search, filtering, sorting, or grouping")

- **Show:** Everyone / Just me / Waiting on someone.
- **Sort:** Due date / Chore name.
- **Grouping:** each card groups the turns of one chore.

They are plain array functions in [cards-view.js](../public/js/chores/cards-view.js): `filterCards` uses `.filter`, `sortCards` uses `.sort`. Changing a dropdown fires a `change` event, which updates `state` and calls `render()`. There's no fetch, because the data is already loaded.

---

## 12. Live updates

- **After your own action:** `refresh()` fetches everything and redraws.
- **Other people's actions:** `poll()` runs every 10 seconds. It compares the new data with the old (as JSON text), and only redraws if something changed **and** no dialog is open, so what you're typing is never thrown away.

---

## 13. Tests

`npm test` runs 72 tests with Node's built-in test runner. Each API test starts the real app on an empty in-memory database. They cover:
- login and cookies;
- permissions (403/404);
- the handoff, including the race cases: accept after cancel, and accept after the admin reassigned;
- deleting a chore;
- the "one pending request" rule;
- dates, and the card filter and sort.

---

## 14. What's different from `main`

Removed on this branch:
- the Week view and the week arrows;
- the side panel: "This week so far" progress bars and the "Needs a new person" list;
- archive/restore chores; this branch has **edit and delete** instead;
- "Make admin" and "Leave household";
- the Household page tabs and its chore list;
- the history details "via Jamie", "was overdue" and "(left)";
- "2 chores this week" in the handoff dialog;
- the suggested person and date in "Assign";
- putting keyboard focus back after a redraw;
- the doodle theme and font.

Still the same: login and cookies, the guards, the handoff and its transaction, the database, and the API style.

> Your proposal mentions "grouping by week" and "admin views assignment history". This branch has neither; `main` has both.

---

## 15. Questions the TA might ask

**Where is the HTML for the cards?**
There isn't any. JavaScript creates the cards with `el()` → `document.createElement` after fetching `/api/assignments`.

**How does the page update without reloading?**
After every action we fetch again and call `render()`. Every 10 seconds `poll()` checks for changes from other people.

**How does the server know who you are?**
From the `sid` cookie. `loadUser` hashes it and looks it up in the `sessions` table.

**Why HttpOnly and SameSite?**
HttpOnly means JavaScript can't read the cookie, so an XSS attack can't steal it. SameSite=Lax means other websites can't make the browser send it with their requests (CSRF).

**Why hash passwords with a salt?**
If the database leaks, nobody can read the passwords. And two people with the same password still get different hashes.

**What happens if two people click at the same time?**
The UPDATE only works if the request is still pending. The second click changes 0 rows, so the transaction rolls back and that person gets 409 "This request is no longer available."

**What is a transaction?**
Several changes that happen all together or not at all: `BEGIN … COMMIT`, or `ROLLBACK` if anything fails.

**Why is "overdue" not a column?**
It depends on today's date. Working it out on every read means it can never be wrong.

**What does 403 vs 404 mean in your app?**
403: you're in the right household but not allowed (not the admin, not your chore). 404: it doesn't exist or belongs to another household; we answer the same so you can't find out which.

**What does the admin do that a member can't?**
Add, edit and delete chores; assign and reassign turns; add and remove people. Each of those routes uses `requireAdmin`.

**Why no cookie-parser or express-session?**
The brief allows only Express and a database driver on the server, so we wrote the small cookie and session code ourselves.
