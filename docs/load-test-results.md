# Load Test Results

500 users fire seat-hold requests at the same moment against the real server (local) and database (Atlas M0 free tier). Run with `npm run loadtest`. Every scenario passed in every run: **no seat was ever given to two people, and no request errored.**

## Before vs after: fast-fail check (2026-11-01)

**The change:** before opening a transaction, the hold flow now does one quick read of the requested seats. If a seat is clearly taken (booked, or held and not expired), it answers 409 straight away.
**How it was measured:** both runs were back to back on the same machine and database. BEFORE = the same code with only the fast-fail `409` switched off.

| Scenario                               | Run    | Requests | 201 | 409 | p50       | p95       | Max       | Whole burst |
| -------------------------------------- | ------ | -------- | --- | --- | --------- | --------- | --------- | ----------- |
| **A:** 500 users, 1 free seat          | Before | 500      | 1   | 499 | 33.9 s    | 35.8 s    | 35.9 s    | 35.9 s      |
|                                        | After  | 500      | 1   | 499 | 33.9 s    | 35.8 s    | 35.9 s    | 36.0 s      |
| **B:** 500 users, 100 seats            | Before | 500      | 100 | 400 | 25.8 s    | 26.9 s    | 27.9 s    | 27.9 s      |
|                                        | After  | 500      | 99  | 401 | 25.9 s    | 27.9 s    | 27.9 s    | 28.0 s      |
| **C:** 500 users, 1 already-taken seat | Before | 500      | 0   | 500 | 16.9 s    | 19.0 s    | 19.0 s    | 19.0 s      |
|                                        | After  | 500      | 0   | 500 | **5.9 s** | **7.9 s** | **7.9 s** | **7.9 s**   |

(B picks random seats, so the number of different seats requested, and therefore the number of 201s, varies a little between runs.)

**Result:** C is **about 2.9× faster** (p50 16.9 s → 5.9 s). A and B are unchanged.

### Extra measurements (to find the real bottleneck)

| Measurement                                              | Result |
| -------------------------------------------------------- | ------ |
| Round-trip to Atlas (ping)                               | ~10 ms |
| One hold, no competition (full transaction)              | 82 ms  |
| One hold on an already-held seat (fast path)             | 25 ms  |
| 500 × `GET /api/health` at once (no database)            | 0.5 s  |
| 500 × `GET /api/events/:id` at once (2 reads, no writes) | 7.1 s  |

## What I learned

**Why were 500 holds on one seat so slow?** I expected three causes. The measurements showed how much each one mattered:

- **Write conflicts + retries: real, but not the main cost.** When transactions collide on the same seat, MongoDB rejects all but one and `withTransaction` retries the rest. That's why A (one seat) is about 8 s slower than B (100 seats). But B has little contention and still takes about 28 s.
- **Network round-trips to Atlas: small each time.** A ping is only about 10 ms. The cost comes from how many calls each request makes, not from each call being slow. A hold needs about 6 database calls: find the event, read the seats, then insert, update, save and commit inside the transaction.
- **Connection pool of 100: makes requests queue.** Only 100 database calls can be in progress at once, so the other 400 requests wait for a free connection.
- **The real bottleneck: how many database operations per second the free M0 cluster serves.** Even 500 read-only requests with no transactions took 7.1 s, which works out to roughly 140 operations per second. 500 holds × about 6 calls each, at that rate, comes to about 25–35 s, which matches the results almost exactly. The Node server isn't the limit: 500 requests that don't touch the database finish in 0.5 s.

**What the fast-fail check changed:** it saves work only when a seat is **visibly** taken before the request arrives (scenario C). Those requests now make 2 quick reads instead of a full transaction, so C dropped from 19.0 s to 7.9 s. In a perfectly simultaneous burst (A and B), all 500 quick reads happen before the winner commits, so every request sees "available" and the check can't help. In real traffic people don't all click in the same millisecond. A popular seat is gone within moments and most later clicks look like scenario C, so this is the case worth optimising.

**Why correctness never depended on it:** the quick read can be out of date by the time the update runs. A seat can be taken a millisecond after we read it. The real guarantee is still the **atomic conditional update inside the transaction**, which only claims a seat if it is still free at that exact moment. The BEFORE run proves it: with the check switched off, every scenario still passed. A unit test also feeds the hold flow an out-of-date read on purpose and checks the transaction still refuses the seat and rolls back.

**Next step if this needed to be faster:** a paid Atlas tier (higher throughput), or fewer database calls per hold.

<!-- latest-run:start -->

## Latest run (written automatically by `npm run loadtest`)

- **Date:** 2026-11-01 09:50:03 UTC
- **Setup:** local server + Atlas M0 free tier (16 CPU cores, Node v24.16.0)
- **Tool:** `npm run loadtest` (`server/loadtest/run.js`, plain Node `fetch`, all requests fired at once with `Promise.all`)

| Scenario                           | Requests | 201 | 409 | Other | Duration | p50      | p95      | Max      | Result  |
| ---------------------------------- | -------- | --- | --- | ----- | -------- | -------- | -------- | -------- | ------- |
| A: 500 users, 1 seat               | 500      | 1   | 499 | 0     | 35995 ms | 33864 ms | 35808 ms | 35888 ms | ✅ PASS |
| C: 500 users, 1 already-taken seat | 500      | 0   | 500 | 0     | 7948 ms  | 5871 ms  | 7880 ms  | 7904 ms  | ✅ PASS |
| B: 500 users, 100 seats            | 500      | 99  | 401 | 0     | 27972 ms | 25914 ms | 27863 ms | 27926 ms | ✅ PASS |

Latency is per request, measured from sending to receiving the full response. Duration is the whole burst, from the first request to the last response.

### A: 500 users, 1 seat

**What it proves:** when 500 people try to grab the same seat at the same instant, exactly one gets it and everyone else is told it's taken (409). Nobody gets an error, and the database agrees with the responses. This is the double-booking race condition at its worst, and the atomic conditional update plus the transaction prevent it.

- ✅ exactly 1 request got 201
- ✅ exactly 499 requests got 409
- ✅ no other responses (errors)
- ✅ seat A1 is held by the winner's booking
- ✅ only 1 booking exists in the DB

### B: 500 users, 100 seats

**What it proves:** with many seats wanted at once (99 different seats requested, some by several people), every requested seat goes to exactly one person. The number of winners equals the number of different seats asked for, so no seat was lost or given out twice, and each winner's booking points at exactly the seat they asked for.

- ✅ 201 count (99) == distinct seats requested (99)
- ✅ 409 count (401) == requests minus winners (401)
- ✅ no other responses (errors)
- ✅ no seat belongs to more than one booking
- ✅ every 201 booking owns exactly its requested seat
- ✅ held seats in DB (99) == bookings (99) == 201s

### C: 500 users, 1 already-taken seat

**What it proves:** when a seat is already gone and 500 people still try for it, every one of them is turned away (409) and the existing booking is untouched. Because the seat is visibly taken, the fast-fail check answers without opening a single transaction, which is why this burst is quick.

- ✅ seat A1 was already held when the burst started
- ✅ no request got 201
- ✅ all 500 requests got 409
- ✅ no other responses (errors)
- ✅ seat A1 still belongs to the same booking
- ✅ still only 1 booking in the DB

<!-- latest-run:end -->
