import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    isHero: {
      type: Boolean,
      default: false,
    },
    weight: String,
    price: Number,
    stock: Number,

    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    weight: {
      type: Number,
    },

    price: {
      type: Number,
      required: [true, "Product price is required"],
    },
    image: {
      type: String,
      default: "",
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    ratings: {
      type: Number,
      default: 0,
    },
    numReviews: {
      type: Number,
      default: 0,
    },
    featured: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", category: "text" });

const Product = mongoose.model("Product", productSchema);

export default Product;
