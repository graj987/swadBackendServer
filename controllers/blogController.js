import cloudinary from "cloudinary";
import streamifier from "streamifier";
import Blog from "../models/blog.js";
import slugify from "slugify";
import { getLatestBlogsCache } from "../utils/blogCache.js";

/**
 * Upload buffer to Cloudinary
 */
const uploadBufferToCloudinary = (buffer, folder = "products") =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      { 
        folder,
        resource_type: "auto",
        quality: "auto",
        fetch_format: "auto",
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });

/**
 * Create Blog - Advanced version with structured content blocks
 */
export const createBlog = async (req, res) => {
  try {
    const {
      title,
      slug: providedSlug,
      excerpt,
      category,
      tags,
      metaTitle,
      metaDescription,
      focusKeyword,
      readTime,
      status,
      contentBlocks,
    } = req.body;

    // Validate required fields
    if (!title || !excerpt || !category) {
      return res.status(400).json({ 
        message: "Missing required fields: title, excerpt, category" 
      });
    }

    if (!req.files || !req.files.length) {
      return res.status(400).json({ 
        message: "Featured image is required" 
      });
    }

    // SEO validation
    if (!metaTitle || !metaDescription || !focusKeyword) {
      return res.status(400).json({ 
        message: "SEO fields required: metaTitle, metaDescription, focusKeyword" 
      });
    }

    // Generate or validate slug
    const slug = providedSlug || slugify(title, { lower: true, strict: true });

    // Check if slug already exists
    const existingBlog = await Blog.findOne({ slug });
    if (existingBlog) {
      return res.status(400).json({ 
        message: "This slug already exists. Please use a different title or slug." 
      });
    }

    // Upload featured image
    const featuredImageFile = req.files.find(f => f.fieldname === 'featuredImage');
    if (!featuredImageFile) {
      return res.status(400).json({ 
        message: "Featured image is required" 
      });
    }

    const featuredImageResult = await uploadBufferToCloudinary(
      featuredImageFile.buffer,
      "blogs/featured"
    );

    // Process content blocks and upload block images
    let processedBlocks = [];
    if (contentBlocks) {
      try {
        processedBlocks = JSON.parse(contentBlocks);

        // Upload images for content blocks
        for (const block of processedBlocks) {
          if (block.type === "image") {
            const blockImageFile = req.files.find(
              f => f.fieldname === `blockImage_${block.id}`
            );

            if (blockImageFile) {
              const blockImageResult = await uploadBufferToCloudinary(
                blockImageFile.buffer,
                `blogs/${slug}/images`
              );
              block.imageUrl = blockImageResult.secure_url;
              block.imagePublicId = blockImageResult.public_id; // For deletion later
            }
          }
        }
      } catch (error) {
        return res.status(400).json({ 
          message: "Invalid content blocks format" 
        });
      }
    }

    // Calculate word count
    let wordCount = 0;
    if (processedBlocks.length > 0) {
      processedBlocks.forEach(block => {
        if (block.type === "paragraph" || block.type === "heading") {
          wordCount += (block.content || "").split(/\s+/).filter(Boolean).length;
        } else if (block.type === "list") {
          block.items?.forEach(item => {
            wordCount += (item || "").split(/\s+/).filter(Boolean).length;
          });
        }
      });
    }

    // Add title and excerpt to word count
    wordCount += title.split(/\s+/).filter(Boolean).length;
    wordCount += excerpt.split(/\s+/).filter(Boolean).length;

    // Parse tags
    let parsedTags = [];
    try {
      parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags || [];
    } catch {
      parsedTags = [];
    }

    // Create blog document
    const blog = await Blog.create({
      title,
      slug,
      excerpt,
      category,
      tags: parsedTags,

      // SEO fields
      metaTitle,
      metaDescription,
      focusKeyword,

      // Content - structured blocks instead of HTML
      contentBlocks: processedBlocks,

      // Featured image
      image: featuredImageResult.secure_url,
      imagePublicId: featuredImageResult.public_id,

      // Stats
      wordCount,
      readTime: readTime || "3 min read",

      // Status
      status: status || "draft",
      isPublished: status === "published",
      publishedAt: status === "published" ? new Date() : null,
    });

    // Clear cache
    await getLatestBlogsCache();

    res.status(201).json({
      message: "Blog created successfully",
      blog: blog.toObject(),
    });
  } catch (err) {
    console.error("Create blog error:", err);
    res.status(500).json({ message: err.message || "Failed to create blog" });
  }
};

/**
 * Update Blog - with structured content blocks
 */
export const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      slug: providedSlug,
      excerpt,
      category,
      tags,
      metaTitle,
      metaDescription,
      focusKeyword,
      readTime,
      status,
      contentBlocks,
    } = req.body;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    // Validate slug uniqueness if changed
    if (providedSlug && providedSlug !== blog.slug) {
      const existingBlog = await Blog.findOne({ slug: providedSlug, _id: { $ne: id } });
      if (existingBlog) {
        return res.status(400).json({ 
          message: "This slug already exists" 
        });
      }
    }

    // Update basic fields
    if (title) {
      blog.title = title;
      blog.slug = providedSlug || slugify(title, { lower: true, strict: true });
    }
    if (excerpt) blog.excerpt = excerpt;
    if (category) blog.category = category;
    if (tags) {
      blog.tags = typeof tags === "string" ? JSON.parse(tags) : tags;
    }

    // Update SEO fields
    if (metaTitle) blog.metaTitle = metaTitle;
    if (metaDescription) blog.metaDescription = metaDescription;
    if (focusKeyword) blog.focusKeyword = focusKeyword;

    // Handle featured image upload
    if (req.files?.length > 0) {
      const featuredImageFile = req.files.find(f => f.fieldname === 'featuredImage');
      if (featuredImageFile) {
        // Delete old image from Cloudinary if exists
        if (blog.imagePublicId) {
          await cloudinary.v2.uploader.destroy(blog.imagePublicId);
        }

        const featuredImageResult = await uploadBufferToCloudinary(
          featuredImageFile.buffer,
          "blogs/featured"
        );
        blog.image = featuredImageResult.secure_url;
        blog.imagePublicId = featuredImageResult.public_id;
      }
    }

    // Update content blocks
    if (contentBlocks) {
      try {
        let processedBlocks = JSON.parse(contentBlocks);

        // Upload new block images
        for (const block of processedBlocks) {
          if (block.type === "image") {
            const blockImageFile = req.files?.find(
              f => f.fieldname === `blockImage_${block.id}`
            );

            if (blockImageFile) {
              const blockImageResult = await uploadBufferToCloudinary(
                blockImageFile.buffer,
                `blogs/${blog.slug}/images`
              );
              block.imageUrl = blockImageResult.secure_url;
              block.imagePublicId = blockImageResult.public_id;
            }
          }
        }

        blog.contentBlocks = processedBlocks;

        // Recalculate word count
        let wordCount = 0;
        processedBlocks.forEach(block => {
          if (block.type === "paragraph" || block.type === "heading") {
            wordCount += (block.content || "").split(/\s+/).filter(Boolean).length;
          } else if (block.type === "list") {
            block.items?.forEach(item => {
              wordCount += (item || "").split(/\s+/).filter(Boolean).length;
            });
          }
        });

        wordCount += blog.title.split(/\s+/).filter(Boolean).length;
        wordCount += blog.excerpt.split(/\s+/).filter(Boolean).length;
        blog.wordCount = wordCount;
      } catch (error) {
        return res.status(400).json({ 
          message: "Invalid content blocks format" 
        });
      }
    }

    // Update stats
    if (readTime) blog.readTime = readTime;

    // Update status
    if (status) {
      blog.status = status;
      blog.isPublished = status === "published";
      if (status === "published" && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }
    }

    await blog.save();

    // Clear cache
    await getLatestBlogsCache();

    res.json({
      message: "Blog updated successfully",
      blog: blog.toObject(),
    });
  } catch (err) {
    console.error("Update blog error:", err);
    res.status(500).json({ message: err.message || "Failed to update blog" });
  }
};

/**
 * Toggle Publish Status
 */
export const togglePublish = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    blog.isPublished = !blog.isPublished;
    blog.status = blog.isPublished ? "published" : "draft";
    
    if (blog.isPublished && !blog.publishedAt) {
      blog.publishedAt = new Date();
    }

    await blog.save();

    // Clear cache
    await getLatestBlogsCache();

    res.json({
      message: blog.isPublished ? "Blog published" : "Blog unpublished",
      blog: blog.toObject(),
    });
  } catch (err) {
    console.error("Toggle publish error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get All Blogs (Admin)
 */
export const getAllBlogsAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, category } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }
    if (status) query.status = status;
    if (category) query.category = category;

    const skip = (page - 1) * limit;

    const blogs = await Blog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Blog.countDocuments(query);

    res.json({
      blogs,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get all blogs admin error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get Blog By Slug (Public)
 */
export const getBlogBySlug = async (req, res) => {
  try {
    const blog = await Blog.findOne({
      slug: req.params.slug,
      isPublished: true,
    });

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    // Render content blocks properly
    const renderedBlog = {
      ...blog.toObject(),
      contentBlocks: blog.contentBlocks || [],
    };

    res.json(renderedBlog);
  } catch (err) {
    console.error("Get blog by slug error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get Blog By ID (Admin)
 */
export const getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    res.json(blog);
  } catch (err) {
    console.error("Get blog by id error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Delete Blog
 */
export const deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    // Delete featured image from Cloudinary
    if (blog.imagePublicId) {
      await cloudinary.v2.uploader.destroy(blog.imagePublicId);
    }

    // Delete content block images from Cloudinary
    if (blog.contentBlocks && blog.contentBlocks.length > 0) {
      for (const block of blog.contentBlocks) {
        if (block.type === "image" && block.imagePublicId) {
          await cloudinary.v2.uploader.destroy(block.imagePublicId);
        }
      }
    }

    await blog.deleteOne();

    // Clear cache
    await getLatestBlogsCache();

    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    console.error("Delete blog error:", err);
    res.status(500).json({ message: err.message || "Failed to delete blog" });
  }
};

/**
 * Get Latest Blogs (Public)
 */
export const getLatestBlogs = async (req, res) => {
  try {
    const { limit = 4 } = req.query;

    const blogs = await Blog.find({ isPublished: true })
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .select("title slug excerpt image readTime wordCount category tags publishedAt");

    res.json(blogs);
  } catch (err) {
    console.error("Get latest blogs error:", err);
    res.status(500).json({
      message: "Failed to fetch latest blogs",
    });
  }
};

/**
 * Search Blogs (Public)
 */
export const searchBlogs = async (req, res) => {
  try {
    const { q, category, tags, limit = 10, page = 1 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ blogs: [], total: 0 });
    }

    const query = { isPublished: true };

    // Text search
    query.$or = [
      { title: { $regex: q, $options: "i" } },
      { excerpt: { $regex: q, $options: "i" } },
      { focusKeyword: { $regex: q, $options: "i" } },
      { tags: { $regex: q, $options: "i" } },
    ];

    if (category) query.category = category;
    if (tags) {
      query.tags = { $in: Array.isArray(tags) ? tags : [tags] };
    }

    const skip = (page - 1) * limit;

    const blogs = await Blog.find(query)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("title slug excerpt image readTime category tags");

    const total = await Blog.countDocuments(query);

    res.json({
      blogs,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Search blogs error:", err);
    res.status(500).json({
      message: "Failed to search blogs",
    });
  }
};

/**
 * Get Related Blogs (by category & tags)
 */
export const getRelatedBlogs = async (req, res) => {
  try {
    const { slug, limit = 3 } = req.query;

    const blog = await Blog.findOne({ slug, isPublished: true });
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    const relatedBlogs = await Blog.find({
      isPublished: true,
      slug: { $ne: slug },
      $or: [
        { category: blog.category },
        { tags: { $in: blog.tags } },
      ],
    })
      .limit(parseInt(limit))
      .select("title slug excerpt image readTime category tags");

    res.json(relatedBlogs);
  } catch (err) {
    console.error("Get related blogs error:", err);
    res.status(500).json({
      message: "Failed to fetch related blogs",
    });
  }
};

/**
 * Get Blog Categories
 */
export const getBlogCategories = async (req, res) => {
  try {
    const categories = await Blog.distinct("category", { isPublished: true });
    res.json({ categories });
  } catch (err) {
    console.error("Get categories error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get Popular Tags
 */
export const getPopularTags = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const tags = await Blog.aggregate([
      { $match: { isPublished: true } },
      { $unwind: "$tags" },
      {
        $group: {
          _id: "$tags",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit) },
    ]);

    res.json(tags);
  } catch (err) {
    console.error("Get popular tags error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Export blog as JSON (backup)
 */
export const exportBlogAsJSON = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    const json = JSON.stringify(blog.toObject(), null, 2);
    
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${blog.slug}-${new Date().toISOString()}.json"`
    );
    res.send(json);
  } catch (err) {
    console.error("Export blog error:", err);
    res.status(500).json({ message: err.message });
  }
};