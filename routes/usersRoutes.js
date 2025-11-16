import express from "express";
import { registerUser, loginUser, getUserProfile, updateUserProfile, getAllUsers, deleteUserById, getUserById } from "../controllers/usersController.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", getUserProfile);
router.put("/profile", updateUserProfile);
router.get("/:id", getUserById)
router.get("/", getAllUsers);
router.delete("/:id", deleteUserById);



export default router;
