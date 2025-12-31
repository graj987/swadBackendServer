import axios from "axios";
import Order from "../models/order.js";
import { shiprocketLogin } from "../services/shiprocketServices.js";

export const createShiprocketOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.body.orderId);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    const token = await shiprocketLogin();

    const payload = {
      order_id: order._id,
      order_date: new Date(),
      pickup_location: "Primary",

      billing_customer_name: order.customerName,
      billing_address: order.address,
      billing_city: order.city,
      billing_state: order.state,
      billing_country: "India",
      billing_pincode: order.pincode,
      billing_email: order.customerEmail,
      billing_phone: order.customerPhone,

      shipping_is_billing: true,

      order_items: order.items.map((i) => ({
        name: i.name,
        units: i.qty,
        selling_price: i.price,
      })),

      payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
      sub_total: order.totalAmount,

      length: 6,
      breadth: 6,
      height: 2,
      weight: 0.5,
    };

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const shipData = response.data;

    order.shiprocketOrderId = shipData.order_id;
    order.awb = shipData.awb;
    order.shipmentId = shipData.shipment_id;
    order.trackingUrl = shipData.tracking_url;

    await order.save();

    res.json({ success: true, order });
  } catch (error) {
    console.log(error.response?.data);
    res.status(500).json({ msg: "Shiprocket order failed" });
  }
};
