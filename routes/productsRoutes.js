import express from "express";
import {
  getProducts,
  getProductById,
  getProductsCount,
  featuredProducts,
  searchProducts
} from "../controllers/productsController.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/count", getProductsCount);
router.get("/featured", featuredProducts);
router.get("/search", searchProducts); // must be BEFORE /:id
router.get("/:id", getProductById); // dynamic route ALWAYS LAST

export default router;
