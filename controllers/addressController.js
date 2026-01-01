import express from "express";
import Address from "../models/address.js";
import { detectRegionFromPincode } from "../utils/pincodeRegions.js";


export const addAddress = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, phone, house, street, landmark, pincode, city, state } = req.body;

    if (!name || !phone || !house || !street || !pincode || !city || !state) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const region = detectRegionFromPincode(pincode);

    const address = new Address({
      userId,
      name,
      phone,
      house,
      street,
      landmark,
      pincode,
      city,
      state,
      region,
      isVerified: true, // Always true because user email is verified
    });

    await address.save();

    return res.json({
      success: true,
      message: "Address added successfully",
      data: address,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Error adding address" });
  }
};


export const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ userId: req.userId });
    return res.json({ success: true, data: addresses });
  } catch {
    return res.status(500).json({ success: false, message: "Error fetching addresses" });
  }
};


export const updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    const updated = await Address.findOneAndUpdate(
      { _id: addressId, userId: req.userId },
      { ...req.body },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    return res.json({
      success: true,
      message: "Address updated",
      data: updated,
    });

  } catch {
    return res.status(500).json({ success: false, message: "Error updating address" });
  }
};


export const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    await Address.findOneAndDelete({
      _id: addressId,
      userId: req.userId,
    });

    return res.json({
      success: true,
      message: "Address deleted",
    });
  } catch {
    res.status(500).json({ success: false, message: "Error deleting address" });
  }
};
