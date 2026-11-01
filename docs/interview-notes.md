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
Transactions need a replica set, which is why the tests already use a single-node `MongoMemoryReplSet`.
