const jwt = require("jsonwebtoken");
const supabase = require("../config/db");

const verifyAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ success: false, error: "Unauthorized!" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ডাটাবেস কুয়েরি ছাড়াই রোল চেক
    if (decoded.role !== "admin") {
      return res.status(403).json({ 
        success: false, 
        error: `Access Denied! You are a ${decoded.role}, not an admin.` 
      });
    }

    req.user = decoded; 
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: "Invalid token." });
  }
};

module.exports = { verifyAdmin };