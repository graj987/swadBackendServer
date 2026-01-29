import Offer from "../models/offer.js";

export const getActiveOffers = async (req, res) => {
  const now = new Date();

  const offers = await Offer.find({
    isActive: true,
    startTime: { $lte: now },
    endTime: { $gte: now },
  }).populate("product");

  res.json({ success: true, data: offers });

};


export const createOffer = async (req, res) => {
  try {
    const {
      title,
      subtitle,
      image,
      product,
      discountType,
      discountValue,
      startTime,
      endTime,
      type,
    } = req.body;

    if (!title || !image || !product || !discountValue) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const offer = await Offer.create({
      title,
      subtitle,
      image,
      product,
      discountType,
      discountValue,
      startTime,
      endTime,
      type,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      data: offer,
    });
  } catch (err) {
    console.error("Create offer error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create offer",
    });
  }
};

/* ===============================
   GET ALL OFFERS (ADMIN)
================================ */
export const getAllOffers = async (req, res) => {
  try {
    const offers = await Offer.find()
      .populate("product", "name image price")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: offers,
    });
  } catch (err) {
    console.error("Get offers error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch offers",
    });
  }
};

/* ===============================
   UPDATE OFFER
================================ */
export const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    Object.assign(offer, req.body);
    await offer.save();

    res.json({
      success: true,
      data: offer,
    });
  } catch (err) {
    console.error("Update offer error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update offer",
    });
  }
};

/* ===============================
   TOGGLE OFFER ACTIVE / INACTIVE
================================ */
export const toggleOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    offer.isActive = !offer.isActive;
    await offer.save();

    res.json({
      success: true,
      isActive: offer.isActive,
    });
  } catch (err) {
    console.error("Toggle offer error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to toggle offer",
    });
  }
};

/* ===============================
   DELETE OFFER
================================ */
export const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    await offer.deleteOne();

    res.json({
      success: true,
      message: "Offer deleted",
    });
  } catch (err) {
    console.error("Delete offer error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete offer",
    });
  }
};
