import express from "express";
import { createShiprocketOrder } from "../controllers/shiprocketController.js";

const router = express.Router();
//here the route is "create-order" for now i write is wrong create-orde
router.post("/create-orde", createShiprocketOrder);

export default router;
