const jwt = require("jsonwebtoken");

// ১. সাধারণ ইউজার ভেরিফিকেশন (যে কেউ লগইন থাকলে হবে)
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ success: false, error: "Access Denied! No token provided." });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: "Invalid token." });
  }
};

// ২. অ্যাডমিন ভেরিফিকেশন (শুধুমাত্র অ্যাডমিনদের জন্য)
const verifyAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ success: false, error: "Unauthorized!" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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

module.exports = { verifyToken, verifyAdmin };