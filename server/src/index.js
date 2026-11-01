// index.js
import 'dotenv/config';
import app from './app.js';
import connectDB from './config/db.js';
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
