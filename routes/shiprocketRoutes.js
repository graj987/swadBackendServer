import express from "express";
import { createShiprocketOrder, generateAWB, getTracking, shiprocketWebhook } from "../controllers/shiprocketController.js";
import { isAuthenticated } from "../middleware/auth.js";


const router = express.Router();
//here the route is "create-order" for now i write is wrong create-orde
router.post("/create-orde", isAuthenticated, createShiprocketOrder);
router.post("/awb", isAuthenticated, generateAWB);
router.get("/track/:awb", isAuthenticated, getTracking);

router.post("webhook", express.raw({ type: "application/json" }),shiprocketWebhook);

export default router;
