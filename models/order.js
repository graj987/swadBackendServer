import mongoose from "mongoose";

/* ================= ORDER ITEM ================= */

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    variant: {
      weight: {
        type: String,
        required: true,
        trim: true,
      },
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    priceAtPurchase: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

/* ================= ADDRESS SNAPSHOT ================= */

const addressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    city: { type: String, required: true, trim: true },
    state: String,
    pincode: { type: String, required: true },
    country: { type: String, default: "India" },
  },
  { _id: false }
);

/* ================= CONSTANTS ================= */

export const ORDER_STATUSES = [
  "created",
  "placed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "expired",
];

export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "paid",
  "failed",
  "expired",
];

/* ================= ORDER SCHEMA ================= */

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: v => Array.isArray(v) && v.length > 0,
    },

    address: {
      type: addressSchema,
      required: true,
    },

    /* PRICING */
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    codCharge: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    /* PAYMENT */
    paymentMethod: {
      type: String,
      enum: ["COD", "Online"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
    },

    paymentInitiatedAt: Date,
    paidAt: Date,

    razorpay_order_id: {
      type: String,
      sparse: true,
    },

    razorpay_payment_id: {
      type: String,
      sparse: true,
    },

    razorpay_signature: {
      type: String,
      select: false,
    },

    paymentDetails: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
      default: {},
    },

    /* ORDER STATUS */

    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "created",
    },

    statusHistory: {
      type: [
        {
          status: { type: String, enum: ORDER_STATUSES },
          date: { type: Date, default: Date.now },
        },
      ],
      default: () => [
        { status: "created", date: Date.now() },
      ],
    },

    /* SHIPPING */

    shipping: {
      shipmentId: String,
      awb: String,
      courierName: String,
      courierId: String,
      status: {
        type: String,
        default: "not_created",
      },
    },

    /* META */

    orderNumber: {
      type: String,
      unique: true,
      sparse: true,
    },

    orderMonth: Number,
    orderYear: Number,

    isRevenueCounted: {
      type: Boolean,
      default: false,
    },

    refund: {
      isRefunded: { type: Boolean, default: false },
      refundAmount: { type: Number, default: 0 },
      refundReason: String,
      refundedAt: Date,
    },

    createdByAdmin: { type: Boolean, default: false },
    adminNotes: { type: String, default: "" },

    trafficSource: String,
    sessionId: String,
  },
  { timestamps: true }
);

/* ================= INDEXES (ONLY HERE) ================= */

orderSchema.index({ user: 1, createdAt: -1 });

orderSchema.index({ paymentStatus: 1, createdAt: -1 });

orderSchema.index(
  { razorpay_order_id: 1 },
  { sparse: true }
);

orderSchema.index(
  { razorpay_payment_id: 1 },
  { sparse: true }
);

orderSchema.index({ orderMonth: 1, orderYear: 1 });

/* ================= SAFE EXPORT ================= */

export default mongoose.models.Order ||
  mongoose.model("Order", orderSchema);