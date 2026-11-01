// index.js
import 'dotenv/config';
import app from './app.js';
import connectDB from './config/db.js';
import { findMissingEnv } from './config/env.js';
import { expireHolds } from './jobs/expireHolds.js';

const PORT = process.env.PORT || 5000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

// Runs the expired-hold cleanup and logs only when it actually changed something
const runCleanup = async () => {
  try {
    const { bookingsExpired, seatsReleased } = await expireHolds();
    if (bookingsExpired || seatsReleased) {
      console.log(
        `Cleanup: ${bookingsExpired} booking(s) expired, ${seatsReleased} seat(s) released`,
      );
    }
  } catch (err) {
    console.error('Cleanup job failed:', err.message);
  }
};

const startServer = async () => {
  // Fail fast: without these the server would start "fine" and then break later in confusing
  // ways (e.g. every login answering 500 when JWT_SECRET is missing). Better to stop right away
  // with a message that says exactly what to fix. (Tests import app.js, not this file, so this
  // never runs during npm test.)
  const missing = findMissingEnv();
  if (missing.length > 0) {
    console.error(
      `Missing required environment variable(s): ${missing.join(', ')}\n` +
        'Add them to server/.env locally (see .env.example), or to the Environment settings on your host.',
    );
    process.exit(1);
  }

  await connectDB();

  // Housekeeping only; booking stays correct even if this never runs (see jobs/expireHolds.js)
  if (process.env.NODE_ENV !== 'test') {
    setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  }

  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
};

startServer();
