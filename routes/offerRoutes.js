import express from "express";
import { createOffer, deleteOffer, getActiveOffers, getAllOffers, toggleOffer, updateOffer } from "../controllers/offerController.js";
import { protectAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/active", getActiveOffers);
// routes/offerRoutes.js
router.post("/", protectAdmin, createOffer);
router.get("/all", protectAdmin, getAllOffers);
router.put("/:id", protectAdmin, updateOffer);
router.patch("/:id/toggle", protectAdmin, toggleOffer);
router.delete("/:id", protectAdmin, deleteOffer);


export default router;
