import mongoose from "mongoose";
import Notification from "../models/notification.js";

/* =========================================
   GET ADMIN NOTIFICATIONS (UNREAD FIRST)
========================================= */
export const getAdminNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ read: false })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (err) {
    console.error("Notification fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load notifications",
    });
  }
};

/* =========================================
   MARK NOTIFICATION AS READ
========================================= */
export const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification id",
      });
    }

    const notification = await Notification.findByIdAndUpdate(
      id,
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      notification,
    });
  } catch (err) {
    console.error("Notification update error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
    });
  }
};
