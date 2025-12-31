// utils/pincodeRegions.js

/**
 * PINCODE → REGION CLASSIFICATION
 * -------------------------------------------
 * 3 regions:
 *   - metro       (₹30 delivery)
 *   - semiurban   (₹40–₹50 delivery)
 *   - remote      (₹60–₹80 delivery)
 *
 * You will adjust these lists over time based on real orders.
 */

export const pincodeRegions = {
  metro: [
    "110", // Delhi
    "400", // Mumbai
    "560", // Bangalore
    "600", // Chennai
    "700", // Kolkata
    "500", // Hyderabad
  ],

  semiurban: [
    "201", "202", "203", // UP semi-urban
    "802", "803", "804", // Bihar semi-urban
    "380", "382", // Ahmedabad outskirts
  ],

  remote: [
    "825", "834", "835", // Jharkhand rural
    "786", "785", // Assam rural
    "901", "902", // Hill/tribal regions, fallback
  ],
};

/**
 * Detect region from pincode.
 * 
 * @param {string|number} pincode
 * @returns {"metro"|"semiurban"|"remote"}
 */
export const detectRegionFromPincode = (pincode) => {
  if (!pincode) return "remote";

  const code = pincode.toString().substring(0, 3); // take first 3 digits

  // Metro check
  if (pincodeRegions.metro.includes(code)) return "metro";

  // Semi-urban check
  if (pincodeRegions.semiurban.includes(code)) return "semiurban";

  // Remote by default
  return "remote";
};
