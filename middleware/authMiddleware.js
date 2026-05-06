const supabase = require("../config/db");

async function getUserFromBearer(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return { token: null, user: null, error: "Access Denied! No token provided." };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { token, user: null, error: "Invalid token." };

  return { token, user: data.user, error: null };
}

async function getRoleForUser(userId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (error) return null;
  return data?.role ?? null;
}

// ১. সাধারণ ইউজার ভেরিফিকেশন (যে কেউ লগইন থাকলে হবে)
const verifyToken = async (req, res, next) => {
  try {
    const { user, error } = await getUserFromBearer(req);
    if (error) return res.status(401).json({ success: false, error });

    // Attach a consistent shape similar to your previous JWT payload
    req.user = {
      sub: user.id,
      email: user.email,
    };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: "Invalid token." });
  }
};

// ২. অ্যাডমিন ভেরিফিকেশন (শুধুমাত্র অ্যাডমিনদের জন্য)
const verifyAdmin = async (req, res, next) => {
  try {
    const { user, error } = await getUserFromBearer(req);
    if (error) return res.status(401).json({ success: false, error: "Unauthorized!" });

    const role = await getRoleForUser(user.id);
    if (role !== "admin") {
      return res.status(403).json({
        success: false,
        error: `Access Denied! You are a ${role || "user"}, not an admin.`
      });
    }

    req.user = { sub: user.id, email: user.email, role };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: "Invalid token." });
  }
};


// ২. জুরি বোর্ড / স্টাফ এক্সেস (Jury & Admin both can enter)
const verifyStaff = async (req, res, next) => {
  try {
    const { user, error } = await getUserFromBearer(req);
    if (error) return res.status(401).json({ success: false, error: "Unauthorized!" });

    const role = await getRoleForUser(user.id);

    // Role jodi Admin hoy athoba Manager (Jury), tobei allow korbe
    if (role === "admin" || role === "manager") {
      req.user = { sub: user.id, email: user.email, role };
      next();
    } else {
      return res.status(403).json({
        success: false,
        error: "Access Denied! Staff/Jury access only."
      });
    }
  } catch (error) {
    return res.status(401).json({ success: false, error: "Invalid token." });
  }
};

module.exports = { verifyToken, verifyAdmin, verifyStaff };