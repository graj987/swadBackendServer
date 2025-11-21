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

    // ₹ amount in integer (store in paise if using Razorpay)
    totalAmount: { type: Number, required: true },

    // Address where order will be delivered
    address: { type: String, required: true },

    // -------------------------------
    // 🔥 Razorpay fields (IMPORTANT)
    // -------------------------------
    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },
    razorpay_signature: { type: String },

    // “INR only” enforcement / logs
    paymentCurrency: { type: String, default: "INR" },
    cardCountry: { type: String, default: null },

    // -------------------------------
    // 🔥 Status fields
    // -------------------------------
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

    // -------------------------------
    // 🔍 Detailed payment log (optional)
    // -------------------------------
    paymentDetails: {
      type: Object,
      default: {},
    },

    // For auto-refund records
    refundDetails: {
      type: Object,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
