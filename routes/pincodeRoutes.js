import express from "express";
import { lookupPincode } from "../controllers/pincodeController.js";

const router = express.Router();
router.get("/:pincode", lookupPincode);

export default router;
