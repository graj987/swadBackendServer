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
router.post("/cart/add", isAuthenticated, addToCart);
router.get("/cart", isAuthenticated, getCart);
router.patch("/cart/update", isAuthenticated, updateCartItem);
router.delete("/cart/remove/:productId", isAuthenticated, removeCartItem);

/* ================= WISHLIST ================= */
router.get("/wishlist", isAuthenticated, getWishlist);
router.post("/wishlist/toggle", isAuthenticated, toggleWishlist);
router.post("/wishlist/move-to-cart", isAuthenticated, moveWishlistToCart);

/* ================= COUNTS ================= */
router.get("/counts", isAuthenticated, getCounts);

export default router;

