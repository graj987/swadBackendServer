import express from "express";
import multer from "multer";
import {
  createBlog,
  updateBlog,
  deleteBlog,
  togglePublish,
  getAllBlogsAdmin,
  getBlogBySlug,
  getBlogById,
  getLatestBlogs,
  searchBlogs,
  getRelatedBlogs,
  getBlogCategories,
  getPopularTags,
  exportBlogAsJSON,
} from "../controllers/blogController.js";

import protectAdmin from "../middleware/adminMiddleware.js";

const router = express.Router();

/**
 * Configure Multer for file uploads
 */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

/**
 * =====================
 * ADMIN ROUTES
 * =====================
 */

/**
 * POST /api/admin/blogs/create
 * Create a new blog with structured content blocks
 * Requires: title, excerpt, category, contentBlocks, metaTitle, metaDescription, focusKeyword
 */
router.post(
  "/admin/blogs/create",
protectAdmin,
  upload.any(), // Handles multiple file uploads
  createBlog
);

/**
 * PUT /api/admin/blogs/:id
 * Update an existing blog
 */
router.put(
  "/admin/blogs/:id",
  protectAdmin,
  upload.any(),
  updateBlog
);

/**
 * DELETE /api/admin/blogs/:id
 * Delete a blog and its images
 */
router.delete(
  "/admin/blogs/:id",
protectAdmin,
  deleteBlog
);

/**
 * PATCH /api/admin/blogs/:id/toggle-publish
 * Toggle publish status of a blog
 */
router.patch(
  "/admin/blogs/:id/toggle-publish",
protectAdmin,
  togglePublish
);

/**
 * GET /api/admin/blogs
 * Get all blogs (with pagination, search, filters)
 * Query params: page, limit, search, status, category
 */
router.get("/admin/blogs", protectAdmin, getAllBlogsAdmin);

/**
 * GET /api/admin/blogs/:id
 * Get single blog by ID for editing
 */
router.get("/admin/blogs/:id", protectAdmin, getBlogById);

/**
 * GET /api/admin/blogs/:id/export
 * Export blog as JSON for backup
 */
router.get(
  "/admin/blogs/:id/export",
protectAdmin,
  exportBlogAsJSON
);

/**
 * =====================
 * PUBLIC ROUTES
 * =====================
 */

/**
 * GET /api/blogs/latest
 * Get latest published blogs
 * Query params: limit (default: 4)
 */
router.get("/blogs/latest", getLatestBlogs);

/**
 * GET /api/blogs/search
 * Search blogs by keyword, category, tags
 * Query params: q, category, tags, limit, page
 */
router.get("/blogs/search", searchBlogs);

/**
 * GET /api/blogs/categories
 * Get list of all categories
 */
router.get("/blogs/categories", getBlogCategories);

/**
 * GET /api/blogs/tags/popular
 * Get popular tags
 * Query params: limit (default: 10)
 */
router.get("/blogs/tags/popular", getPopularTags);

/**
 * GET /api/blogs/:slug
 * Get single published blog by slug
 */
router.get("/blogs/:slug", getBlogBySlug);

/**
 * GET /api/blogs/:slug/related
 * Get related blogs (by category and tags)
 * Query params: limit (default: 3)
 */
router.get("/blogs/:slug/related", getRelatedBlogs);

/**
 * =====================
 * ERROR HANDLING
 * =====================
 */

// Multer error handler
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "File too large. Maximum 5MB allowed.",
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        message: "Too many files. Maximum 20 files allowed.",
      });
    }
  }

  if (error.message === "Only image files are allowed") {
    return res.status(400).json({
      message: "Only image files (JPG, PNG, WebP, etc.) are allowed.",
    });
  }

  next(error);
});

export default router;