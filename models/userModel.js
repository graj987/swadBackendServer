import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    /* ================= BASIC ================= */
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    avatar: { type: String, default: "" },
    password: { type: String, required: true },

    isVerified: { type: Boolean, default: false },
    isLoggedIn: { type: Boolean, default: false },

    token: { type: String, default: null },

    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },

    /* ================= ORDER / TRUST ================= */

    rtoCount: { type: Number, default: 0 }, // Returned orders
    deliveredCount: { type: Number, default: 0 }, // Successful deliveries

    trustScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      index: true,
    },

    codEligible: { type: Boolean, default: false },

    /* ================= ADDED: ORDER STATS ================= */

    totalOrders: {
      type: Number,
      default: 0,
    },

    totalSpent: {
      type: Number,
      default: 0,
    },

    lastOrderAt: {
      type: Date,
      default: null,
    },

    /* ================= ADDED: ANALYTICS ================= */

    signupSource: {
      type: String, // google, instagram, referral, direct
      default: "direct",
      index: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    /* ================= ADDED: ACCOUNT STATUS ================= */

    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    blockReason: {
      type: String,
      default: "",
    },

    /* ================= ADDED: ADMIN ================= */

    role: {
      type: String,
      enum: ["user", "admin", "support"],
      default: "user",
      index: true,
    },

    adminNotes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

userSchema.index({ codEligible: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ createdAt: -1 });

/* ================= EXPORT ================= */

export const User = mongoose.model("User", userSchema);
