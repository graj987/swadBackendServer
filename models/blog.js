import mongoose from "mongoose";

const BlogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    excerpt: { type: String, required: true },
    content: { type: String, required: true }, // HTML or Markdown
    image: { type: String, required: true },
    readTime: { type: String, default: "3 min read" },

    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Blog", BlogSchema);
