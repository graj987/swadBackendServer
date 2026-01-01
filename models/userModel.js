import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  isLoggedIn: { type: Boolean, default: false },
  token: { type: String, default: null },
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null },
  rtoCount: { type: Number, default: 0 },         // returned orders
  trustScore: { type: Number, default: 0 },
  codEligible: { type: Boolean, default: false },
  deliveredCount: { type: Number, default: 0 },


}, { timestamps: true });

export const User = mongoose.model("User", userSchema);
