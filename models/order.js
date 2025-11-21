import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, default: 1 },
      },
    ],

    totalAmount: { type: Number, required: true },
    address: { type: String, required: true },

    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },
    razorpay_signature: { type: String },

    paymentCurrency: { type: String, default: "INR" },
    cardCountry: { type: String, default: null },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    orderStatus: {
      type: String,
      enum: ["preparing", "ready", "delivered", "cancelled"],
      default: "preparing",
    },

    paymentDetails: {
      type: Object,
      default: {},
    },

    refundDetails: {
      type: Object,
      default: null,
    },
  },
  { timestamps: true }
);

export default (mongoose.models.Order || mongoose.model("Order", orderSchema));
