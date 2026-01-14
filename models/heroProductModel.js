import mongoose from "mongoose";

const heroConfigSchema = new mongoose.Schema(
  {
    price: {
      type: Number,
      required: true,
    },
    weight: {
      type: String,
      required: true,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("HeroConfig", heroConfigSchema);
