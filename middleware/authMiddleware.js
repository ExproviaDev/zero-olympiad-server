const jwt = require("jsonwebtoken");
const supabase = require("../config/db");
const verifyAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized! No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.sub; 
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (error || !profile) {
      return res.status(403).json({ 
        success: false, 
        error: "Access Denied! Profile not found in database." 
      });
    }
    if (profile.role !== "admin") {
      return res.status(403).json({ 
        success: false, 
        error: `Access Denied! You are registered as a ${profile.role}, not an admin.` 
      });
    }
    req.user = { ...decoded, role: profile.role };
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);
    return res.status(401).json({ success: false, error: "Invalid or expired token." });
  }
};

module.exports = { verifyAdmin };