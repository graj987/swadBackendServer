import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String },
    image: { type: String, required: true },

    discountType: {
      type: String,
      enum: ["percentage", "flat"],
      required: true,
    },
    discountValue: { type: Number, required: true },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },

    isActive: { type: Boolean, default: true },
    type: {
      type: String,
      enum: ["flash", "latest"],
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Offer", offerSchema);
