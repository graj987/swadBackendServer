import axios from "axios";

export async function shiprocketLogin() {
  try {
    const res = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/auth/login",
      {
        email: process.env.SHIP_EMAIL,
        password: process.env.SHIP_PASSWORD,
      }
    );
    return res.data.token;
  } catch (err) {
    console.log("Shiprocket login error:", err.response?.data);
  }
}
