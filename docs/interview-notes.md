# Interview Notes

Short explanations of how MySeat works, in plain English. Sections: the backend basics, bookings and concurrency, security in production, the frontend, testing and deployment, and finally questions I might be asked.

# Backend basics

## (a) Request flow: route → controller → service → model

A **route** matches the URL and method (e.g. `POST /api/events`) and runs any middleware, like "must be logged in".
The **controller** reads the request, checks the input, and decides which HTTP status to send back.
The **service** holds the business logic (e.g. "create the event, then create its seats") and knows nothing about HTTP.
The **model** is the Mongoose schema that talks to MongoDB and enforces data rules (required fields, min values).
Keeping these separate makes each piece small, easy to test, and easy to change without breaking the others.

## (b) How passwords are stored

We never store the real password, only a **bcrypt hash** of it (cost 10).
bcrypt adds a random **salt**, so two users with the same password get different hashes.
At login, `bcrypt.compare` hashes the typed password with the same salt and checks if it matches.
The hash field has `select: false` in the model, so it is never returned by normal queries.

## (c) How JWT login and the auth middleware work

On login, the server checks the password and then signs a **JWT** containing the user's id (`sub`) and `role`, using `JWT_SECRET`.
The client sends it back on later requests as `Authorization: Bearer <token>`.
The `requireAuth` middleware verifies the signature and expiry, then puts `{ id, role }` on `req.user` for the next handlers.
The server stores no session: the signed token itself proves who you are. It is signed, not encrypted, so it holds no secrets.

## Becoming an organiser: why the old token goes stale

A JWT is like a stamped ticket: once it's signed, nothing inside it can change. Our token contains the user's **role**.
So when a user switches to an organiser account, the database now says "organiser", but the token in their browser still says **"user"** until it expires. Organiser pages would keep answering 403.
The fix: the upgrade endpoint signs and returns a **new token** with the new role, and the app swaps it in straight away. A test checks that the new token can create events and the old one still can't.
Side effect: a second device still holds the old token, so it needs to log in again to see the change. The alternative is to look up the role in the database on every request: always up to date, but one extra query per request.

## (d) 401 vs 403

**401 Unauthorized** means "we don't know who you are": no token, a fake token, or an expired one.
**403 Forbidden** means "we know who you are, but you're not allowed": e.g. a normal user creating an event, or an organiser editing someone else's event.
Simple rule: fix a 401 by logging in; logging in again won't fix a 403.

## (e) How seats are generated

When an organiser creates an event with `rows` and `seatsPerRow`, the service loops over both.
Row numbers become letters with `String.fromCharCode(65 + r)` (65 is "A"), and seats are numbered from 1, giving labels like `A1`, `A2` … `E8`.
All seats are saved in one `insertMany` call, which is much faster than saving them one by one.
A unique index on `{ event, label }` makes it impossible to have two "A5" seats for the same event.

## (f) How pagination works

The client sends `page` and `limit`. The server skips `(page - 1) × limit` results and returns the next `limit`.
Values are cleaned first: page is at least 1, and limit defaults to 10 and is capped at 50, so nobody can request a million rows.
The list query and `countDocuments` run at the same time with `Promise.all`, and `total` lets the frontend work out how many pages there are.

## (g) Why we pick specific fields from req.body (mass assignment)

If we passed `req.body` straight to the database, a client could add fields we never meant to accept, like `"organiser": "<someone else>"` or `"status": "cancelled"`.
This is called a **mass assignment** attack.
So controllers copy only an allow-list of fields (e.g. title, venue, city…). For example, the `role` sent to register is ignored, so nobody can make themselves an organiser.

## (h) Known gap: event + seat creation isn't atomic

Creating an event is two separate writes: save the event, then save its seats.
If the second write fails (e.g. a network error), we are left with an event that has no seats.
A **MongoDB transaction** will fix this: both writes happen together, or neither does.
The booking system already uses transactions (see below), so the same `inTransaction` pattern can be applied to `createEvent`.
Transactions need a replica set, which is why the tests use a single-node `MongoMemoryReplSet`.

# Bookings & concurrency

## The double-booking problem

Booking works in two steps: first you **hold** seats (they're kept for you for 5 minutes), then you **confirm** (pay).
Popular events get many requests at the same moment, sometimes for the very same seat.
The one rule we must never break: **one seat, one buyer.** Two people must never both get seat A5.

## Why "read, then write" fails (race condition)

The obvious code is: (1) read seat A5, (2) if it's "available", (3) save it as "held".
But two requests can run at the same time. Both do step 1 before either does step 3:

```
Request X: read A5 → "available"
Request Y: read A5 → "available"     ← X hasn't saved yet
Request X: save A5 as held by X
Request Y: save A5 as held by Y      ← A5 sold twice!
```

The gap between reading and writing is the problem. This is called a **race condition**: the result depends on who happens to be faster.

## The fix: one atomic conditional update

We don't read first. We send MongoDB **one** command: "set A5 to held by me, **but only if** it's available (or its old hold has expired)."
That's `Seat.findOneAndUpdate` with the condition inside the filter. MongoDB does the check and the change together, as one step that nothing can interrupt.
If A5 is free, we get the seat back. If someone else got there first, the filter doesn't match, we get `null`, and we reply **409 "Seat A5 is no longer available"**.

**Proof (test):** 20 different users try to hold the same seat at exactly the same moment (`Promise.all`). Every run: exactly **1** gets 201, the other **19** get 409, the seat points to the winner's booking, and only 1 booking exists.

## Why holding several seats uses a transaction

Holding A1, A2, A3 is several writes: create the booking, then claim each seat one by one.
If A3 turns out to be taken, A1 and A2 must not stay held. Otherwise the user gets a broken half-booking and blocks seats for others.
So all of it runs inside a **MongoDB transaction** (`session.withTransaction()`). If anything fails, every write is undone: **all seats or none.**
Bonus: if two transactions clash on the same seat, `withTransaction` retries automatically, and the retry then sees the seat is taken.

## How hold expiry works (lazy check + cleanup job)

Every hold gets an expiry time (`HOLD_DURATION_SECONDS`, default 300 = 5 minutes).
**Lazy check:** we don't need anything to "wake up" when time runs out. The hold query treats an expired hold as free, and the event page shows it as "available". Confirming too late gives 409 "Hold expired".
**Cleanup job:** every 60 seconds, a small job marks old pending bookings as "expired" and resets their seats. This is only housekeeping; **if it stopped, booking would still be correct.**
Safety detail: confirm and cancel only touch seats still linked to **their own** booking, so a late user can never free a seat someone else has since taken.

## What the Idempotency-Key solves

Imagine you tap "Hold seats", the server creates the hold, but your Wi-Fi drops before the reply arrives. The app retries, and without protection you now have **two** bookings.
Fix: the app sends an `Idempotency-Key` header, which is a random ID made once per "tap". If the same user sends the same key again, the server returns the **original** booking (200) instead of creating a new one.
A unique database index on `{ user, idempotencyKey }` protects even the case where both copies arrive at the exact same moment.

## Load testing and the fast-fail optimisation (before → after)

I load-tested with 500 users at once against the real server and Atlas. It was always correct, but slow: about 34 s for a single seat. Measuring showed the free M0 database only handles about 140 operations per second, and each hold made about 6 database calls.
**The fix:** one quick read before the transaction. If the seat is clearly taken, return 409 immediately and skip the transaction.
**Result:** when 500 people try a seat that's already gone (the normal real-world case), it went from 19.0 s to 7.9 s, about 3× faster. In a perfectly simultaneous burst it can't help, because everyone's quick read happens before anyone wins.
It's only a shortcut: the seat can change right after the read, so the atomic update inside the transaction is still the real guarantee. With the shortcut switched off, every test still passed.

# Security in production

## Rate limiting

Login and sign-up allow **20 attempts per 15 minutes per IP**. That makes guessing passwords very slow and stops bots creating thousands of accounts.
Seat holds allow **30 per 5 minutes per user**, not per IP: a whole college Wi-Fi can share one IP, and one person spamming holds shouldn't block everyone else.
Going over the limit returns **429 Too Many Requests** with a clear message. Limits are switched off when `NODE_ENV=test` so the normal tests aren't throttled; one test turns them on to check they work.

## Why "trust proxy" matters

On Render, every request reaches our server through Render's proxy, so the connection always seems to come from the proxy's address.
`app.set('trust proxy', 1)` tells Express to read the real visitor's IP from the `X-Forwarded-For` header that the proxy adds. Without it, everyone would share one rate-limit counter.
It trusts exactly **one** proxy. Trusting more would let a visitor send their own fake `X-Forwarded-For` header and dodge the limit.

## CORS, helmet and error responses

**CORS:** browsers block a website from calling another site's API unless that API allows it. Ours only allows the addresses in `CLIENT_URL` (the Vercel site), so other websites' scripts can't use a visitor's browser to call it.
**helmet** adds standard security headers, e.g. telling browsers not to guess file types, and removes `X-Powered-By` so we don't advertise that we use Express.
**Errors:** in production, any unexpected error returns only "Something went wrong". Stack traces and internal messages go to the server log, never to the user, because they reveal file names and code paths that help an attacker.

# The frontend

## How the React app talks to the API

All requests go through one small wrapper, `api/client.js`. It adds the token, sends and parses JSON, and turns failed responses into an error with the status and the backend's message.
If a request that **had** a token gets a 401, the session is no longer valid (expired or tampered with), so it logs out and goes to the login page. A 401 **without** a token, like a wrong password, is just shown on the form.
Every page loads data through one `useFetch` hook. It remembers which request each answer belongs to, so a slow old answer can never overwrite a newer one.

## Login state, and why localStorage is a trade-off

After login, the token and user are saved in `localStorage`, so you stay logged in after a reload. On startup the app checks the token is still valid with `/api/auth/me`.
The downside: any JavaScript on the page can read `localStorage`, so one XSS bug could leak the token. An **httpOnly cookie** can't be read by scripts at all, which is safer, but it needs CSRF protection. For a learning project, localStorage keeps things simple.
Route guards hide pages from logged-out users or non-organisers, but they're only for convenience: **the backend checks permissions on every request.**

## The seat map

The seat map asks the server for the latest seats every 5 seconds (paused when the tab is hidden), so other people's holds appear. If someone takes a seat you'd selected, it's unselected with a message.
Each "Hold seats" click gets a new `Idempotency-Key`. If the request fails with **no answer at all** (network error), the same key is kept, so pressing the button again can't create a second booking.
Polling is simpler than websockets but up to 5 seconds behind. That's fine because the map is only a hint: the server decides who actually gets each seat.

## Never a blank screen

Every page has its own loading, empty and error states, with a "Try again" button where it makes sense.
An **error boundary** catches any crash while drawing a page and shows "Something broke on this page" instead of a white screen.
On the free hosting, if the first request takes over 5 seconds, the events page explains that the server is waking up.

# Testing and deployment

## How the tests work

The tests use **Vitest** and **Supertest**: Supertest sends real HTTP requests to the Express app without starting a server.
Each test file gets its own **in-memory MongoDB** (`mongodb-memory-server`), and every collection is emptied after each test, so tests can't affect each other and never touch the real database.
It's a single-node **replica set**, not a plain server, because MongoDB transactions only work on replica sets.

## How it's deployed

The React app is built into static files and served by **Vercel**. A rewrite rule sends every path to `index.html`, so refreshing `/events/123` still works.
The API runs on **Render** and the data lives in **MongoDB Atlas**. Secrets like the database password and JWT secret are environment variables on Render, never in the code.
**GitHub Actions** runs lint, tests and the client build on every push, so a broken change shows up before it's deployed.

# Questions I might be asked

**1. How do you stop two people booking the same seat?**
Each seat is claimed with one atomic `findOneAndUpdate` that only matches if the seat is still free. MongoDB checks and updates in one step, so only one request can win; the rest get `null` and a 409. A test with 20 simultaneous users proves exactly one wins.

**2. Why not just check if the seat is free and then save it?**
Because two requests can both check before either saves; both see "free" and both save. That gap is a race condition. Putting the check inside the update removes the gap.

**3. Why do you need a transaction if each seat update is already atomic?**
Each single seat is safe, but a booking claims several seats. Without a transaction, if seat 3 fails, seats 1 and 2 stay held. The transaction undoes everything, so it's all seats or none.

**4. What happens when a hold expires? Do you run a timer?**
No timer. Each hold stores an expiry time, and the hold query treats an expired hold as free. A cleanup job every 60 seconds just tidies the database; booking stays correct even if it never runs.

**5. What is an idempotency key and why use one?**
It's a random ID the app sends with a request. If the network drops and the app retries with the same key, the server returns the first booking instead of making a new one. A unique index handles two copies arriving at the same time.

**6. What's the difference between 401 and 403?**
401: we don't know who you are (no token, invalid or expired token). 403: we know who you are, but you're not allowed (e.g. a normal user creating an event).

**7. How are passwords stored?**
As bcrypt hashes with a random salt, never as plain text. Login compares the typed password against the hash. The hash is excluded from query results by default.

**8. Your load test was slow. Why, and what did you do?**
500 holds took about 34 seconds. I measured each layer: Node handled 500 requests in 0.5 s, but the free database managed only about 140 operations per second, so it was the bottleneck. I added a quick check that rejects clearly taken seats before opening a transaction, which made the "seat already gone" case about 3× faster.

**9. Why rate-limit holds per user but logins per IP?**
Logins happen before we know who you are, so IP is all we have. Holds need a login, so we can count per user, which is fairer when many people share one IP, like a college network.

**10. What would you change for a real production launch?**
Real payments confirmed by a webhook, httpOnly cookies instead of localStorage, websockets for live seat updates, a shared rate-limit store like Redis, wrapping event creation in a transaction, and a paid database tier for more throughput.
