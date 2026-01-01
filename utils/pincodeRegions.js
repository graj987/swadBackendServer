/**
 * REGION DETECTION FOR PINCODE
 * -----------------------------------------
 * Returns one of:
 *   - "metro"
 *   - "semiurban"
 *   - "remote"
 *
 * Delivery charges will depend on this.
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
    "380", "382",         // Ahmedabad outskirts
  ],

  remote: [
    "825", "834", "835", // Jharkhand rural
    "786", "785",        // Assam rural
    "901", "902",        // Hill/tribal regions
  ],
};


/**
 * Safely detect region from pincode.
 *
 * @param {string|number} pincode
 * @returns {"metro"|"semiurban"|"remote"}
 */
export const detectRegionFromPincode = (pincode) => {
  try {
    if (!pincode) return "remote";

    const code = pincode.toString().substring(0, 3); // first 3 digits

    if (pincodeRegions.metro.includes(code)) return "metro";
    if (pincodeRegions.semiurban.includes(code)) return "semiurban";
    if (pincodeRegions.remote.includes(code)) return "remote";

    return "remote"; // default fallback
  } catch {
    return "remote"; // crash-proof
  }
};
