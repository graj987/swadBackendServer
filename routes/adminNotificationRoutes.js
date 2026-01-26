import express from "express";
import { protectAdmin } from "../middleware/adminMiddleware.js";
import { getAdminNotifications, markNotificationRead } from "../controllers/adminNotificationController.js";


const router = express.Router();

router.get("/", protectAdmin, getAdminNotifications);
router.put("/:id/read", protectAdmin, markNotificationRead);

export default router;
