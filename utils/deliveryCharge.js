// utils/deliveryCharge.js
// ─────────────────────────────────────────────────────────────────
//  Shiprocket delivery charge calculator
//
//  REAL SHIPROCKET RATES (Madhya Pradesh / standard 0.5kg slab):
//    Within city / local:  ₹60
//    Metro cities:         ₹60
//    Rest of India:        ₹60  (standard slab for your weight range)
//    Remote / special:     ₹80+
//
//  STRATEGY:
//    We charge ₹60 flat for all standard zones.
//    First order → always FREE (absorbed as CAC).
//    Repeat ₹449+ order → FREE (threshold covers Shiprocket cost).
//    Repeat ₹249 order → ₹60 charged to customer.
//
//  NOTE: This function returns the RAW Shiprocket cost you pay.
//  The decision of what to CHARGE the customer is in pricingEngine.js
// ─────────────────────────────────────────────────────────────────

/**
 * getShiprocketCost — what YOU pay Shiprocket per shipment
 * Used internally for margin calculations.
 *
 * @param {string} city — destination city name
 * @returns {number} — Shiprocket cost in ₹
 */
export const getShiprocketCost = (city = "") => {
  const c = city.toLowerCase().trim();

  // Remote / North-East / J&K / Andaman — Shiprocket charges more
  const remoteKeywords = ["andaman", "nicobar", "lakshadweep", "manipur", "nagaland",
    "mizoram", "arunachal", "sikkim", "meghalaya", "tripura"];
  if (remoteKeywords.some((k) => c.includes(k))) return 80;

  // Standard flat rate for all other zones (MP, metros, rest of India)
  return 60;
};

/**
 * calculateDeliveryCharge — what the CUSTOMER pays for delivery
 * This is what gets stored on the Order document.
 *
 * Rules:
 *   isFirstOrder = true  → always ₹0 (we absorb ₹60 as acquisition cost)
 *   subtotal ≥ ₹449      → ₹0 (free delivery threshold)
 *   subtotal < ₹449      → ₹60 (charged to customer)
 *   remote city          → ₹80 (regardless of above — pass-through)
 *
 * @param {string}  city          — destination city
 * @param {number}  subtotal      — order subtotal before delivery
 * @param {boolean} isFirstOrder  — is this user's first ever order?
 * @returns {number}
 */
export const calculateDeliveryCharge = (city = "", subtotal = 0, isFirstOrder = false) => {
  const shiprocketCost = getShiprocketCost(city);

  // Remote cities — always pass through the extra cost
  if (shiprocketCost > 60) return shiprocketCost;

  // First order — always free (absorbed as CAC)
  if (isFirstOrder) return 0;

  // Free delivery threshold — ₹449+ orders
  if (subtotal >= 449) return 0;

  // Standard delivery charge for ₹249 repeat orders
  return 60;
};

// ─────────────────────────────────────────────────────────────────
//  deliveryNote — tells frontend how to DISPLAY the delivery row
//  "first_order"   → show ₹60 crossed out → FREE + FIRST ORDER badge
//  "threshold_met" → show FREE
//  "charged"       → show ₹60
//  "remote"        → show ₹80
// ─────────────────────────────────────────────────────────────────
export const getDeliveryNote = (city = "", subtotal = 0, isFirstOrder = false) => {
  const shiprocketCost = getShiprocketCost(city);
  if (shiprocketCost > 60) return "remote";
  if (isFirstOrder) return "first_order";
  if (subtotal >= 449) return "threshold_met";
  return "charged";
};

export const FREE_DELIVERY_THRESHOLD = 449;
export const STANDARD_DELIVERY_CHARGE = 60;