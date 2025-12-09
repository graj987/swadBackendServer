import jwt from 'jsonwebtoken';
import {User} from '../models/userModel.js'; // make sure this file exports default User

export const isAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized, no token' });
    }

    const token = authHeader.split(' ')[1];

    // jwt.verify throws on invalid/expired token, so handle in catch
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { id } = decoded;

    const user = await User.findById(id).select('_id'); // select what you need
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    req.userId = user._id;
    return next();
  } catch (error) {
    // handle JWT-specific errors explicitly
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
