import axios from "axios";

let cachedToken = null;
let tokenExpiry = 0;
let refreshingPromise = null;

const login = async () => {
  const res = await axios.post(
    `${process.env.SHIPROCKET_BASE}/auth/login`,
    {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }
  );

  cachedToken = res.data.token;

  // Shiprocket tokens officially live 24h — refresh earlier
  tokenExpiry = Date.now() + 22 * 60 * 60 * 1000;

  return cachedToken;
};

export const getShiprocketToken = async () => {
  // valid token → return
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // if refresh already running → wait for it
  if (refreshingPromise) {
    return refreshingPromise;
  }

  // start refresh once
  refreshingPromise = login()
    .catch((err) => {
      cachedToken = null;
      tokenExpiry = 0;
      throw new Error("Shiprocket authentication failed");
    })
    .finally(() => {
      refreshingPromise = null;
    });

  return refreshingPromise;
};
