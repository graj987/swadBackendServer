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
      weight: { type: String, required: true },
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

/* ================= ADDRESS ================= */

const addressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    pincode: { type: String, required: true },
    country: { type: String, default: "India" },
  },
  { _id: false }
);

/* ================= CONSTANTS ================= */

const ORDER_STATUSES = [
  "placed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];

const PAYMENT_STATUSES = [
  "pending",
  "initiated",
  "paid",
  "failed",
];

/* ================= ORDER ================= */

const orderSchema = new mongoose.Schema(
  {
    /* USER */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /* ITEMS */
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Order must contain at least one item",
      },
    },

    /* ADDRESS */
    address: {
      type: addressSchema,
      required: true,
    },

    /* PRICING */
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    codCharge: { type: Number, default: 0, min: 0 },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    /* PAYMENT */
    paymentMethod: {
      type: String,
      enum: ["COD", "Online"],
      default: "COD",
    },

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
    },

    razorpay_order_id: String,
    razorpay_payment_id: String,
    razorpay_signature: String,

    paymentDetails: {
      type: Object,
      default: {},
    },

    /* ORDER STATUS */
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "placed",
    },

    statusHistory: [
      {
        status: { type: String, required: true },
        date: { type: Date, default: Date.now },
      },
    ],

    /* ================= SHIPPING (SHIPROCKET) ================= */

    shipping: {
      shiprocketOrderId: { type: String, default: null },
      shipmentId: { type: String, default: null },
      awb: { type: String, default: null },

      courierName: { type: String, default: null },
      courierId: { type: String, default: null },

      trackingUrl: { type: String, default: null },

      status: {
        type: String,
        enum: [
          "created",
          "pickup_scheduled",
          "shipped",
          "in_transit",
          "out_for_delivery",
          "delivered",
          "rto",
          "cancelled",
        ],
        default: null,
      },

      trackHistory: [
        {
          status: String,
          location: String,
          date: { type: Date, default: Date.now },
          message: String,
        },
      ],
    },

    /* ================= ADDED: ANALYTICS HELPERS ================= */

    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },

    orderMonth: {
      type: Number, // 1–12
      index: true,
    },

    orderYear: {
      type: Number,
      index: true,
    },

    /* ================= ADDED: REVENUE FLAGS ================= */

    isPaidOrder: {
      type: Boolean,
      default: false,
      index: true,
    },

    isRevenueCounted: {
      type: Boolean,
      default: false,
    },

    /* ================= ADDED: REFUND ================= */

    refund: {
      isRefunded: { type: Boolean, default: false },
      refundAmount: { type: Number, default: 0 },
      refundReason: String,
      refundedAt: Date,
    },

    /* ================= ADDED: ADMIN ================= */

    createdByAdmin: {
      type: Boolean,
      default: false,
    },

    adminNotes: {
      type: String,
      default: "",
    },

    /* ================= ADDED: CONVERSION TRACKING ================= */

    trafficSource: {
      type: String, // google, instagram, direct
    },

    sessionId: {
      type: String,
    },
  },
  { timestamps: true }
);

/* ================= INDEXES ================= */

// Existing
orderSchema.index({ "shipping.awb": 1 });

// Added for dashboard performance
orderSchema.index({ createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ orderMonth: 1, orderYear: 1 });

/* ================= EXPORT ================= */

const Order = mongoose.model("Order", orderSchema);
export default Order;
