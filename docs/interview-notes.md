# Interview Notes

Short explanations of how the backend works, in plain English.

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
