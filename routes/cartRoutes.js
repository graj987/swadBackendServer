import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import {
  addToCart,
  getCartCount,
} from "../controllers/cartController.js";

const router = express.Router();

router.post("/add", isAuthenticated, addToCart);
router.get("/count", isAuthenticated, getCartCount);

export default router;
