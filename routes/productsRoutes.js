import express from "express";
import {
  getProducts,
  getProductById,
  getProductsCount,
  searchProducts,
  getProductHero,
  toggleFeaturedProduct,
  setDealOfTheDay,
  removeDeal,
  getFeaturedProducts,
  getDealsOfTheDay,
  addReview,
  
} from "../controllers/productsController.js";
import { protectAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/hero",getProductHero);
router.get("/deals", getDealsOfTheDay);
router.get("/featured", getFeaturedProducts);
router.get("/count", getProductsCount);
router.get("/search", searchProducts); 
router.patch("/admin/:id/featured", protectAdmin,toggleFeaturedProduct);
router.patch("/:id/featured", protectAdmin,toggleFeaturedProduct);
router.post("/:id/reviews", protectAdmin, addReview);
router.post("/admin/:id/deal", protectAdmin, setDealOfTheDay);
router.delete("/admin/:id/deal", protectAdmin, removeDeal);
router.get("/:id", getProductById); 


export default router;
