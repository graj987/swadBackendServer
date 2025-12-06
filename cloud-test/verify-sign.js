// verify-sign.js
import crypto from "crypto";

const signResponse = {
  timestamp: 1764950100,
  signature: "8f5d892d8bf5b3a5262ff35c80fc7e2ace11d270",
  folder: "products"
};

// IMPORTANT: Node will read this from your system's environment
const apiSecret = process.env.CLOUDINARY_API_SECRET || "<NO_SECRET_IN_ENV>";

const params = {};
if (signResponse.folder) params.folder = signResponse.folder;
params.timestamp = String(signResponse.timestamp);

const keys = Object.keys(params).sort();
const strToSign = keys.map((k) => `${k}=${params[k]}`).join("&");
const expectedSignature = crypto.createHash("sha1").update(strToSign + apiSecret).digest("hex");

console.log("String to sign:    ", strToSign);
console.log("Server gave:        ", signResponse.signature);
console.log("Computed signature: ", expectedSignature);
console.log("Match?              ", expectedSignature === signResponse.signature);
