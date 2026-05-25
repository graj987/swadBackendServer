import mongoose from "mongoose";

const blogSchema = new mongoose.Schema ({
  // Basic Info
  _id: ObjectId,
  title: String,
  slug: { type: String, unique: true, lowercase: true },
  excerpt: String,
  
  // Featured Image
  featuredImage: {
    url: String,
    size: Number,
    uploadedAt: Date,
  },
  
  // Content as JSON Blocks (NOT HTML)
  contentBlocks: [
    {
      id: Number,
      type: String, // "heading", "paragraph", "image", "list", "cta"
      content: String, // Text content
      
      // For headings
      level: String, // "h2" or "h3"
      
      // For lists
      items: [String],
      
      
      // For images
      imageUrl: String,
      altText: String,
      caption: String,
      
      // For CTAs
      ctaText: String,
      ctaUrl: String,
    }
  ],
  
  // SEO & Meta
  metaTitle: String,
  metaDescription: String,
  focusKeyword: String,
  
  // Organization
  category: String, // "health", "tech", "finance", etc.
  tags: [String],
  
  // Stats
  wordCount: Number,
  readTime: String,
  
  // Admin
  status: String, // "draft", "published", "scheduled"
  author: ObjectId, // Reference to User
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});