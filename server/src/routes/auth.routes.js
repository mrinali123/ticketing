import { Router } from 'express';
import { register, login, me, becomeOrganiserAccount } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

// authLimiter: at most 20 login/register attempts per 15 minutes per IP
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', requireAuth, me);
// A logged-in user upgrades their own account; responds with a new token
router.post('/become-organiser', requireAuth, becomeOrganiserAccount);

export default router;
