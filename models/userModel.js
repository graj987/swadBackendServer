import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    
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


    rtoCount: { type: Number, default: 0 }, 
    deliveredCount: { type: Number, default: 0 }, 

    trustScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      index: true,
    },

    codEligible: { type: Boolean, default: false },


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

    signupSource: {
      type: String,
      default: "direct",
      index: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    blockReason: {
      type: String,
      default: "",
    },

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

export const User = mongoose.model("User", userSchema);
