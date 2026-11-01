// app.js
import authRoutes from './routes/auth.routes.js';
import eventRoutes from './routes/event.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { parseAllowedOrigins } from './config/cors.js';

const app = express();

// On Render (and most hosts) requests reach us through ONE proxy. Trusting exactly one hop makes
// req.ip the real visitor's IP (from X-Forwarded-For), which the rate limiter needs. Trusting
// more than that would let clients fake their IP by sending their own X-Forwarded-For header.
app.set('trust proxy', 1);

// Security headers (e.g. stop browsers guessing content types, block the API inside iframes).
// The API is meant to be read by another origin (the frontend), so allow cross-origin reads.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Let the React app (a different origin) call this API from the browser.
// CLIENT_URL can list several origins separated by commas, e.g. the live site and a preview URL.
app.use(cors({ origin: parseAllowedOrigins(process.env.CLIENT_URL) }));

// Middleware for JSON body parsing
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes); // all event URLs start with /api/events
app.use('/api/bookings', bookingRoutes);
// Health check endpoint (also used by Render to check the service is up)
app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    db: isConnected ? 'connected' : 'disconnected',
  });
});

// Must come after all routes
app.use(notFound);
app.use(errorHandler);

export default app;
