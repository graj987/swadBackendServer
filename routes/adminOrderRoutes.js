import express from "express";
import {
  adminGetAllOrders,
  adminUpdateOrderStatus,
  adminCancelOrder,
  adminSyncShiprocket,
  adminGenerateAWB,
  adminPrintLabel,
  adminTrackOrder
} from "../controllers/adminOrderController.js";

import { protectAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

// 🔐 Admin only
router.use(protectAdmin);    

router.get("/", adminGetAllOrders);
router.patch("/:orderId/status", adminUpdateOrderStatus);
router.post("/:orderId/cancel", adminCancelOrder);
router.post("/:orderId/sync-shiprocket", adminSyncShiprocket);
router.post("/:orderId/generate-awb", adminGenerateAWB);
router.get("/:orderId/print-label", adminPrintLabel);
router.get("/:orderId/track", adminTrackOrder);

export default router;
