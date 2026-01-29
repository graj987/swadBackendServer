import axios from "axios";

let cachedToken = null;
let tokenExpiry = null;

export const getShiprocketToken = async () => {
  if (cachedToken && tokenExpiry > Date.now()) {
    return cachedToken;
  }

  const res = await axios.post(
    `${process.env.SHIPROCKET_BASE}/auth/login`,
    {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }
  );

  cachedToken = res.data.token;
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 hrs

  return cachedToken;
};

