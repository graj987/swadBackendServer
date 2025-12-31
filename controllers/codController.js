import { User } from "../models/userModel.js";

export const checkCodEligibility = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        codAllowed: false,
        message: "User not found",
      });
    }

    // Count successful delivered orders
    const deliveredCount = await Order.countDocuments({
      user: userId,
      orderStatus: "delivered",
    });

    if (deliveredCount === 0) {
      return res.json({
        success: true,
        codAllowed: false,
        message: "Place 1 prepaid order to unlock COD",
      });
    }

    return res.json({
      success: true,
      codAllowed: true,
      message: "COD available",
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      codAllowed: false,
      message: "COD check failed",
    });
  }
};

