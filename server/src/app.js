// app.js
import authRoutes from './routes/auth.routes.js';
import eventRoutes from './routes/event.routes.js';
import express from 'express';
import mongoose from 'mongoose';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes); // all event URLs start with /api/events
// Health check endpoint
app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    db: isConnected ? 'connected' : 'disconnected',
  });
});

export default app;
