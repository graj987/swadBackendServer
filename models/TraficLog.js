import mongoose from "mongoose";

const trafficLogSchema = new mongoose.Schema(
  {
    /* ================= USER (OPTIONAL) ================= */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // guest users allowed
      index: true,
    },

    /* ================= SESSION ================= */
    sessionId: {
      type: String,
      required: true,
      index: true,
    },

    /* ================= SOURCE / CAMPAIGN ================= */
    source: {
      type: String, // google, instagram, direct, referral
      default: "direct",
      index: true,
    },

    medium: {
      type: String, // cpc, organic, social
      default: null,
    },

    campaign: {
      type: String, // sale2026, diwali_offer
      default: null,
    },

    /* ================= PAGE INFO ================= */
    page: {
      type: String, // /product/xyz
      required: true,
    },

    referrer: {
      type: String, // previous URL
      default: null,
    },

    /* ================= DEVICE ================= */
    device: {
      type: String, // mobile, desktop
      default: null,
    },

    platform: {
      type: String, // android, ios, windows
      default: null,
    },

    browser: {
      type: String, // chrome, safari
      default: null,
    },

    /* ================= GEO (OPTIONAL) ================= */
    ip: {
      type: String,
      default: null,
    },

    country: {
      type: String,
      default: "India",
    },

    city: {
      type: String,
      default: null,
    },

    /* ================= CONVERSION ================= */
    converted: {
      type: Boolean,
      default: false,
      index: true,
    },

    convertedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* ================= INDEXES ================= */

// Fast analytics queries
trafficLogSchema.index({ createdAt: -1 });
trafficLogSchema.index({ source: 1, createdAt: -1 });
trafficLogSchema.index({ sessionId: 1, createdAt: -1 });

/* ================= EXPORT ================= */

const TrafficLog = mongoose.model("TrafficLog", trafficLogSchema);
export default TrafficLog;
