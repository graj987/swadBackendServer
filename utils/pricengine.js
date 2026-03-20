// utils/pricingEngine.js
// ─────────────────────────────────────────────────────────────────
//  SwadBest — Canonical Pricing Engine
//  Import this in BOTH pricePreview and createOrder.
//  Never do price math anywhere else.
//
//  COST STRUCTURE (internal — never send to frontend):
//    Shiprocket:  ₹60 standard / ₹80 remote
//    Razorpay:    ~2% + 18% GST on fee ≈ ₹6 on ₹249 order
//    COD:         ₹20 flat handling
//
//  CUSTOMER PRICING:
//    GST:         5% food/FMCG — inclusive in MRP, shown transparently
//    Delivery:    Handled by calculateDeliveryCharge() in deliveryCharge.js
//    COD:         +₹20 (nudges customer toward Online)
//    Razorpay:    Absorbed silently — never shown
// ─────────────────────────────────────────────────────────────────

import {
  calculateDeliveryCharge,
  getDeliveryNote,
  getShiprocketCost,
  FREE_DELIVERY_THRESHOLD,
  STANDARD_DELIVERY_CHARGE,
} from "./deliveryCharge.js";

const COD_CHARGE  = 20;
const GST_RATE    = 0.05; // 5% food/FMCG, inclusive in MRP

// Razorpay — internal only, never sent to frontend
const RAZORPAY_RATE       = 0.02;
const RAZORPAY_GST_ON_FEE = 0.18;

/**
 * calculatePricing
 *
 * @param {number}  subtotal       — sum of (variantPrice × qty)
 * @param {string}  paymentMethod  — "COD" | "Online"
 * @param {boolean} isFirstOrder   — true = first ever order for this user
 * @param {string}  [city]         — destination city for delivery tier
 *
 * @returns {PricingResult}
 */
export function calculatePricing(subtotal, paymentMethod = "COD", isFirstOrder = false, city = "") {
  if (typeof subtotal !== "number" || subtotal < 0) {
    throw new Error("Invalid subtotal");
  }

  // ── Delivery ──────────────────────────────────────────────────
  const deliveryCharge = calculateDeliveryCharge(city, subtotal, isFirstOrder);
  const deliveryNote   = getDeliveryNote(city, subtotal, isFirstOrder);
  const freeDelivery   = deliveryCharge === 0;

  // How much more to spend to unlock free delivery
  // Only relevant for repeat ₹249 orders — nudge toward ₹449 pack
  const amountForFreeDelivery =
    (!isFirstOrder && !freeDelivery && subtotal < FREE_DELIVERY_THRESHOLD)
      ? Math.ceil(FREE_DELIVERY_THRESHOLD - subtotal)
      : null;

  // ── COD ───────────────────────────────────────────────────────
  const codCharge = paymentMethod === "COD" ? COD_CHARGE : 0;

  // ── GST (inclusive — back-calculated from MRP) ────────────────
  // MRP = base price × (1 + GST_RATE)
  // GST component = subtotal × rate / (1 + rate)
  const gstAmount  = Math.round((subtotal * GST_RATE) / (1 + GST_RATE));
  const baseAmount = subtotal - gstAmount;

  // ── Total ─────────────────────────────────────────────────────
  const totalAmount = subtotal + deliveryCharge + codCharge;

  // ── Perceived savings (for "You saved" badge) ─────────────────
  const deliverySaved = freeDelivery ? STANDARD_DELIVERY_CHARGE : 0;

  // ── Nudge message ─────────────────────────────────────────────
  let nudge = null;
  if (isFirstOrder) {
    nudge = {
      type: "first_order",
      text: `🎁 Free delivery on your first order — you save ₹${STANDARD_DELIVERY_CHARGE}!`,
    };
  } else if (amountForFreeDelivery) {
    nudge = {
      type: "upsell",
      text: `Upgrade to ₹449 pack and get FREE delivery! Save ₹${STANDARD_DELIVERY_CHARGE}`,
    };
  }

  return {
    subtotal,
    baseAmount,
    gstAmount,
    deliveryCharge,
    deliveryNote,        // "first_order" | "threshold_met" | "charged" | "remote"
    codCharge,
    totalAmount,
    freeDelivery,
    isFirstOrder,
    deliverySaved,
    amountForFreeDelivery,
    nudge,
  };
}

// ─────────────────────────────────────────────────────────────────
//  Internal cost estimator — admin / P&L dashboard only
//  NEVER send this to the frontend
// ─────────────────────────────────────────────────────────────────
export function estimateInternalCost(totalAmount, paymentMethod, city, isFirstOrder) {
  const shiprocket      = getShiprocketCost(city);
  const razorpayFee     = paymentMethod === "Online"
    ? Math.round(totalAmount * RAZORPAY_RATE * (1 + RAZORPAY_GST_ON_FEE))
    : 0;
  const deliverySubsidy = isFirstOrder ? STANDARD_DELIVERY_CHARGE : 0;

  return {
    shiprocket,
    razorpayFee,
    deliverySubsidy,
    totalPlatformCost: shiprocket + razorpayFee,
    netAfterPlatform:  totalAmount - shiprocket - razorpayFee,
  };
}

export { COD_CHARGE, GST_RATE, FREE_DELIVERY_THRESHOLD, STANDARD_DELIVERY_CHARGE };