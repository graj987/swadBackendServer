import express from "express";
import { getProducts, getProductById, getProductsCount, featuredProducts, searchProducts } from "../controllers/productsController.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/:id", getProductById);
router.get("/count", getProductsCount);
router.get("/featured", featuredProducts);
router.get("/search", searchProducts);

export default router;
