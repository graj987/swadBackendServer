// utils/codProtector.js
import Order from "../models/order.js";

/**
 * COD FRAUD PREVENTION ENGINE
 * --------------------------------
 * Rules:
 * 1. No unpaid COD order allowed.
 * 2. Limit COD if user has multiple canceled/RTO orders.
 * 3. Pincode risk check (e.g., remote village regions often fail).
 * 4. Protect from first-time COD fraud.
 */

export const isCODAllowed = async (userId, pincode) => {
  try {
    // ------------------------------------
    // 1️⃣ Fetch last 5 orders of user
    // ------------------------------------
    const recentOrders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Track stats
    const codOrders = recentOrders.filter(o => o.paymentMethod === "COD");
    const failedCOD = codOrders.filter(o => o.paymentStatus === "failed");
    const returned = codOrders.filter(o => o.orderStatus === "cancelled");

    // ------------------------------------
    // 2️⃣ RULE: If user has failed COD attempts
    // ------------------------------------
    if (failedCOD.length >= 1) {
      return {
        allowed: false,
        reason:
          "Your previous COD payment failed. Please use Online Payment to continue.",
      };
    }

    // ------------------------------------
    // 3️⃣ RULE: If user has multiple returned/cancelled COD orders
    // ------------------------------------
    if (returned.length >= 2) {
      return {
        allowed: false,
        reason:
          "You have repeated returned COD orders. COD disabled temporarily. Use Online Payment instead.",
      };
    }

    // ------------------------------------
    // 4️⃣ RULE: Block risky pincodes
    // (You can update this list)
    // ------------------------------------
    const riskyPincodes = ["825409", "835205", "802312"];

    if (riskyPincodes.includes(pincode?.toString())) {
      return {
        allowed: false,
        reason:
          "COD is not available for your pincode due to repeated delivery failures. Please use Online Payment.",
      };
    }

    // ------------------------------------
    // 5️⃣ RULE: First-time user COD limit
    // ------------------------------------
    if (recentOrders.length === 0) {
      return {
        allowed: false,
        reason: "COD is unavailable for first-time users. Please place your first order with Online Payment.",
      };
    }

    // ------------------------------------
    // 6️⃣ RULE: Too many new unpaid orders
    // ------------------------------------
    const unpaid = recentOrders.filter(o => o.paymentStatus !== "paid");

    if (unpaid.length >= 2) {
      return {
        allowed: false,
        reason:
          "You have multiple unpaid orders. COD disabled until previous orders are completed.",
      };
    }

    // ------------------------------------
    // If everything is passed → allow COD
    // ------------------------------------
    return { allowed: true };

  } catch (err) {
    console.error("COD Protection Error:", err.message);
    // if check fails, default to safe mode (disable COD)
    return {
      allowed: false,
      reason: "Unable to verify COD eligibility. Please use Online Payment.",
    };
  }
};
