# Decision log

What we decided, and why. This covers both the planning phase and every problem or judgement call during the build, so we can explain each choice at the presentation.

Full details are in the [design](superpowers/specs/2026-10-20-trashtalk-design.md) and the [build plan](superpowers/plans/2026-10-20-trashtalk.md). Each build task is a GitHub issue with the same number.

---

## Planning (20 Oct)

| Topic | Decision | Why | What we rejected |
|---|---|---|---|
| Swap model | **One-way handoff**: Sam takes my chore and gives nothing back | A trade only works if both people have an unfinished chore, so a roommate who has finished everything (the best person to help) couldn't help | Two-way trades |
| Who can accept | Any other member, whatever their workload | Limiting it would recreate the trade problem | Only people with fewer chores |
| Pending requests | Many requests per chore over time, **at most one pending**, enforced by a partial unique index in the DB | Simple rules; the database refuses a second pending request even if the JS has a bug | Several people asked at once |
| Two clicks at the same moment | Accepting uses conditional `UPDATE ... WHERE status = 'pending'` inside a transaction; the loser gets 409 | Whoever's action reaches the server first wins, and nothing is half-applied | Trusting the UI state |
| Creating assignments | Admin creates them by hand; the next due date is only *suggested* | Automatic recurring generation is extra work that the grading doesn't reward | Automatic rotation |
| Overdue | Calculated when assignments are read (`due_date < today`), never stored | It can never get out of date, and no background job is needed | A stored "overdue" status updated by a timer |
| `assignmentType` | Removed | Nothing in the app used it | — |
| Joining a household | Everyone registers themselves; the admin adds them **by email** | The register page is needed anyway, and the admin never knows anyone's password | Admin creates accounts; join codes |
| Admin leaving | **Make admin** transfers the role; the admin can't leave until they do | A household always has exactly one admin | Several admins |
| Removing / leaving | Unfinished chores become "Nobody", pending swaps are cancelled, completed history stays | History stays truthful, and the admin can reassign the "Nobody" chores | Deleting the person's data |
| Auth | Node's built-in `crypto.scrypt` + database sessions + an `HttpOnly`, `SameSite` cookie | The course only allows Express + a DB module; `bcrypt` / `express-session` may not count | bcrypt, express-session, cookie-parser |
| Database | SQLite via `better-sqlite3` | A real relational DB in one file, nothing to install for the demo | PostgreSQL (needs a server); `node:sqlite` (still experimental, prints warnings) |
| CSS | Pico.css + our own theme | Accessible, responsive defaults with no build step | Tailwind (Play CDN is a JS library, which breaks the rules; the CLI adds a build step) |
| Look | "Doodle frame, clean text": wobbly outlines, doodle font only for headings | Fun, but small text stays readable (accessibility is 15% of the grade) | Doodle font everywhere; sticky notes |
| Main screen | One **Chores** page with a **Week \| Chores** switch, plus a side panel on laptops | Both views come from the same data (that's our "grouping"), and a swap is visible the moment it happens | Tabs; a single dashboard (too confusing) |
| Admin UI | Admin actions sit on the Chores page itself (purple buttons); a small Household page handles setup | The first admin page tried to do five jobs and was hard to use | One big admin page |
| Live updates | Re-fetch every 10 seconds | Two browsers side by side show a request arrive, with only a few lines of code | WebSockets (not allowed, and too much) |
| Who builds it | Sunthorn + Claude in one track, with an "explain it back" checkpoint after each task | Both students are examined on all of the code | Splitting server / browser between two people |

---

## During the build

### Task 1: Project skeleton (#1)
- **Branch named `dev`.** Work happens on `dev` and is merged to `main` when it's ready. *Why:* `main` stays a working version. (Requested by Sunthorn; the branch was first created as `build` and renamed.)
- **`--env-file-if-exists` instead of `--env-file`.** *Problem:* `node --env-file=.env` crashes if there is no `.env` file, which is normal for a fresh clone. *Decision:* use the `-if-exists` variant (Node ≥ 22.9), so `.env` is optional and the defaults are used without it.
- **The "JSON only" check applies only when a request has a body.** *Problem:* `POST /api/logout` sends no body, and a strict check would reject it. *Decision:* reject with 415 only when a body is present and it isn't `application/json`.
- **Broken JSON returns 400 "Invalid JSON"**, not a 500. *Why:* it's the client's mistake, not a server crash.
- **Paths are resolved relative to the code files** (`import.meta.url`), not the current folder. *Why:* the server and the tests work no matter which folder you start them from.
- Installed versions: **express 5.3.0**, **better-sqlite3 12.11.1**.

### Task 2: Login and accounts (#2)
- **Same message for a wrong email and a wrong password** ("Wrong email or password."). *Why:* otherwise the login form tells anyone which emails have an account.
- **Emails are trimmed and lowercased before saving and before login.** *Problem:* `Alex@Example.com` and `alex@example.com` would otherwise be two different accounts. *Decision:* store lowercase, so duplicates are caught by the `UNIQUE` column and login works in any case.
- **The synchronous `scryptSync`** instead of the callback version. *Why:* simpler to read and explain. It pauses the server for a few milliseconds per login, which doesn't matter for a household app.
- **`timingSafeEqual` to compare hashes.** *Why:* a normal `===` stops at the first different character, so response times could leak information.
- **Names are limited to 50 characters.** *Not in the design; added* so a very long name can't break the layout. Easy to change.
- **Logout always succeeds** and clears the cookie, even if you weren't logged in. *Why:* the user's intent ("I'm out") is satisfied either way.
- **Commits no longer carry a "Co-Authored-By: Claude" line** (Sunthorn's request). The earlier commit on `main` still has one (see the note in chat).

### Task 3: Households and members (#3)
- **Someone in another household gets "404 Not found", not "403 Forbidden".** *Why:* a 403 would confirm that user number 7 exists somewhere. A 404 reveals nothing, and it's the same answer as for an ID that doesn't exist.
- **"Remove" and "Leave" are the same route** (`DELETE /api/household/members/:id`). Removing yourself = leaving. *Why:* the effects are identical (§5), so one piece of code is less to test and explain.
- **"Make admin" on yourself returns 400 "You're already the admin."** *Not in the design; added* because otherwise the transaction would make you admin and then demote you, leaving the household with no admin.
- **Leaving resets your role to `member`.** *Why:* if you later join another household, you shouldn't arrive as an admin.
- **Role changes take effect immediately.** *Why:* `loadUser` reads the user from the database on every request, so the role isn't cached in the cookie. After "Make admin", Alex's very next request is treated as a member's.
- **A household name is required, max 50 characters**, the same limit as names.
