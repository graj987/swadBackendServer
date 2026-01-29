import express from "express";
import multer from "multer";
import {
  createBlog,
  getAllBlogsAdmin,
  getBlogById,
  updateBlog,
  togglePublish,
  deleteBlog,
} from "../controllers/blogController.js";
import { protectAdmin } from "../middleware/adminMiddleware.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const router = express.Router();

// ADMIN ONLY
router.post("/add", protectAdmin, upload.single("image"), createBlog);
router.get("/fetch", protectAdmin, getAllBlogsAdmin);
router.get("/:id", protectAdmin, getBlogById);
router.put("/:id", protectAdmin, updateBlog);
router.patch("/:id/publish", protectAdmin, togglePublish);
router.delete("/:id", protectAdmin, deleteBlog);

export default router;
