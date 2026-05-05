const jwt = require("jsonwebtoken")
const supabase = require("../config/db")
const express = require('express');
const router = express.Router();

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
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

    try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) return res.status(401).json({ message: authError.message });
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', authData.user.id)
            .single();

        if (profileError || !profile) return res.status(404).json({ message: "Profile not found." });
        const customToken = jwt.sign(
            { sub: authData.user.id, role: profile.role, email: authData.user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.status(200).json({
            message: "Login successful!",
            token: customToken,
            user: profile
        });

    } catch (err) {
        res.status(500).json({ message: 'Internal server error occurred.' });
    }
});

router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ isAuthenticated: false });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', decoded.sub)
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

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.sub || decoded.user_id || decoded.id;

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