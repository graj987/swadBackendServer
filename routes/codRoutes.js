import express from "express";
import { checkCodEligibility } from "../controllers/codController.js";
import { isAuthenticated } from "../middleware/auth.js";

const router = express.Router();

router.get("/check", isAuthenticated, checkCodEligibility);

export default router;
