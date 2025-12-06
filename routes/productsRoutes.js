import express from "express";
import { getProducts, getProductById, addProduct, getProductsCount } from "../controllers/productsController.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/:id", getProductById);
router.get("/count", getProductsCount);
router.post("/", addProduct); // later protect this for admin

export default router;
