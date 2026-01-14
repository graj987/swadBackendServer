import Notification from "../models/notification.js";

/* GET ALL NOTIFICATIONS */
export const getAdminNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      notifications,
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

/* MARK AS READ */
export const markNotificationRead = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, {
      read: true,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};
