import userModel from "../models/userModel.js";
const User = userModel;
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const hashPassword = async (plain) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashed = await hashPassword(password);
    const user = new User({ name, email, password: hashed });
    await user.save();
    return res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("registerUser error:", error);
    return res.status(500).json({ message: "Error registering user", error: error.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Missing credentials" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    // don't send password back
    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      // add other safe fields you want to return
    };

    return res.json({ token, user: safeUser });
  } catch (error) {
    console.error("loginUser error:", error);
    return res.status(500).json({ message: "Error logging in", error: error.message });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized - no user" });

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json(user);
  } catch (error) {
    console.error("getUserProfile error:", error);
    return res.status(500).json({ message: "Error fetching user profile", error: error.message });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized - no user" });

    const { name, email, password } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.name = name ?? user.name;
    user.email = email ?? user.email;

    if (password) {
      // hash the updated password
      user.password = await hashPassword(password);
    }

    await user.save();
    // return updated user without password
    const updated = await User.findById(userId).select("-password");
    return res.json({ message: "Profile updated successfully", user: updated });
  } catch (error) {
    console.error("updateUserProfile error:", error);
    return res.status(500).json({ message: "Error updating profile", error: error.message });
  }
};

export const deleteUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User
      .findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("deleteUserById error:", error);
    return res.status(500).json({ message: "Error deleting user", error: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    return res.json(users);
  }
  catch (error) {
    console.error("getAllUsers error:", error);
    return res.status(500).json({ message: "Error fetching users", error: error.message });
  }
};
export const getUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  }
  catch (error) {
    console.error("getUserById error:", error);
    return res.status(500).json({ message: "Error fetching user", error: error.message });
  }
};
export const getUsersCount = async (req,res) => {
  try {
    const count = await User.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error("getUsersCount:", err);
    res.status(500).json({ message: "Failed to fetch users count", error: err.message });
  }
};