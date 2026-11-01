import { Router } from "express";
import { create, list, getOne } from "../controllers/event.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Must be logged in (requireAuth) AND be an organiser (requireRole) to create events
router.post("/", requireAuth, requireRole("organiser"), create);
router.get("/", list); // public
router.get("/:id", getOne); // public

export default router;
