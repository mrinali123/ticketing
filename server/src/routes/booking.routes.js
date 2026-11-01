import { Router } from 'express';
import { hold, confirm, cancel, listMine, getOne } from '../controllers/booking.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Every booking route needs a logged-in user; owner checks happen in the service
router.use(requireAuth);

router.post('/hold', hold);
router.get('/me', listMine); // must come before "/:id", or "me" would be treated as an id
router.get('/:id', getOne);
router.post('/:id/confirm', confirm);
router.post('/:id/cancel', cancel);

export default router;
