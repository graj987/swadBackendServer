import axios from "axios";

export const syncOrderWithShiprocket = async (orderId, authHeader) => {
  try {
    // 1) create Shiprocket order
    await axios.post(
      `${process.env.BASE_URL}/api/shiprocket/create-order`,
      { orderId },
      { headers: { Authorization: authHeader } }
    );

    // 2) assign AWB
    await axios.post(
      `${process.env.BASE_URL}/api/shiprocket/awb`,
      { orderId },
      { headers: { Authorization: authHeader } }
    );

    // 3) generate shipping label
    await axios.get(
      `${process.env.BASE_URL}/api/shiprocket/label/${orderId}`,
      { headers: { Authorization: authHeader } }
    );

    console.log("Shiprocket sync success for order:", orderId);

  } catch (err) {
    console.error("Shiprocket sync failed:", err.response?.data || err.message);
  }
};
