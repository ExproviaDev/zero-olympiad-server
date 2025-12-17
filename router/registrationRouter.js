const express = require('express');
const supabase = require('../config/db');
const router = express.Router();

router.post('/register', async (req, res) => {
    const { 
        email, password, name, phone, district, institution, 
        educationType, gradeLevel, currentLevel, activities 
    } = req.body;

    try {
        let sdgRole = "General Member";
        const activistLevels = [
            "Class 5, Grade 5, PYP 5, Taysir, Equivalent",
            "Class 6, Grade 6, MYP 1, Mizan, Equivalent",
            "Class 7, Grade 7, MYP 2, Nahbameer",
            "Class 8, Grade 8, MYP 3, Hedayatun Nahu"
        ];
        const ambassadorLevels = [
            "Class 9, Grade 9, MYP 4, Kafiya and Bekaya, Equivalent",
            "Class 10, Grade 10, MYP 5, Kafiya and Bekaya, Equivalent",
            "SSC Candidate, O Level Candidate, Kafiya and Bekaya Equivalent",
            "Class 11 (HSC), Grade 11, DP 1, Jalalayn, Equivalent",
            "Class 12 (HSC), Grade 12, DP 2, Jalalayn, Equivalent",
            "HSC Candidate, A Level Candidate, Jalalayn Equivalent"
        ];

        if (activistLevels.includes(gradeLevel)) {
            sdgRole = "SDG Activist";
        } else if (ambassadorLevels.includes(gradeLevel)) {
            sdgRole = "SDG Ambassador";
        } else if (currentLevel && currentLevel !== "None of These") {
            sdgRole = "SDG Achiever";
        }
        const activitiesRole = Array.isArray(activities) ? activities.join(', ') : "";
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) return res.status(400).json({ message: authError.message });
        
        const newUserId = authData.user.id;
        const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .insert([
                {
                    user_id: newUserId,
                    name,
                    email,
                    phone,
                    district,
                    institution,
                    education_type: educationType,
                    grade_level: gradeLevel,
                    current_level: currentLevel || gradeLevel,
                    sdg_role: sdgRole,
                    activities_role: activitiesRole,
                    round_type: "initial round_1", 
                    assigned_course: "no course enrolled yet", 
                    role: "user"
                },
            ]);

        if (profileError) {
            console.error("Insert Error:", profileError.message);
            return res.status(500).json({ message: 'প্রোফাইল সেভ করা সম্ভব হয়নি।' });
        }

        res.status(201).json({ message: "রেজিস্ট্রেশন সফল!", user: authData.user });

    } catch (err) {
        res.status(500).json({ message: 'অভ্যন্তরীণ সার্ভার ত্রুটি।' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    try {

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
        
            console.error("Supabase Login Error:", error.message);
            return res.status(401).json({ message: error.message });
        }
        
        res.status(200).json({ 
            message: "Login successful!",
            session: data.session, 
            user: data.user
        });

    } catch (err) {
        console.error("Server Login Error:", err);
        res.status(500).json({ message: 'Internal server error occurred during login.' });
    }
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "পাসওয়ার্ড রিসেট করার জন্য ইমেল আবশ্যক।" });
    }

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://z-o-frontend.vercel.app/update-password', 
        });

        if (error) {
            console.error("Supabase Reset Password Error:", error.message);
            return res.status(400).json({ message: "পাসওয়ার্ড রিসেট অনুরোধ ব্যর্থ হয়েছে।" });
        }

        res.status(200).json({ 
            message: "আপনার ইমেল অ্যাড্রেসে পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে। দয়া করে আপনার ইনবক্স চেক করুন।" 
        });

    } catch (err) {
        console.error("Server Forgot Password Error:", err);
        res.status(500).json({ message: 'অভ্যন্তরীণ সার্ভার ত্রুটি ঘটেছে।' });
    }
});

module.exports = router;
