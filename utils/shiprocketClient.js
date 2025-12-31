// utils/shiprocketClient.js
import axios from "axios";

let token = null;
let tokenExpiry = null;

export const getShiprocketToken = async () => {
  const now = Date.now();

  if (token && tokenExpiry && now < tokenExpiry) {
    return token;
  }

  const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
    email: process.env.SR_EMAIL,
    password: process.env.SR_PASSWORD
  });

  token = res.data.token;
  tokenExpiry = now + 8 * 60 * 60 * 1000; // 8 hours

  return token;
};
