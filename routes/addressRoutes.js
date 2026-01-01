import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import {
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
} from "../controllers/addressController.js";

import { reverseGeocode } from "../controllers/locationController.js";

const router = express.Router();

router.post("/add", isAuthenticated, addAddress);
router.get("/getadd", isAuthenticated, getAddresses);
router.put("/:addressId", isAuthenticated, updateAddress);
router.delete("/:addressId", isAuthenticated, deleteAddress);

// Auto-detect address from location
router.get("/reverse", isAuthenticated, reverseGeocode);

export default router;
