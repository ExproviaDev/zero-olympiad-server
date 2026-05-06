const supabase = require("../config/db")
const express = require('express');
const router = express.Router();
const crypto = require("crypto");

router.use(express.json());
// --- SDG Number Calculation Helper ---
const calculateAssignedSDG = (level) => {
    const l = level ? level.trim() : "";

    if (l.includes("Class 5") || l.includes("Taisir")) return 1;
    if (l.includes("Class 6") || l.includes("Mizan")) return 2;
    if (l.includes("Class 7") || l.includes("Nahbemir")) return 3;
    if (l.includes("Class 8") || l.includes("Hidayatunnah")) return 4;
    if (l.includes("Class 9") || l.includes("Kafiya & Bekaya")) return 5;
    if (l.includes("Class 10")) return 6;
    if (l.includes("SSC") || l.includes("Dakhil Candidate")) return 7;
    if (l.includes("Class 11") || l.includes("Jalalayn")) return 8;
    if (l.includes("Class 12")) return 9;
    if (l.includes("HSC") || l.includes("Alim Candidate")) return 10;
    if (l.includes("Admission Candidate") || l.includes("Musannif")) return 11;

    // University & Diploma Mapping
    if (l.includes("1st Year") || l.includes("Fazil") || l.includes("Mishkat")) return 12;
    if (l.includes("2nd Year")) return 13;
    if (l.includes("3rd Year")) return 14;
    if (l.includes("4th Year")) return 15;
    if (l.includes("5th Year") || l.includes("Kamil") || l.includes("Dawrah")) return 16;
    if (l.includes("Postgraduate")) return 17;

    return 0;
};

router.post('/login', async (req, res) => {
    const rawEmail = req.body?.email;
    const rawPassword = req.body?.password;
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;
    const password = typeof rawPassword === "string" ? rawPassword : rawPassword;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

    try {
        const t0 = Date.now();
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) return res.status(401).json({ message: authError.message });
        const t1 = Date.now();
        const token = authData?.session?.access_token;
        if (!token) return res.status(500).json({ message: "Login session token missing." });
        const sessionId = crypto.randomUUID();

        const { error: sessionError } = await supabase
          .from("user_profiles")
          .update({ active_session_id: sessionId, updated_at: new Date().toISOString() })
          .eq("user_id", authData.user.id);

        if (sessionError) {
          console.error("[auth/login] session_update_failed", sessionError);
          return res.status(500).json({ message: "Unable to start session." });
        }

        const t2 = Date.now();

        // High-signal performance breadcrumbs (safe: no passwords).
        console.log("[auth/login]", {
            auth_ms: t1 - t0,
            total_ms: t2 - t0,
        });

        res.status(200).json({
            message: "Login successful!",
            token,
            sessionId,
            user: {
                id: authData.user.id,
                email: authData.user.email,
            }
        });

    } catch (err) {
        console.error("[auth/login] unhandled_error", err);
        res.status(500).json({ message: 'Internal server error occurred.' });
    }
});

router.post("/logout-all", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No token provided" });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const newSessionId = crypto.randomUUID();
    const { error: sessionError } = await supabase
      .from("user_profiles")
      .update({ active_session_id: newSessionId, updated_at: new Date().toISOString() })
      .eq("user_id", userData.user.id);

    if (sessionError) {
      return res.status(500).json({ success: false, message: "Failed to invalidate sessions" });
    }

    // Client should clear local token after this.
    return res.status(200).json({ success: true, message: "Logged out from all devices." });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Session bootstrap endpoint: returns the currently active session id for this user.
// This is used when a client has a valid token but lost its local session_id.
router.get("/session", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No token provided" });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("active_session_id")
      .eq("user_id", userData.user.id)
      .single();

    if (error || !data?.active_session_id) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    return res.status(200).json({ success: true, sessionId: data.active_session_id });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ isAuthenticated: false });

        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData?.user) return res.status(401).json({ isAuthenticated: false });

        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', userData.user.id)
            .single();

        if (profileError) return res.status(404).json({ message: "Profile not found" });

        res.status(200).json({
            isAuthenticated: true,
            user: profile
        });
    } catch (err) {
        res.status(401).json({ isAuthenticated: false });
    }
});


router.put('/update-profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];

        if (!token) return res.status(401).json({ error: "No token provided" });

        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData?.user) return res.status(401).json({ error: "Invalid token" });
        const userId = userData.user.id;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: User ID not found in token" });
        }

        const updates = { ...req.body };

        // ১. যদি grade_level পরিবর্তন হয়, তাহলে রোল পুনরায় ক্যালকুলেট করা হবে
        if (updates.grade_level) {
            const assignedSDGNumber = calculateAssignedSDG(updates.grade_level);
            let sdgRole = "General Member";

            if (assignedSDGNumber >= 1 && assignedSDGNumber <= 4) {
                sdgRole = "SDG Activist";
            } else if (assignedSDGNumber >= 5 && assignedSDGNumber <= 10) {
                sdgRole = "SDG Ambassador";
            } else if (assignedSDGNumber >= 11 && assignedSDGNumber <= 17) {
                sdgRole = "SDG Achiever";
            }

            updates.assigned_sdg_number = assignedSDGNumber;
            updates.sdg_role = sdgRole;
            updates.current_level = updates.grade_level; // current_level ও সিঙ্ক করা হলো
        }

        // ২. সেনসিটিভ ডাটা রিমুভ করা
        delete updates.email;
        delete updates.user_id;
        delete updates.id;

        // ৩. ডাটাবেস আপডেট
        const { data, error } = await supabase
            .from('user_profiles')
            .update(updates)
            .eq('user_id', userId)
            .select();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ message: "Profile updated successfully", user: data[0] });
    } catch (err) {
        console.error("Update Profile Error:", err);
        res.status(401).json({ error: "Invalid Token" });
    }
});

module.exports = router;