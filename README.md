# Ticketing

An event ticketing system built with the MERN stack: organisers publish events with a seat map, and users browse events and (soon) book seats.

## Features (done so far)

- **Auth**: register, login with JWT, `GET /me` for the current user
- **Roles**: `user` and `organiser`, enforced by middleware
- **Events**: organisers create events; a seat map (rows A, B, C… × seats per row) is generated automatically
- **Browsing**: public list of upcoming events with pagination and city filter; event details with seats
- **Event management**: the owning organiser can update details or cancel an event (which also cancels its active bookings)
- **Booking model**: ready for the booking flow, with an idempotency-key index to block duplicate bookings
- **Tests**: 41 integration tests against an in-memory MongoDB

## Tech stack

| Layer    | Tools                                         |
| -------- | --------------------------------------------- |
| Backend  | Node.js 20+, Express 5, ES modules            |
| Database | MongoDB (Atlas) with Mongoose                 |
| Auth     | bcrypt (password hashing), jsonwebtoken (JWT) |
| Testing  | Vitest, Supertest, mongodb-memory-server      |
| Tooling  | ESLint (flat config), Prettier, nodemon       |
| Frontend | React (planned, lives in `client/`)           |

## Folder structure

```
ticketing/
├── client/                 # React frontend (coming later)
├── docs/                   # Notes, e.g. interview-notes.md
├── requests/               # VS Code REST Client files (auth.http, events.http)
└── server/
    ├── scripts/            # seed.js, test-expired-token.js
    ├── tests/              # Vitest setup, helpers and test files
    └── src/
        ├── app.js          # Express app: middleware + routes (no DB connection)
        ├── index.js        # Entry point: loads .env, connects to DB, starts server
        ├── config/         # db.js (MongoDB connection)
        ├── routes/         # URL → middleware → controller
        ├── controllers/    # Read the request, validate input, send the response
        ├── services/       # Business logic and database work
        ├── models/         # Mongoose schemas: User, Event, Seat, Booking
        ├── middleware/     # requireAuth, requireRole
        ├── validators/     # (planned)
        └── errors/         # (planned)
```

## Running locally

**Requirements:** Node.js 20+, npm, and a MongoDB connection string (e.g. a free MongoDB Atlas cluster).

1. **Install dependencies**

   ```bash
   cd server
   npm install
   ```

2. **Set environment variables**: copy `server/.env.example` to `server/.env` and fill it in:

   | Variable         | Example                               | Purpose                      |
   | ---------------- | ------------------------------------- | ---------------------------- |
   | `MONGO_URI`      | `mongodb://localhost:27017/ticketing` | MongoDB connection string    |
   | `JWT_SECRET`     | a long random string                  | Signs and verifies JWTs      |
   | `JWT_EXPIRES_IN` | `1d`                                  | How long a login token lasts |
   | `PORT`           | `5000`                                | Port the API listens on      |
   | `NODE_ENV`       | `development`                         | Environment name             |

3. **Seed sample data** (⚠️ deletes existing users, events, seats and bookings first)

   ```bash
   npm run seed
   ```

   Creates 3 organisers (`asha@`, `ravi@`, `meera@example.com`), 5 users, 10 events and 1000 seats. Every account's password is `Password123!`.

4. **Start the dev server** (restarts on file changes)

   ```bash
   npm run dev
   ```

   The API runs at `http://localhost:5000`. Check `GET /api/health`.

5. **Run the tests** (use an in-memory database, never your real one)

   ```bash
   npm test            # run once
   npm run test:watch  # re-run on changes
   ```

Other scripts: `npm run lint`, `npm run format`, `npm run test:expiry` (manual JWT expiry check against the running server).

To try the API by hand, open `requests/auth.http` or `requests/events.http` with the VS Code **REST Client** extension.

## API endpoints

| Method | Path                     | Auth required          | Description                                                             |
| ------ | ------------------------ | ---------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/health`            | No                     | Server status and database connection state                             |
| POST   | `/api/auth/register`     | No                     | Create a user account (role is always `user`)                           |
| POST   | `/api/auth/login`        | No                     | Log in; returns a JWT and the user                                      |
| GET    | `/api/auth/me`           | Yes                    | Get the logged-in user                                                  |
| GET    | `/api/events`            | No                     | List upcoming scheduled events. Query: `page`, `limit` (max 50), `city` |
| GET    | `/api/events/:id`        | No                     | Get one event with its seats                                            |
| POST   | `/api/events`            | Yes (organiser)        | Create an event and generate its seats                                  |
| PATCH  | `/api/events/:id`        | Yes (owning organiser) | Update title, venue, city, startTime or pricePaise                      |
| POST   | `/api/events/:id/cancel` | Yes (owning organiser) | Cancel the event and its pending/confirmed bookings                     |

Send the token as `Authorization: Bearer <token>`. Prices are stored in paise (₹1 = 100 paise).

## Roadmap

- **Seat hold & booking with concurrency safety**: temporarily hold seats, then confirm, so two people can never book the same seat
- **Payment simulation**: fake payment step that confirms or releases held seats
- **React frontend**: browse events, pick seats on a seat map, view bookings
- **Deployment**: host the API and frontend, connected to MongoDB Atlas
