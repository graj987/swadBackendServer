import cloudinary from "cloudinary";
import streamifier from "streamifier";
import Blog from "../models/blog.js";
import slugify from "slugify";
import { getLatestBlogsCache } from "../utils/blogCache.js";

const uploadBufferToCloudinary = (buffer, folder = "products") =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      { folder },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });

export const createBlog = async (req, res) => {
  try {
    const { title, excerpt, content, readTime, status } = req.body;

    if (!title || !excerpt || !content) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Featured image is required" });
    }

    const slug = slugify(title, { lower: true, strict: true });

    const uploadResult = await uploadBufferToCloudinary(
      req.file.buffer,
      "blogs"
    );

    const blog = await Blog.create({
      title,
      slug,
      excerpt,
      content,
      readTime,
      status: status || "draft",
      image: uploadResult.secure_url,
    });

    res.status(201).json(blog);
  } catch (err) {
    console.error("Create blog error:", err);
    res.status(500).json({ message: err.message });
  }
};

export const togglePublish = async (req, res) => {
  const blog = await Blog.findById(req.params.id);

  if (!blog) return res.status(404).json({ message: "Not found" });

  blog.isPublished = !blog.isPublished;
  await blog.save();

  res.json(blog);
};

export const getAllBlogsAdmin = async (req, res) => {
  const blogs = await Blog.find().sort({ createdAt: -1 });
  res.json(blogs);
};


export const getBlogBySlug = async (req, res) => {
  const blog = await Blog.findOne({
    slug: req.params.slug,
    isPublished: true,
  });

  if (!blog) return res.status(404).json({ message: "Blog not found" });

  res.json(blog);
};
export const getBlogById = async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) {
    return res.status(404).json({ message: "Blog not found" });
  }
  res.json(blog);
};
export const updateBlog = async (req, res) => {
  const blog = await Blog.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  if (!blog) {
    return res.status(404).json({ message: "Blog not found" });
  }

  res.json(blog);
};
export const deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    await blog.deleteOne();

    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    console.error("Delete blog error:", err);
    res.status(500).json({ message: "Failed to delete blog" });
  }
};

export const getLatestBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .limit(4)
      .select("title slug excerpt image readTime createdAt");

    res.json(blogs);
  } catch (err) {
    console.error("getLatestBlogs error:", err);
    res.status(500).json({
      message: "Failed to fetch latest blogs",
    });
  }
};
