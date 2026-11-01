import { Router } from 'express';
import {
  create,
  list,
  listCities,
  listMine,
  getOne,
  update,
  cancel,
} from '../controllers/event.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Must be logged in (requireAuth) AND be an organiser (requireRole) to create events
router.post('/', requireAuth, requireRole('organiser'), create);
router.get('/', list); // public
router.get('/cities', listCities); // public, for the city filter
// Must come before "/:id", or "mine" would be treated as an event id
router.get('/mine', requireAuth, requireRole('organiser'), listMine);
router.get('/:id', getOne); // public

// Organiser only; the service also checks they own this particular event
router.patch('/:id', requireAuth, requireRole('organiser'), update);
router.post('/:id/cancel', requireAuth, requireRole('organiser'), cancel);

export default router;
