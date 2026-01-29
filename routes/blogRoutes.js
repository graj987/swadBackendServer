import express from "express";
import {
  getLatestBlogs,
  getBlogBySlug,
} from "../controllers/blogController.js";

const router = express.Router();

// PUBLIC ROUTES (NO AUTH)
router.get("/latest", getLatestBlogs);
router.get("/:slug", getBlogBySlug);

export default router;
