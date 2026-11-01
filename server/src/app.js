// app.js
import authRoutes from './routes/auth.routes.js';
import eventRoutes from './routes/event.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

const app = express();

// Let the React app (a different origin, e.g. localhost:5173) call this API from the browser.
// Only that one origin is allowed; other websites' scripts are still blocked by the browser.
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));

// Middleware for JSON body parsing
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes); // all event URLs start with /api/events
app.use('/api/bookings', bookingRoutes);
// Health check endpoint
app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    db: isConnected ? 'connected' : 'disconnected',
  });
});

export default app;
