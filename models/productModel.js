import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
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
      enum: ["Snacks", "Meal", "Sweets", "Pickles", "Drinks", "Other"],
      default: "Other",
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
    },
    image: {
      type: String, // URL to your uploaded image (Render/Cloudinary/local)
      default: "",
    },
    stock: {
      type: Number,
      default: 10, // you can increase as you scale up
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
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);
export default Product;
