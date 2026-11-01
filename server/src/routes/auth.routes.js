import { Router } from 'express';
import { register, login, me } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

// authLimiter: at most 20 login/register attempts per 15 minutes per IP
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', requireAuth, me);

export default router;
