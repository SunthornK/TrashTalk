# How Trash Talk works: a study guide

This guide explains the project in plain language, for the presentation. It grows with each build task. Each part has:
- **The idea:** what it is, with an everyday comparison
- **In our code:** where it lives
- **Say this:** one or two sentences to use if the TA asks
- **Likely questions:** with short answers

Decisions and their reasons are in [decisions.md](decisions.md).

---

## 0. The big picture

Trash Talk has three parts that talk to each other:

```
 Browser (HTML + our JS)  ──request──▶  Server (Node + Express)  ──SQL──▶  Database (SQLite file)
                          ◀──JSON────                            ◀─rows──
```

Think of a restaurant:
- The **browser** is the customer. It shows the menu (the page) and places orders ("mark this chore done").
- The **server** is the waiter and the kitchen. It checks the order is allowed, then does the work.
- The **database** is the pantry and the order book. It's where everything is stored for good.

An order is an **HTTP request**: a *method* (`GET` = give me something, `POST` = do something, `PATCH` = change something, `DELETE` = remove something) plus a *path* like `/api/login`. The order slip is written in **JSON**, a text format that looks like a JavaScript object: `{"email": "alex@example.com", "password": "..."}`.

The server answers with a **status code** and usually some JSON:

| Code | Means | Example in our app |
|---|---|---|
| 200 / 201 | OK / Created | logged in, account created |
| 204 | OK, nothing to send back | logged out |
| 400 | Your input is wrong | password too short |
| 401 | You're not logged in | no valid cookie |
| 403 | Logged in, but not allowed | a member trying an admin action |
| 404 | Not found | wrong ID, or another household's chore |
| 409 | Conflict with the current state | email already registered; swap no longer pending |
| 415 | Wrong format | the body isn't JSON |
| 500 | The server crashed | a bug; the user sees "Something went wrong, try again" |

**Say this:** "The browser only shows things and sends requests with `fetch`. All the rules are checked on the server, and the data lives in a SQLite database."

---

## 1. The server: Node + Express (Task 1)

**The idea.** Node runs JavaScript outside the browser. **Express** is a small library that turns Node into a web server. You tell it: *"when a request comes for `POST /api/login`, run this function."* That's a **route**.

A request passes through a line of functions called **middleware**, in order, like checkpoints at an airport. Each one can let the request through (`next()`), answer it, or stop it with an error. Ours, in [server/app.js](../server/app.js):

1. `express.json()` reads the JSON body into `req.body`.
2. `requireJsonBody` refuses bodies that aren't JSON (415).
3. `express.static('public')` serves our HTML/CSS/JS files.
4. `loadUser` works out who's logged in from the cookie (see §5).
5. The **routes** (`/api/register`, `/api/login`, …).
6. If nothing matched: a JSON 404.
7. The **error handler**: if any step threw an error, it turns it into a JSON answer.

**In our code**
- [server/app.js](../server/app.js) `createApp(db)` builds this line-up.
- [server/index.js](../server/index.js) opens the real database file and starts listening on port 3000.

They're separate so the tests can run the same app on an empty, in-memory database without touching real data.

**Errors.** Route code doesn't build error responses by hand. It does `throw new HttpError(400, 'Please enter your name.', 'name')`. The error handler at the end turns that into status 400 + `{"error": "Please enter your name.", "field": "name"}`. The `field` tells the browser which input to show the message under.

**Say this:** "Express handles each request by passing it through middleware in order: parse the JSON, check who's logged in, run the route, and turn any thrown error into a JSON response."

**Likely questions**
- *What is middleware?* A function every request passes through before (or instead of) the route. It can let the request continue, answer it, or stop it with an error.
- *Why do you check the content type?* Our API only accepts JSON. Together with the cookie setting `SameSite`, this stops another website from secretly submitting a form to our API.

---

## 2. The database: SQLite and SQL (Task 1)

**The idea.** A relational database is like a set of spreadsheets (**tables**). Each table has fixed **columns**, and each **row** is one thing: one user, one chore. We use **SQLite**, where the whole database is a single file (`data/trashtalk.db`), so there's no database server to install.

Our six tables ([server/schema.sql](../server/schema.sql)):

| Table | One row is… |
|---|---|
| `households` | a flat, e.g. "Flat 4B" |
| `users` | a person (name, email, password hash, which household, admin or member) |
| `sessions` | one logged-in browser |
| `chores` | a kind of task, e.g. "Take out trash", weekly |
| `assignments` | one instance: "Trash, Alex, due Tue 20 Oct" |
| `swap_requests` | "Alex asked Sam to take assignment 12" |

- **Primary key** (`id`): a unique number for each row.
- **Foreign key** (`REFERENCES`): a column that points at a row in another table, e.g. `assignments.chore_id → chores.id`. With `PRAGMA foreign_keys = ON`, SQLite refuses to point at something that doesn't exist.
- **CHECK**: only allowed values, e.g. `role` must be `'admin'` or `'member'`.

**SQL** is the language for talking to the database:
```sql
SELECT name FROM users WHERE email = ?              -- read
INSERT INTO chores (title, frequency) VALUES (?, ?) -- create
UPDATE assignments SET user_id = ? WHERE id = ?     -- change
DELETE FROM sessions WHERE token_hash = ?           -- remove
```
The `?` marks are **placeholders**. The real values are passed separately, so a user typing `'; DROP TABLE users; --` as their name is stored as text and never run as SQL. That's how you prevent **SQL injection**.

**Say this:** "We use SQLite with six tables. Chores and their assignments are the main entity; households, users and swap requests relate to them through foreign keys. All queries use placeholders, which prevents SQL injection."

### The "one pending request" rule
```sql
CREATE UNIQUE INDEX one_pending_swap ON swap_requests (assignment_id) WHERE status = 'pending';
```
This means: among requests that are *pending*, each `assignment_id` may appear only once. Rejected or cancelled ones don't count. The **database itself** refuses a second pending request, even if our JavaScript had a bug.

### Transactions
**The idea.** Some actions need several changes that only make sense together. "Make Sam admin" means (1) Sam becomes admin and (2) Alex becomes a member. If (1) succeeded and (2) failed, the flat would have two admins.

A **transaction** makes several changes count as one. Either all of them are saved, or none are. [server/db.js](../server/db.js):
```js
transaction(db, () => {
  // several UPDATEs here
});
```
It runs `BEGIN` → your code → `COMMIT` (save). If anything throws, it runs `ROLLBACK` instead, and every change since `BEGIN` is undone.

**Say this:** "A transaction makes several changes all-or-nothing, so the database is never left half-changed."

**Likely questions**
- *Why SQLite and not MySQL/PostgreSQL?* It's a real relational database with no separate server to run, which suits a course demo.
- *What is a foreign key?* A column that points to a row in another table. The database refuses links to rows that don't exist.

---

## 3. Passwords: hashing with a salt (Task 2)

**The idea.** We never store passwords. We store a **hash**: the result of putting the password through a one-way blender. The same password always gives the same hash, but you can't turn a hash back into the password. At login, we blend what the user typed and compare it with the stored hash.

Two extra protections:
- **Salt:** a random value mixed in, different for every user. Two people with the password `password123` get completely different hashes, so an attacker can't use a pre-made list of hashes for common passwords.
- **Slow on purpose:** `scrypt` is designed to be slow, which makes guessing millions of passwords impractical.

We store `"salt:hash"` in the `password_hash` column. **In our code:** [server/auth.js](../server/auth.js) `hashPassword` and `verifyPassword`, using Node's built-in `crypto`, so there's no extra library.

`timingSafeEqual` compares the two hashes in a way that always takes the same time, so an attacker can't learn anything from how fast the answer comes.

**Say this:** "Passwords are hashed with scrypt and a random salt per user, using Node's built-in crypto. We only store the salt and the hash, never the password."

**Likely questions**
- *Why not just encrypt the password?* Encryption can be reversed with a key. A hash can't, so even we can't read passwords.
- *What does the salt do?* It makes identical passwords produce different hashes, which stops pre-computed attacks.
- *Why is "Wrong email or password." the same message for both?* So the login form can't be used to find out which emails have accounts.

---

## 4. Register and login (Task 2)

[server/routes/auth.js](../server/routes/auth.js):
- **Register** (`POST /api/register`): check the name, email and password (≥ 8 chars), refuse if the email exists (409), save the user with the hashed password, then log them straight in.
- **Login** (`POST /api/login`): find the user by email, check the password, start a session.
- **Logout** (`POST /api/logout`): delete the session and clear the cookie.
- **Me** (`GET /api/me`): "who am I?" The browser calls this to know who's logged in.

Emails are stored **lowercase**, so `Alex@Example.com` and `alex@example.com` are the same account.

---

## 5. Staying logged in: sessions and cookies (Task 2)

**The idea.** HTTP has no memory: every request arrives as a stranger. A festival solves this with a **wristband**: you show your ticket once and get a wristband, and from then on staff just check the wristband.

- Logging in = showing your ticket (email + password).
- The server then makes a **session**: a long random code (the token), and gives it to the browser as a **cookie** named `sid`. That's the wristband.
- The browser automatically sends the cookie with every request. The `loadUser` middleware looks it up and sets `req.user`.

Where the token is kept:
- **The browser** has the token in the cookie.
- **The database** has only its **SHA-256 hash** (`sessions.token_hash`). If someone stole the database, they still couldn't make a valid wristband. It's the same idea as password hashing.
- Sessions expire after 7 days.

The cookie's safety settings:
- **`HttpOnly`:** page JavaScript can't read the cookie. Even if someone managed to inject a script into our page (XSS), it couldn't steal the login.
- **`SameSite=Lax`:** the browser doesn't send the cookie when *another* website tries to post to our API. This blocks "cross-site request forgery" (CSRF).
- **`Secure`** (only in production): the cookie is only sent over HTTPS.

### Guards
Routes are protected by small middleware functions in [server/auth.js](../server/auth.js):
- `requireUser`: not logged in → **401**
- `requireHousehold`: logged in but not in a household → **403** "Join a household first"
- `requireAdmin`: not the admin → **403** "You don't have permission to do that."

Hiding admin buttons in the browser is only for convenience. **These server checks are the real protection**, because anyone can send requests without using our page.

**Say this:** "After login the server creates a random session token, sends it as an HttpOnly, SameSite cookie, and stores only its hash. Every request is checked on the server by middleware: 401 if you're not logged in, 403 if you're not allowed."

**Likely questions**
- *Why a cookie and not localStorage?* An HttpOnly cookie can't be read by JavaScript, so a script injected into the page can't steal it.
- *What's the difference between 401 and 403?* 401 means we don't know who you are. 403 means we know, but you're not allowed.

---

## 6. Households and members (Task 3)

[server/routes/households.js](../server/routes/households.js)

| Request | Who | What happens |
|---|---|---|
| `POST /api/households` | someone with no household | creates it; you become its **admin** |
| `GET /api/household` | any member | the household, its members and its chores |
| `POST /api/household/members` | admin | adds a registered person by email |
| `DELETE /api/household/members/:id` | admin (someone else) or you (yourself) | remove / leave |
| `POST /api/household/members/:id/make-admin` | admin | hand the admin role to someone |

**Route parameters.** `:id` is a blank in the path. A request to `/api/household/members/7` gives the route `req.params.id = "7"`. It arrives as text, so we turn it into a number with `Number(...)`.

**The "is this yours?" check.** Every route looks people up with `WHERE id = ? AND household_id = ?`, the second `?` being *your* household. If the person is in another household, the query finds nothing and we answer **404**. So an admin of one flat can't touch another flat just by guessing numbers. We use 404, not 403, so we don't even confirm that the person exists.

**Leaving or being removed** (`removeFromHousehold`) runs three changes in one **transaction**:
1. cancel every *pending* swap request where you're the asker or the one asked,
2. your *unfinished* chores get `user_id = NULL`, shown as **Nobody** for the admin to reassign,
3. you're taken out of the household, and your role goes back to `member`.

Your *completed* chores keep your name, so the history stays true.

**Make admin** is two `UPDATE`s inside a transaction: the other person becomes admin, and you become a member. A household always has exactly one admin. The admin can't leave until they've handed the role over ("Make someone else admin first.").

**Say this:** "Every household route only looks inside the caller's own household, so other households' IDs simply aren't found. Changes that touch several rows, like leaving or transferring admin, run in a transaction."

**Likely questions**
- *What happens to a person's chores when they leave?* Unfinished ones become "Nobody" so the admin can reassign them. Finished ones stay in the history with their name.
- *How do you make sure there's always one admin?* The admin can't leave or be removed, and transferring the role swaps both people in one transaction.
- *Could a member remove another member?* No. The server checks the role and answers 403.

---

## 7. Chores, assignments and "overdue" (Task 4)

**Chore vs assignment.** A **chore** is the kind of task ("Take out trash", weekly). An **assignment** is one instance of it: *who* does it and *when* ("Trash, Sam, due Tue 27 Oct"). One chore has many assignments over time. The admin creates assignments by hand.

| Request | Who | What happens |
|---|---|---|
| `POST /api/chores` | admin | new chore (title + daily/weekly/monthly/once) |
| `PATCH /api/chores/:id` | admin | rename, change frequency, **archive** (`active: false`) or **restore** |
| `GET /api/assignments` | member | the household's assignments (see below) |
| `POST /api/assignments` | admin | assign a chore to someone with a due date |
| `PATCH /api/assignments/:id` | admin | **reassign** to someone else |
| `POST /api/assignments/:id/complete` | the assignee only | mark done |

**JOINs.** An assignment row only stores numbers (`chore_id = 3`, `user_id = 2`). To answer with names, the query in [server/views.js](../server/views.js) **joins** tables: for each assignment, also fetch the chore with that id, the user with that id, any pending swap, and the name of the person who was asked. A `LEFT JOIN` means "if there's a match, include it, otherwise fill in null". We use it for the user (the chore might be "Nobody") and for swaps (most chores have none).

**Computed fields.** Some fields aren't stored. They're worked out every time the assignments are read (`toView` in [views.js](../server/views.js)):
- `overdue`: not done **and** due date is before today. A chore due *today* is not overdue yet.
- `wasLate`: done, but on a later day than it was due (used for history).
- `pendingSwap`: who has been asked to take it, if anyone.
- `viaName`: if it came to you through an accepted swap, who handed it over.
- `userLeft`: the person has since left the household.

Because they're calculated on every read, they can never be out of date. No timer has to wake up at midnight to mark things overdue.

**Two ways to ask.** `GET /api/assignments?from=2026-10-19&to=2026-10-25` returns everything due that week, used by the week view (also for past weeks = history). Without dates, it returns every unfinished assignment plus the most recent finished one for each chore, used by the chore cards.

**Shared date helpers.** [public/js/dates.js](../public/js/dates.js) is used by **both** the server and the browser, so they agree on "today" and "this week" (Monday–Sunday). Dates are plain text like `'2026-10-20'`, which conveniently sorts and compares correctly as text.

**Archiving** a chore hides it and deletes its *unfinished* assignments (and their swap requests). Finished ones stay as history. It can be restored later. This is our "delete" operation for chores.

**Say this:** "A chore is the task; an assignment is one person doing it by one date. Overdue isn't stored, it's computed when assignments are read, so it's always correct. The query joins assignments with chores, users and swap requests to send everything the page needs in one response."

**Likely questions**
- *Why isn't 'overdue' a column?* It would need a background job to update it at midnight, and it could get out of sync. Computing it is always right.
- *What's a JOIN?* Combining rows from two tables that match on a column, e.g. assignment.user_id = users.id, to get the user's name.
- *Who can mark a chore done?* Only the person it's assigned to. The server checks and answers 403 otherwise.

---

## 8. Swap requests: the main feature (Task 5)

**What it is.** A one-way **handoff**: "Sam, can you take my Trash?" Sam can say yes or no, and I can take the request back. Nothing is given in return. [server/routes/swaps.js](../server/routes/swaps.js)

| Request | Who | What happens |
|---|---|---|
| `GET /api/swaps` | member | `{ incoming, sent }`: pending requests to me / from me |
| `POST /api/swaps` | the chore's owner | ask someone (optional message, max 200 chars) |
| `POST /api/swaps/:id/accept` | the person asked | the chore becomes theirs |
| `POST /api/swaps/:id/reject` | the person asked | it stays with the asker |
| `POST /api/swaps/:id/cancel` | the asker | takes the request back |

**The rules**
1. You can only ask about **your own, unfinished** chore (overdue is fine).
2. You can ask **anyone else in your household**, not yourself and not outsiders.
3. **Only one pending request per chore at a time.** The database's unique index enforces it. To ask someone else, cancel first.
4. **Until it's accepted, the chore is still yours**, including being overdue.

**Status of a request:** `pending` → `accepted` / `rejected` / `cancelled`. Old requests are kept, so one chore can have many requests over time, but only ever one *pending*.

**The race problem.** Sam clicks *Accept* at the same moment Alex clicks *Cancel*. If the server did "check it's pending → then update", both could pass the check before either updates. We do **one conditional update** instead:

```sql
UPDATE swap_requests SET status = 'accepted' WHERE id = ? AND status = 'pending'
```

The database answers with how many rows it changed:
- **1** → we were first, so it's ours.
- **0** → someone else changed it first, so we answer **409 "This request is no longer available."**

Accepting needs two changes: the request becomes `accepted`, **and** the chore moves to Sam. Both run inside a **transaction**. The second UPDATE also only matches if the chore is *still* the asker's and *still* unfinished. If it isn't (say the admin reassigned it a second ago), we throw, the transaction **rolls back** the first change too, and nothing is half-done.

**Say this:** "Accepting is one transaction with two conditional updates. Each only matches if the data is still as expected, so if two people act at the same moment, exactly one wins and the other gets a clear 409 message."

**Likely questions**
- *What if Sam and Alex click at the same time?* Whichever request reaches the database first changes the row. The other changes 0 rows and gets "This request is no longer available."
- *How do you stop two pending requests for one chore?* A partial unique index in the database. Even buggy code can't insert a second pending request.
- *Why is it one-way and not a trade?* A trade needs both people to have an unfinished chore. Someone who has finished everything, the best person to help, couldn't help.
- *What happens to the request if the chore is done or reassigned?* It's cancelled automatically.

---

## 9. Demo data (Task 6)

`npm run seed` ([server/seed.js](../server/seed.js)) wipes the database and creates **Flat 4B**:

| Login (password `password123`) | Who |
|---|---|
| `alex@example.com` | admin |
| `sam@example.com`, `jamie@example.com`, `robin@example.com` | members |
| `kim@example.com` | moved out, not in a household |

Every date is worked out **from today**, so the demo always shows the same situation: Alex has something overdue, a request to answer from Jamie, and is waiting on Sam; one chore belongs to Nobody; and the past two weeks have history (done, late, handed over).

**Tip for the demo:** run `npm run seed` just before presenting to start from a clean state.

**Say this:** "All data is synthetic, generated by a seed script with dates relative to today, so the demo always has overdue, pending and historical chores to show."

---

## 10. The browser side: basics (Task 7)

Everything in `public/` is sent to the browser as-is: HTML pages, our CSS, and our JavaScript. There's no framework, just plain JavaScript and the browser's built-in **DOM** (the page as JavaScript objects you can change).

**Modules.** Each JS file is a module: `<script type="module" src="/js/login.js">`. Files share code with `export` and `import`, e.g. `import { api } from './api.js'`. `public/js/dates.js` is even shared with the server.

**Talking to the server: `fetch` + `async`/`await`.** [public/js/api.js](../public/js/api.js) wraps `fetch`:
```js
const me = await api('POST', '/login', { email, password });
```
- `fetch` sends the request **without reloading the page**.
- `await` means "wait for the answer, then continue". The page stays responsive meanwhile.
- If the server answers with an error (400, 401, 409…), `api()` **throws** an `ApiError` containing the server's message and the `field` it's about. The page catches it with `try { … } catch (err) { … }`.
- If the server says 401 ("not logged in"), `api()` sends you to the login page.

**Reacting to the user: events.**
```js
form.addEventListener('submit', async (event) => {
  event.preventDefault(); // don't let the browser reload the page
  ...
});
```
`addEventListener` runs our function when something happens: `submit`, `click`, `change`. `event.preventDefault()` stops the browser's default action (submitting a form normally reloads the page), because we send the data with `fetch` instead.

**Building the page: the DOM.** [public/js/ui.js](../public/js/ui.js) `el()` is our one helper for creating elements:
```js
el('button', { class: 'primary', onclick: save }, 'Save')
// is the same as:
const b = document.createElement('button');
b.className = 'primary';
b.addEventListener('click', save);
b.append('Save');
```

**Feedback helpers** (also in `ui.js`):
- `showFieldError(form, 'password', 'Password must be…')`: red message under that input, and the input marked `aria-invalid`.
- `showFormError(form, 'Wrong email or password.')`: red box at the top of the form.
- `toast('Request sent to Jamie')`: a short notice in the corner that disappears after 4 seconds.
- `withBusy(button, fn)`: disables the button while the request runs, so double-clicks can't send twice.
- `confirmDialog('Remove Sam?', 'Remove')`: an "are you sure?" pop-up using the built-in `<dialog>` element.

### The login page, line by line ([public/js/login.js](../public/js/login.js))
1. Find the form, title, name field, buttons with `document.getElementById`.
2. `mode` is `'login'` or `'register'`. `showMode()` updates the title, button text, and shows or hides the name field (`nameField.hidden = …`). The same form does both jobs.
3. Clicking "Create an account" flips `mode` and calls `showMode()`.
4. On **submit**: `preventDefault()`, clear old errors, read the inputs, then `api('POST', '/login' or '/register', body)` inside `withBusy`.
5. Success → `location.href = '/'` (go to the chores page). Error → `handleError(err, form)` puts the message under the right field or at the top of the form.
6. When the page loads, it asks `GET /api/me`. If you're already logged in, it sends you straight to `/`.

**Say this:** "The browser never reloads to talk to the server. It uses fetch with async/await, catches errors, and shows the server's message next to the right input. The page is updated by creating and changing DOM elements in JavaScript."

**Likely questions**
- *Why `event.preventDefault()`?* A form submit normally reloads the page. We stop that and send the data with `fetch` instead.
- *What does `await` do?* It pauses this function until the server answers, without freezing the page.
- *Where are the validation rules?* On the server, so they can't be skipped. The browser just shows the messages.
- *How is it accessible?* Every input has a `<label>`. Errors are linked to their input with `aria-describedby` and announced with `role="alert"`. Buttons are real `<button>`s, so the keyboard works.

---

## 11. The Chores page: state → render (Task 8)

Files in [public/js/chores/](../public/js/chores/):

| File | Job |
|---|---|
| `state.js` | the `state` object (me, household, assignments, swaps, chosen view/filter/sort) and `loadAll()` |
| `main.js` | starts the page, holds the **actions** (what buttons do), calls `render()` |
| `cards-view.js` | draws one card per chore |
| `status.js`, `filters.js` | pure logic: which status text, which cards, in what order (tested) |
| `bits.js` | small shared pieces: avatar circle, status tag, "You"/"Nobody" label |
| `no-household.js` | the "You're not in a household yet" screen |

**The pattern: state → render.**
1. `loadAll()` fetches `/me`, then `/household`, `/assignments` and `/swaps` **at the same time** (`Promise.all`), and stores the answers in `state`.
2. `render()` reads `state` and **rebuilds** the cards with `el(...)` and `container.replaceChildren(...)`.
3. When you click a button, its **action** sends the request, shows a notice, then calls `refresh()` = `loadAll()` + `render()` again.

So the screen is always a fresh drawing of the latest data from the database. Nothing is patched by hand, so nothing can get out of sync.

**Dynamic DOM.** Cards are *created* in JavaScript (`el('article', …)`), *changed* (status tag, highlight for your own cards), and *removed* (`replaceChildren` throws away the old cards on every render). That covers the course's "create, modify and remove DOM elements" requirement.

**A chore card shows:**
- the title and a **status tag** (always text, e.g. "Overdue", "Waiting on Sam"; the colour is extra),
- who has the current turn and when it's due: "You · due Tue 20 Oct",
- who's next: "then Sam, Jamie",
- buttons, but only the ones *you* may use. Done ✓ appears only on your own unfinished chore.

The card's "current" turn is the **earliest unfinished** assignment of that chore (or the last finished one if all are done). That's why, after Done ✓, the Trash card moves on to Sam's next turn.

**Loading, empty and error states.**
- "Loading…" is shown until the first data arrives.
- "No chores yet" appears, with different advice for the admin and for members.
- "Nothing for you right now 🎉" appears when a filter matches nothing.
- If loading fails, the error is shown with a **Try again** button.

**Not in a household yet.** Kim sees a message with her email and a form to start her own household. Every 10 seconds the page asks `/api/me` again. As soon as an admin adds her, it switches to the chores by itself.

**Say this:** "The page keeps all data in one state object. After every action it reloads from the server and re-renders, so the interface always matches the database. Cards are created, updated and removed with DOM methods. The rules for what to show are pure functions with their own tests."

**Likely questions**
- *How does the page update without reloading?* The button's action sends a `fetch`, then we fetch fresh data and redraw just the cards.
- *Why reload all data instead of changing one card?* It's simpler and always correct. Other people's changes show up too.
- *Why does the Done button only appear on some cards?* The page only shows buttons you're allowed to use. The server checks again anyway (403 otherwise).

---

## 12. The swap flow in the browser + live updates (Task 9)

**This is the demo.** Two browsers side by side (a normal window as Alex, a private window as Jamie):
1. Alex clicks **Can't do it…** on his overdue Trash.
2. A **dialog** opens: "Who could take it?", with each roommate and how many chores they have this week. Alex picks Jamie, types "Sorry, exam on Tuesday!", and clicks **Send request**.
3. Alex's card now says **"Overdue · Waiting on Jamie"** and the Requests panel lists it. The chore is still Alex's.
4. Within 10 seconds, **Jamie's** screen shows "Alex asks you to take Take out trash" with the message, plus **Take it** / **No**.
5. Jamie clicks **Take it**. Within 10 seconds, Alex's card shows the chore as Jamie's.

**The dialog** ([swap-dialog.js](../public/js/chores/swap-dialog.js)) is the browser's built-in `<dialog>` element. It's opened with `showModal()`: the rest of the page is dimmed, keyboard focus stays inside, and Esc closes it. The roommates are radio buttons. Choosing one updates the note to "It stays yours until Jamie says yes." If the server refuses, the error appears **inside** the dialog and it stays open.

**The Requests panel** ([side-panel.js](../public/js/chores/side-panel.js)):
- On wide screens it's a column on the right, with requests for you (Take it / No) and the ones you sent (Cancel).
- On narrow screens (under 900px) the requests for you appear as a **banner** above the chores instead.
- One CSS `@media` rule switches between the two.

**Live updates: polling.** In [main.js](../public/js/chores/main.js), `setInterval(poll, 10000)` runs every 10 seconds:
1. Fetch all the data again.
2. Turn it into text (`JSON.stringify`) and compare it with last time.
3. **Redraw only if something changed and no dialog is open** (`shouldRender`). Otherwise a half-typed message would be wiped out by the redraw.

**When two people collide.** If Sam cancels a request at the moment Alex clicks Take it, the server answers 409 "This request is no longer available." (see §8). The page shows that message and redraws, so the stale request disappears.

**Say this:** "The page polls every 10 seconds and only re-renders when the data changed and no dialog is open, so the two browsers stay in sync without losing what someone is typing. Collisions are decided on the server, and the loser just sees a clear message."

**Likely questions**
- *How does Jamie's page know about the request?* It asks the server again every 10 seconds. If the answer differs from last time, it redraws.
- *Why not WebSockets?* Not allowed by the course's library rules, and polling is simple and fast enough for a household.
- *What if Jamie is typing when an update arrives?* The page doesn't redraw while a dialog is open, and catches up on the next tick.
- *Is the dialog accessible?* Yes. `<dialog>` with `showModal()` keeps focus inside, Esc closes it, the options are labelled radio buttons, and errors are announced.

---

## 13. Week view, filter, sort and progress (Task 10)

**Two views of the same data.** The **Week | Chores** switch at the top flips between:
- **Chores** ([cards-view.js](../public/js/chores/cards-view.js)): one card per chore, i.e. **grouped by chore**.
- **Week** ([week-view.js](../public/js/chores/week-view.js)): the fridge chart, a `<table>` with people down the side and Monday–Sunday across, i.e. **grouped by week**.

Switching doesn't contact the server. It calls the other render function on the data we already have. Your choice is remembered in `localStorage`.

**The fridge chart.**
- Your row comes first and is highlighted, then the other members.
- After them come people who have left (e.g. "Kim (left)"), but only in weeks where they had chores.
- Last is a "Nobody" row if a chore has no one.
- Today's column is yellow.
- Each chore is a coloured **chip**. Its colour comes from the status, and the text says it too: ✓ and crossed out for done, plus "late" or "via Jamie".
- Clicking a chip opens a dialog with the details and the same buttons as a card.
- **◀ ▶ changes week**, and that fetches the week's data with `GET /api/assignments?from=…&to=…`. **Past weeks are the history.**

**Interactivity the course asks for:**
- **Filtering** ("Show"): Everyone / Just me / Waiting on someone / Needs a new person (admin only).
- **Sorting** (Chores view): by due date or chore name.
- **Grouping**: by week or by chore (the switch).

The rules behind these are pure functions in [filters.js](../public/js/chores/filters.js) (`applyFilter`, `sortCards`, `weekRows`, `weekProgress`) with their own tests.

**This week so far.** A bar per person in the side panel (above the chart on phones): how many of their chores due this week are done, e.g. "1 / 2". It always shows *this* week, even while you look at another one, so the page fetches this week's assignments separately in that case.

**Say this:** "The same assignments can be drawn two ways: grouped by chore as cards, or by week as a table. Switching just re-renders from the data we already have. Filtering and sorting are pure functions with unit tests, and past weeks in the table are the household's history."

**Likely questions**
- *Where is the grouping?* The Week/Chores switch: by week (table) or by chore (cards).
- *Does switching view reload data?* No, it redraws from `state`. Only changing the week fetches.
- *Why a `<table>` for the week?* It *is* a table (people × days). A real `<table>` with header cells lets screen readers announce "Sam, Wednesday" for each cell.

---

## 14. Tests

`npm test` runs the files in `tests/` using Node's built-in test runner. Each test starts the real app on a random port with an empty in-memory database, sends real requests, and checks the answers. For example, "registering `Alex@Example.com` after `alex@example.com` gives 409".

We write each test **before** the code, watch it fail, then write the code until it passes. That way we know the test actually checks something.

**Say this:** "We have automated tests for the server: each one starts the app on a fresh database and checks a rule, like the duplicate-email check or the one-pending-swap rule."
