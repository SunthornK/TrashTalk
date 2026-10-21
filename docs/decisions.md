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

### Task 4: Chores and assignments (#4)
- **Archiving a chore deletes its unfinished assignments *and their swap requests*.** *Problem:* the design said "cancel their pending swaps", but a swap request row points at its assignment (a foreign key), so the database refuses to delete an assignment that still has requests. *Decision:* delete those requests too. They belonged to chores that no longer exist, and completed history is untouched.
- **Dates are parsed as local time, never with `new Date('2026-10-20')`.** *Problem:* JavaScript reads `'2026-10-20'` as midnight **UTC**, which is still the 19th in some time zones, so a chore could show on the wrong day. *Decision:* split the string into numbers and build a local date.
- **"Was late" compares the local date of `completed_at` with the due date.** *Why:* `completed_at` is a full timestamp in UTC, so cutting it to 10 characters could give yesterday's date late in the evening.
- **Adding a month clamps to the month's last day** (31 Jan + 1 month = 28 Feb, not 3 Mar).
- **New file `server/validate.js`** (not in the plan): the shared checks (text, frequency, date, "is this person in your household?") live in one place, so every route gives the same error messages.
- **Assigning to an archived chore → 409 "This chore is archived."**, and **marking a chore done twice → 409**.

### Task 5: Swap requests (#5)
- **The "one pending request" rule is enforced by the database, and we turn its refusal into a friendly message.** *Problem:* checking "is there already a pending request?" in JavaScript before inserting leaves a tiny gap where two requests could both pass the check. *Decision:* just try the INSERT. If the unique index refuses it, answer 409 "This chore already has a pending request." The check for that error lives in `db.js` (`isUniqueViolation`), because each database driver reports it differently.
- **Accept, reject and cancel all use `UPDATE ... WHERE status = 'pending'`** and look at how many rows changed. *Why:* checking first and updating after leaves a gap where another click can sneak in. A single conditional UPDATE can't be interrupted. 0 rows changed → 409 "This request is no longer available."
- **Accept also checks the chore is still the requester's and unfinished**, inside the same transaction. If not, both changes are rolled back, so the request stays exactly as it was instead of being half-accepted.
- **A household member who isn't part of a swap gets 404** (same as another household). *Why:* only the requester and the person asked have any business with it.
- **An empty message is stored as nothing (`NULL`)**, so the browser can simply check "is there a message?".

### Task 6: Demo data (#6)
- **All demo dates are calculated from today** (e.g. "Alex's Trash was due yesterday"). *Why:* fixed dates would go stale. On presentation day there would be nothing "this week" and everything would be overdue.
- **Seeding wipes everything first**, inside one transaction. *Why:* you can re-run `npm run seed` right before the demo to get a clean, predictable state, and running it twice doesn't create duplicates.
- **What the demo contains**, so every screen has something to show: Alex's overdue Trash; Jamie asking Alex to take Vacuum (with a message); Alex waiting on Sam for Bathroom; a "Nobody" chore (Mop kitchen, since Kim moved out); finished, late and handed-over chores in the past two weeks; Kim's old chores; an archived chore (Water plants) to restore; and two chores next week.
- **Demo logins (Task 6):** `alex@example.com` (admin), `sam@`, `jamie@`, `robin@`, `kim@` (no household), all with password `password123`. Fine for synthetic demo data only.

### Task 7: Login page and browser foundation (#7)
- **Pico.css and the doodle font are stored in the project** (`public/vendor/`, `public/fonts/`), not loaded from the internet. *Why:* the demo must work even if the room's Wi-Fi is bad. (Pico is MIT licensed; Gloria Hallelujah is under the SIL Open Font License, both free to include.)
- **Our colours didn't apply at first.** *Problem:* Pico defines its light-theme colours with a more specific CSS selector than our `:root`, so Pico's won (the yellow button had white text and the "Create an account" link was white on white). *Decision:* use the exact same selector as Pico. Since our file loads after Pico's, ours now wins.
- **The page always uses the light theme** (`data-theme="light"`). *Why:* the doodle look is ink on white paper; an automatic dark mode would break it.
- **Form errors appear inside the form, not as pop-ups.** *Problem:* "Wrong email or password." first showed as a toast that disappears after 4 seconds, which is easy to miss. *Decision:* errors about one field appear under that field; other form errors appear in a red box at the top of the form (`role="alert"`, so screen readers announce it). Toasts are kept for actions that aren't in a form.
- **The login page doesn't redirect to itself.** *Problem:* `api()` sends you to the login page when the server says "not logged in" (401). On the login page that would reload forever. *Decision:* skip the redirect when you're already on the login page.
- **The form has `novalidate`**, so the browser's own pop-up bubbles don't appear and every error message comes from our server in our style. The server checks everything anyway.
- **Buttons are disabled while their request runs** (`withBusy`). *Why:* a double-click can't create two accounts or send two requests.
- **A trash-can emoji as the tab icon**, written directly in the HTML (no image file), which also stops a "favicon not found" error in the console.

### Task 8: Chores page, cards view (#8)
- **"State → render" instead of editing cards one by one.** *Why:* after every action we reload the data from the server and redraw from it, so the page can never drift away from what's in the database. Simple to reason about and to explain.
- **The decision logic is in separate files with no page code** (`status.js`, `filters.js`). *Why:* they can be tested automatically like the server, and the page files only draw.
- **After "Done ✓", the card moves on to the next turn** (e.g. Trash now shows "Sam · due Tue 27 Oct"). *Why:* a chore card is about what's happening *now* and next; the finished one is still visible in the history (week view, Task 10).
- **The "Show" filter looks at each card's current assignment**; "Everyone" also shows chores nobody is assigned to yet. *Not spelled out in the design*: a card matches "Just me" if *its current turn* is mine.
- **Two new small files** (not in the plan): `bits.js` (avatar circle, status tag, "You"/"Kim (left)" label, shared by cards, week view and side panel) and `no-household.js` (the "not in a household yet" screen), to keep `main.js` short.
- **The three requests that load the page run at the same time** (`Promise.all`), so the page appears faster than asking one after another.
- **Pico's grey "secondary" buttons were restyled** to our white-with-ink look (same selector problem as Task 7).
- **Verified in a browser:** cards and tags for Alex match the demo data; Done ✓ shows a notice and the card updates without reloading; Kim sees "You're not in a household yet", and when Alex added her, her page switched to the chores by itself within 10 seconds.

### Task 9: The swap flow in the browser (#9)
- **Live updates by asking every 10 seconds** ("polling") instead of the server pushing. *Why:* it's plain `fetch` + `setInterval`, a few lines, nothing extra to install or explain. Ten seconds is quick enough for a household.
- **The refresh never redraws while a dialog is open, or when nothing changed.** *Problem:* redrawing replaces the page's elements, so a message half-typed in the "Who could take it?" dialog would vanish. *Decision:* compare the new data with the last data (as text) and check for an open `<dialog>`; only redraw if it changed *and* no dialog is open (`shouldRender`, tested). Verified: typed text survived a refresh while Jamie cancelled a request in the background.
- **One refresh loop for the whole page**, including the "not in a household yet" screen (replaces the separate timer from Task 8).
- **Dialogs show their own errors and stay open** (`openFormDialog` in `ui.js`, reused by the admin dialogs later). *Why:* if the server refuses (e.g. message too long), the person can fix it without starting over. Sending without choosing a roommate shows "Choose who you want to ask." right in the dialog.
- **The banner showed on laptops too.** *Problem:* the CSS rule that hides the banner on wide screens came *before* the rule that styles it, so the later one won and the request appeared twice. *Decision:* make the hide rules more specific (`.page #banner`).
- **More Pico specificity fixes** (dialog buttons were full width, roommate options didn't stretch).
- **A request someone already cancelled** shows the server's message "This request is no longer available." and disappears. Verified by having Sam cancel while Alex clicked "Take it".
- **"Chores this week" next to each roommate** in the dialog counts their unfinished chores due Monday–Sunday, to help pick someone fair.

### Task 10: Week view, controls, progress bars (#10)
- **Switching Week ↔ Chores doesn't ask the server for anything**; it just runs the other drawing function on data already loaded. *Why:* it's instant, and it's exactly the "grouping" from the proposal (by week vs by chore). Changing the *week* (◀ ▶) does fetch, because that week's data isn't loaded yet.
- **The page now loads three sets of assignments**: the unfinished ones (cards), the week being shown (chart), and this week (progress bars). *Why:* the progress bars must always show *this* week even while you browse an old week. When you're looking at this week, the same data is reused instead of fetched twice.
- **The controls are written in the HTML and connected once**, not rebuilt on every redraw. *Why:* rebuilding them every 10 seconds would close an open dropdown or move keyboard focus.
- **With a filter on, empty rows are hidden** in the week chart ("Just me" shows only your row).
- **The week table was too wide at first.** *Problem:* Pico makes the base font bigger on large screens, so a "minimum 44rem" table became 880px, wider than the space. *Decision:* only give the table a minimum width on narrow screens, where it scrolls sideways inside its own box.
- **Clicking a chip opens a details dialog with the same buttons as a card.** The buttons were moved into `bits.js` (`assignmentButtons`) so the card and the dialog share one copy.
- **The "View" switch remembers your choice** (`localStorage`), wrapped in try/catch so the page still works if the browser blocks storage. The filter and sort reset on reload on purpose.
- **The "Needs a new person" filter is only offered to the admin.**
- **Verified in a browser:** this week and last week (history with "late", "via Jamie", "Kim (left)"), Done ✓ from a chip updated the chip and the progress bar together, filter, sort, remembered view, and phone layout.

### Task 11: Admin actions on the Chores page (#11)
- **"+ Assign next" pre-fills the next person and date** (`suggestNext`, tested): the person after the last one who had the chore, in member order, wrapping round; due on the last due date + the chore's frequency. If the last one was "Nobody" or someone who left, it starts again with the first member. The admin can change both before saving.
- **Admin buttons are purple and only drawn for the admin**, but this is only convenience. The server's `requireAdmin` is the real protection (members get 403, tested in Task 4).
- **Overdue and "Nobody" chores get a red outline and "Reassign…"** for the admin, on the cards, in the week view's details dialog, and in the "Needs a new person" panel.
- **The "+ New chore" card only shows with the "Everyone" filter.** *Why:* under "Just me" it would look like a chore of yours.
- **A bug caught before it showed:** `replaceChildren(a, b, false)` would print the word "false" on the page for members (where the admin section is `false`). Fixed by filtering out empty sections.
- **Style fixes:** the tag inside a doodle heading picked up the doodle font; admin dialog buttons were yellow because "submit buttons are yellow" won. Both fixed.
- **Verified in a browser:** Assign next on Groceries suggested Alex (after Robin) on 1 Nov and created it; Reassign moved Mop kitchen from Nobody to Sam; New chore with an empty name showed the error in the dialog, then created "Water the plants"; Sam (member) saw none of the admin controls.

### Task 12: Household page (#12)
- **Two tabs, built the accessible way** (`role="tablist"`/`"tab"`/`"tabpanel"`, `aria-selected`, arrow keys move between tabs, only the selected tab is in the Tab order). *Why:* screen readers announce them as tabs, and the keyboard works like in desktop apps.
- **The top bar moved into a shared file** (`public/js/topbar.js`), used by both pages, instead of a copy in each.
- **"Leave" as the admin asks the server anyway** instead of hiding the button. *Why:* the rule lives in one place (the server), and the admin sees exactly why: "Make someone else admin first." Members get an "Are you sure?" first.
- **Every destructive action asks first** (Remove, Make admin, Leave, Archive), with a sentence saying what will happen ("Their unfinished chores will need a new person.").
- **Chores are edited in place** (the row turns into a small form), and archived chores are listed last, greyed out, with Restore.
- **Errors in one-line forms appeared in the middle of the line.** *Problem:* the message was inserted right after the input, pushing the Add button onto its own line. *Decision:* in a one-line form, put the message under the whole line (change in `ui.js`, so all forms benefit).
- **Verified in a browser:** unknown email → field error; `KIM@example.com` added Kim; admin Leave → "Make someone else admin first."; arrow key switched tabs; Archive (with confirm), Restore, and Edit with an empty name; Make Sam admin → Alex's admin controls disappeared; Alex then left → "not in a household yet", and his unfinished chores became Nobody.
