// controllers/usersController.js
import mongoose from "mongoose";
import{User} from "../models/userModel.js";
import bcrypt from "bcryptjs";
import { verifyMail } from "./emailVerify/verifyMail.js";
import jwt from "jsonwebtoken";
import { Session } from "../models/sessionModel.js";
import { sendOtpEmail } from "./emailVerify/sendOtpMail.js";

export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
         message: "Missing fields: name, email and password are required" 
        });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await User.create({
       name, email, password: hashed 
      });

    const token =await jwt.sign({id:newUser._id},process.env.JWT_SECRET,{expiresIn:'1d'})
    verifyMail(token, email)
    newUser.token =token;
    await newUser.save();

    return res.status(201).json({ 
      success: true,
      message: "User registered successfully",
      data:newUser 
    });
  } 
  catch (error) {
    console.error("registerUser error:", error);
    return res.status(500).json({ message: "Error registering user", error: error.message });
  }
};

export const verification = async (req, res) => {
  try {
    const authHeader = req.headers.authorization ;
    if(!authHeader || !authHeader.startsWith("Bearer ")){
      return res.status(401).json({message:"Unauthorized, no token"

      })
    }
    const token = authHeader.split(" ")[1];
     
    let decoded;
    try{
      decoded = jwt.verify(token,process.env.JWT_SECRET);
    }catch(err){
      if(err.name ==="TokenExpiredError"){
        return res.status(401).json({
          success:false,
          message:"Token expired"});
      }
      return res.status(400).json({
        success:false,
        message:"Invalid token"
      })
    }
    const user = await User.findById(decoded.id);
    if(!user){
        return res.status(404).json({success:true, message:"User not found"});
    }
    user.token = null;
    user.isVerified = true;
    await user.save();
    return res.status(200).json({
      success:true, message:"Email verified successfully"
    })  

  } catch (error) {
    return res.status(500).json({
      success:false,
      message:"Server error",
      error:error.message
    })

  }
}

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success:false, message: "Email and password are required" });
    }
    const user = await User.findOne({ email})
    if (!user) {
      return res.status(401).json({
         success:false, message: "Invalid email" });
    }
    const passwordCheck = await bcrypt.compare(password, user.password);
    if (!passwordCheck) {
      return res.status(401).json({ 
        success:false, message: "Invalid  password" });
    }
    if(user.isVerified !== true){
      return res.status(401).json({
          success: false,
          message:"verify your email to login"
      });
    }
    //check for existing session and delete it 
    const existingSession = await Session.findOne({userId:user._id});
    if(existingSession){
      await Session.deleteOne({userId:user._id});
    }

    //create a new session
    await Session.create({userId:user._id});
    // Generate tokens
    
    const accessToken = jwt.sign({id:user._id},process.env.JWT_SECRET,{expiresIn:'1d'});
    const refreshToken = jwt.sign({id:user._id},process.env.JWT_SECRET,{expiresIn:'7d'});
    
    user.isLoggedIn = true;
    await user.save()

    return res.status(201).json({
      success:true,
      message:`Welcome back ${user.name}`,
      accessToken,
      refreshToken,
      user
    })
 

  } catch (error) {
     return res.status(500   ).json({
      success: false,
      message:error.message
     })
  }
};

export const logoutUser = async (req, res)=>{
  try {
    const userId =req.userId;
    await Session.deleteMany({userId})
    await User.findByIdAndUpdate(userId,{isLoggedIn:false})

    return res.status(200).json({
      success:true,
      message:"Logged out successfully"
    })

  } catch (error) {
    return res.send(500).json({
      success:false,
      message:error.message
    
  })
 }
}

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success:false,
         message: "User with this email does not exist" });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000; // 15 minutes from now
    
    user.otp = otp,
    user.otpExpiry = expiry;
    await user.save()
    await sendOtpEmail(otp, email);

    return res.status(200).json({
      success:true,
        message: "OTP sent to email successfully" });
    }
  catch (error) {
    return res.status(500).json({
      success:true,
      message: "Error sending OTP",
      error: error.message
  });
}
};

// verifyOTP.js (inside your controllers)
export const verifyOTP = async (req, res) => {
  try {
    const {otp} = req.body;
    const email = req.params.email;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Make sure an OTP was generated and an expiry exists
    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({
        success: false,
        message: "OTP not generated or already verified",
      });
    }

    // Check expiry (assuming otpExpiry is a timestamp in milliseconds)
    if (Date.now() > user.otpExpiry) {
      // clear the expired otp (optional)
      user.otp = null;
      user.otpExpiry = null;
      await user.save();

      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // Compare as strings to avoid type mismatch (number vs string)
    if (String(otp).trim() !== String(user.otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // OTP valid -> clear fields and persist
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("verifyOTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const changePassword = async (req, res)=> {
  const {newPassword, confirmPassword} = req.body
  const email = req.params.email 

  if(!newPassword || !confirmPassword){
    return res.status(400).json({
      success:false,
      message:"All fields are required"
    })
  }
  if(newPassword != confirmPassword){
    return res.status(400).json({
      success:false,
      message:"Password do not match"
    })
  }

  try{
    const user = await User.findOne({email})
    if(!user){
      return res.status(400).json({
        success:false,
        message:"User not found"
      })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)
    user.password = hashedPassword
    await user.save()

    return res.status(200).json({
      success:true,
      message:"Password changed successfully"
    })

  }
  catch(error){
    return res.status(500)({
      success:false,
      message:"Internal server error"
    })
  }



};


export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized - no user" });

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json(user);
  } catch (error) {
    console.error("getUserProfile error:", error);
    return res.status(500).json({ message: "Error fetching user profile", error: error.message });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized - no user" });

    const { name, email, password, phone } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.name = name ?? user.name;
    user.email = email ?? user.email;
    user.phone = phone ?? user.phone;

    if (password) {
      user.password = await hashPassword(password);
    }

    await user.save();
    const updated = await User.findById(userId).select("-password");
    return res.status(200).json({ message: "Profile updated successfully", user: updated });
  } catch (error) {
    console.error("updateUserProfile error:", error);
    return res.status(500).json({ message: "Error updating profile", error: error.message });
  }
};

export const deleteUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: "Invalid user id" });

    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("deleteUserById error:", error);
    return res.status(500).json({ message: "Error deleting user", error: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    return res.status(200).json(users);
  } catch (error) {
    console.error("getAllUsers error:", error);
    return res.status(500).json({ message: "Error fetching users", error: error.message });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user id" });

    const user = await User.findById(id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json(user);
  } catch (err) {
    console.error("getUserById error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const getUsersCount = async (req, res) => {
  try {
    const count = await User.countDocuments();
    return res.status(200).json({ count });
  } catch (err) {
    console.error("getUsersCount:", err);
    return res.status(500).json({ message: "Failed to fetch users count", error: err.message });
  }
};



