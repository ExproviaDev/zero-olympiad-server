const express = require('express');
const supabase = require('../config/db');
const router = express.Router();


router.post('/register', async (req, res) => {
    const { 
        email, 
        password, 
        name, 
        phone, 
        district, 
        institution, 
        educationType, 
        gradeLevel, 
        currentLevel 
    } = req.body;

    if (!email || !password || !name || !phone || !district || !institution || !educationType || !gradeLevel || !currentLevel) {
        return res.status(400).json({ message: "ফর্মের সকল তথ্য পূরণ করা আবশ্যক।" });
    }

    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) {
            console.error("Supabase Auth Error:", authError.message);
            return res.status(400).json({ message: authError.message });
        }
        
        const newUserId = authData.user.id; 

        const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .insert([
                {
                    user_id: newUserId, // Auth ID দিয়ে প্রোফাইল লিঙ্ক করা হলো
                    name,
                    email,
                    phone,
                    district,
                    institution,
                    education_type: educationType,
                    grade_level: gradeLevel,
                    current_level: currentLevel,
                },
            ])
            .select();

        if (profileError) {
            console.error("Supabase Profile Insert Error:", profileError.message);
            return res.status(500).json({ message: 'রেজিস্ট্রেশন ব্যর্থ: প্রোফাইল ডেটা সংরক্ষণ করা যায়নি।' });
        }

        // ৫. সফল Response
        res.status(201).json({ 
            message: "রেজিস্ট্রেশন সফল! যাচাইকরণের জন্য আপনার ইমেল চেক করুন। প্রোফাইল ডেটাও সেভ করা হয়েছে।",
            user: authData.user,
            profile: profileData ? profileData[0] : null // সেভ হওয়া প্রোফাইল ডেটা
        });

    } catch (err) {
        console.error("Server Registration Error:", err);
        res.status(500).json({ message: 'অভ্যন্তরীণ সার্ভার ত্রুটি ঘটেছে।' });
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
            redirectTo: 'http://localhost:3000/update-password', 
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
