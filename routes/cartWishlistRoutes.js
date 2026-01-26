import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import {
  addToCart,
  getCart,
  updateCartItem,
  removeCartItem,
  toggleWishlist,
  moveWishlistToCart,
  getWishlist,
  getCounts,
} from "../controllers/cartWishlistController.js";

const router = express.Router();

/* ================= CART ================= */
router.post("/add", isAuthenticated, addToCart);
router.get("/", isAuthenticated, getCart);
router.patch("/update", isAuthenticated, updateCartItem);
router.delete("/remove/:productId", isAuthenticated, removeCartItem);

/* ================= WISHLIST ================= */
router.get("/wishlist", isAuthenticated, getWishlist);
router.post("/wishlist/toggle", isAuthenticated, toggleWishlist);
router.post("/wishlist/move-to-cart", isAuthenticated, moveWishlistToCart);

/* ================= COUNTS ================= */
router.get("/counts", isAuthenticated, getCounts);

export default router;

