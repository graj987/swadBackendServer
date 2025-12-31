import { User } from "../models/userModel.js";

export const checkCodEligibility = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        codAllowed: false,
        message: "User not authenticated",
      });
    }

    const user = await User.findById(userId);

    // 1. Email must be verified
    if (!user.emailVerified) {
      return res.json({
        success: true,
        codAllowed: false,
        message: "Verify your email to enable COD",
      });
    }

    // 2. Block COD if RTO count is high
    if (user.rtoCount >= 2) {
      return res.json({
        success: true,
        codAllowed: false,
        message: "COD disabled due to past returns",
      });
    }

    // 3. New user — block COD (your choice)
    if (user.trustScore < 2) {
      return res.json({
        success: true,
        codAllowed: false,
        message: "Place 2 prepaid orders to unlock COD",
      });
    }

    // 4. Trusted user
    return res.json({
      success: true,
      codAllowed: true,
      message: "COD available",
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      codAllowed: false,
      message: "COD check failed",
    });
  }
};
