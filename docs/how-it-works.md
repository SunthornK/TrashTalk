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

## 10. Tests

`npm test` runs the files in `tests/` using Node's built-in test runner. Each test starts the real app on a random port with an empty in-memory database, sends real requests, and checks the answers. For example, "registering `Alex@Example.com` after `alex@example.com` gives 409".

We write each test **before** the code, watch it fail, then write the code until it passes. That way we know the test actually checks something.

**Say this:** "We have automated tests for the server: each one starts the app on a fresh database and checks a rule, like the duplicate-email check or the one-pending-swap rule."
