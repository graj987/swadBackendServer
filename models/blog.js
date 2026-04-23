import mongoose from "mongoose";

/**
 * Content Block Schema - for structured blog content
 */
const contentBlockSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    enum: ["heading", "paragraph", "image", "list", "cta"],
    required: true,
  },
  
  // For all text types (heading, paragraph)
  content: String,
  
  // For headings (h2, h3)
  level: String,
  
  // For lists
  items: [String],
  
  // For images
  imageUrl: String,
  imagePublicId: String, // Cloudinary public ID for deletion
  altText: String,
  caption: String,
  
  // For CTA buttons
  ctaText: String,
  ctaUrl: String,
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/**
 * Blog Schema
 */
const blogSchema = new mongoose.Schema(
  {
    // Basic Info
    title: {
      type: String,
      required: [true, "Blog title is required"],
      trim: true,
      maxlength: [255, "Title cannot exceed 255 characters"],
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    excerpt: {
      type: String,
      required: [true, "Blog excerpt is required"],
      trim: true,
      maxlength: [500, "Excerpt cannot exceed 500 characters"],
    },

    // Featured Image
    image: {
      type: String,
      required: [true, "Featured image is required"],
    },

    imagePublicId: {
      type: String,
      default: null,
    },

    // Content - Structured Blocks
    contentBlocks: {
      type: [contentBlockSchema],
      default: [],
      validate: {
        validator: function (blocks) {
          return blocks && blocks.length > 0;
        },
        message: "Blog must have at least one content block",
      },
    },

    // SEO & Meta
    metaTitle: {
      type: String,
      required: [true, "Meta title is required"],
      maxlength: [60, "Meta title should not exceed 60 characters"],
    },

    metaDescription: {
      type: String,
      required: [true, "Meta description is required"],
      maxlength: [160, "Meta description should not exceed 160 characters"],
    },

    focusKeyword: {
      type: String,
      required: [true, "Focus keyword is required"],
      maxlength: [100, "Focus keyword should not exceed 100 characters"],
    },

    // Organization
    category: {
      type: String,
      required: [true, "Blog category is required"],
      enum: {
        values: ["health", "tech", "finance", "lifestyle", "business", "other"],
        message: "Please select a valid category",
      },
    },

    tags: {
      type: [String],
      default: [],
      maxlength: [50, "Maximum 50 tags allowed"],
    },

    // Stats
    wordCount: {
      type: Number,
      default: 0,
    },

    readTime: {
      type: String,
      default: "3 min read",
    },

    // Status & Publishing
    status: {
      type: String,
      enum: ["draft", "published", "scheduled"],
      default: "draft",
    },

    isPublished: {
      type: Boolean,
      default: false,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    // Engagement
    viewCount: {
      type: Number,
      default: 0,
    },

    // Admin Info
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    // SEO Optimization
    seoScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },

    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
blogSchema.index({ slug: 1 });
blogSchema.index({ isPublished: 1, publishedAt: -1 });
blogSchema.index({ category: 1 });
blogSchema.index({ tags: 1 });
blogSchema.index({ status: 1 });

// Text index for search
blogSchema.index({
  title: "text",
  excerpt: "text",
  focusKeyword: "text",
  tags: "text",
});

// Update updatedAt before save
blogSchema.pre("save", function (next) {
  this.updatedAt = new Date();

  // Calculate SEO score
  let score = 0;

  if (this.metaTitle && this.metaTitle.length >= 50 && this.metaTitle.length <= 60) {
    score += 20;
  } else if (this.metaTitle) {
    score += 10;
  }

  if (
    this.metaDescription &&
    this.metaDescription.length >= 150 &&
    this.metaDescription.length <= 160
  ) {
    score += 20;
  } else if (this.metaDescription) {
    score += 10;
  }

  if (this.focusKeyword) {
    score += 20;
  }

  if (this.contentBlocks && this.contentBlocks.length >= 3) {
    score += 15;
  }

  if (this.wordCount >= 800) {
    score += 15;
  }

  const imageCount = this.contentBlocks?.filter(
    (b) => b.type === "image"
  ).length || 0;

  if (this.image && imageCount >= 1) {
    score += 10;
  }

  this.seoScore = Math.min(score, 100);

  next();
});

// Virtual for formatted publish date
blogSchema.virtual("formattedDate").get(function () {
  return this.publishedAt?.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

// Include virtuals in JSON
blogSchema.set("toJSON", { virtuals: true });
blogSchema.set("toObject", { virtuals: true });

// Method to increment view count
blogSchema.methods.incrementViewCount = async function () {
  this.viewCount += 1;
  return this.save();
};

// Method to get blog for public view
blogSchema.methods.getPublicView = function () {
  const obj = this.toObject();
  delete obj.author;
  delete obj.lastEditedBy;
  delete obj._v;
  return obj;
};

// Method to validate blog before publishing
blogSchema.methods.validateForPublishing = function () {
  const errors = [];

  if (!this.title?.trim()) errors.push("Title is required");
  if (!this.slug?.trim()) errors.push("Slug is required");
  if (!this.excerpt?.trim()) errors.push("Excerpt is required");
  if (!this.metaTitle?.trim()) errors.push("Meta title is required");
  if (!this.metaDescription?.trim()) errors.push("Meta description is required");
  if (!this.focusKeyword?.trim()) errors.push("Focus keyword is required");
  if (!this.image) errors.push("Featured image is required");
  if (this.contentBlocks?.length === 0) errors.push("Add at least one content block");

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Static method to get blogs by category
blogSchema.statics.getByCategory = function (category, limit = 10) {
  return this.find({ category, isPublished: true })
    .sort({ publishedAt: -1 })
    .limit(limit);
};

// Static method to search blogs
blogSchema.statics.searchBlogs = function (query, limit = 10, page = 1) {
  const skip = (page - 1) * limit;

  return this.find(
    { $text: { $search: query }, isPublished: true },
    { score: { $meta: "textScore" } }
  )
    .sort({ score: { $meta: "textScore" } })
    .skip(skip)
    .limit(limit);
};

// Static method to get trending blogs
blogSchema.statics.getTrendingBlogs = function (limit = 5) {
  return this.find({ isPublished: true })
    .sort({ viewCount: -1, publishedAt: -1 })
    .limit(limit);
};

// Static method to get popular tags
blogSchema.statics.getPopularTags = function (limit = 10) {
  return this.aggregate([
    { $match: { isPublished: true } },
    { $unwind: "$tags" },
    {
      $group: {
        _id: "$tags",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
};

const Blog = mongoose.model("Blog", blogSchema);

export default Blog;