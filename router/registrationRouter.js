const express = require('express');
const supabase = require('../config/db');
const router = express.Router();
const jwt = require("jsonwebtoken");



// SDG Number ক্যালকুলেট করার হেল্পার ফাংশন
const calculateAssignedSDG = (gradeLevel, currentLevel) => {
    const grade = gradeLevel ? gradeLevel.trim() : "";
    const current = currentLevel ? currentLevel.trim() : "";

    // SDG 1-4 (Class 5 to 8)
    if (grade.includes("Class 5") || grade.includes("Grade 5")) return 1;
    if (grade.includes("Class 6") || grade.includes("Grade 6")) return 2;
    if (grade.includes("Class 7") || grade.includes("Grade 7")) return 3;
    if (grade.includes("Class 8") || grade.includes("Grade 8")) return 4;

    // SDG 5-10 (Class 9 to 12 and Candidates)
    if (grade.includes("Class 9") || grade.includes("Grade 9")) return 5;
    if (grade.includes("Class 10") || grade.includes("Grade 10")) return 6;
    if (grade.includes("SSC Candidate") || grade.includes("O Level")) return 7;
    if (grade.includes("Class 11") || grade.includes("Grade 11")) return 8;
    if (grade.includes("Class 12") || grade.includes("Grade 12")) return 9;
    if (grade.includes("HSC Candidate") || grade.includes("A Level")) return 10;

    // SDG 11-16 (Higher Education)
    if (current.includes("1st Year") || current.includes("Diploma")) return 11;
    if (current.includes("2nd Year")) return 12;
    if (current.includes("3rd Year")) return 13;
    if (current.includes("4th Year")) return 14;
    if (current.includes("5th Year") || current.includes("Internship")) return 15;
    if (current.includes("Postgraduate") || current.includes("Kamil") || current.includes("Dawrah")) return 16;

    return 0; // Default
};

router.post('/register', async (req, res) => {
    const {
        email, password, name, phone, district, institution,
        educationType, gradeLevel, currentLevel, activities
    } = req.body;

    try {
        let sdgRole = "General Member";
        const trimmedGrade = gradeLevel ? gradeLevel.trim() : "";

        // ১. SDG Role নির্ধারণ লজিক
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

        if (activistLevels.includes(trimmedGrade)) {
            sdgRole = "SDG Activist";
        } else if (ambassadorLevels.includes(trimmedGrade)) {
            sdgRole = "SDG Ambassador";
        } else if (currentLevel && currentLevel !== "None of These" && currentLevel !== "N/A") {
            sdgRole = "SDG Achiever";
        }

        // ২. SDG Number ক্যালকুলেশন
        const assignedSDGNumber = calculateAssignedSDG(gradeLevel, currentLevel);

        const roleMapping = {
            "Being a campus ambassador, I want to collect registrations, conduct online and offline study session of the course provided by the United Nations etc. | The best campus ambassador will be awarded": "campus ambassador",
            "I want to work in event management at the grand finale in Dhaka | The best event manager will be awarded": "event manager",
            "I want only to participate in the Zero Olympiad as a competitor, I don't want to do any such work.": "contestor"
        };

        const assignedRoles = Array.isArray(activities)
            ? activities.map(act => roleMapping[act]).filter(Boolean)
            : [];
        const activitiesRole = assignedRoles.length > 0 ? assignedRoles.join(', ') : "contestor";

        // ৩. Supabase Auth SignUp
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) {
            let errorMessage = authError.message;
            if (authError.message.includes("User already registered")) {
                errorMessage = "This email is already linked to an existing account.";
            }
            return res.status(400).json({ message: errorMessage });
        }

        const newUserId = authData?.user?.id;
        if (!newUserId) return res.status(400).json({ message: "Incorrect Information!" });

        // ৪. user_profiles টেবিলে প্রোফাইল ইনসার্ট
        const { error: profileError } = await supabase
            .from('user_profiles')
            .insert([{
                user_id: newUserId,
                name,
                email,
                phone,
                district,
                institution,
                education_type: educationType,
                grade_level: gradeLevel,
                current_level: (currentLevel && currentLevel !== "None of These") ? currentLevel : gradeLevel,
                sdg_role: sdgRole,
                activities_role: activitiesRole,
                assigned_sdg_number: assignedSDGNumber,
                round_type: "initial round_1",
                role: "user"
            }]);

        if (profileError) throw profileError;

        // ৫. round_1_initial টেবিলে অটোমেটিক এন্ট্রি তৈরি
        const { error: round1Error } = await supabase
            .from('round_1_initial')
            .insert([{
                user_id: newUserId,
                quiz_score: 0,
                is_qualified: false
            }]);

        if (round1Error) console.error("Round 1 Entry Error:", round1Error.message);

        res.status(201).json({
            message: "Registration Successful, Verify Your Email Please",
            user: authData.user
        });

    } catch (err) {
        console.error("Global Catch Error:", err);
        res.status(500).json({ message: 'Server error, please try again later.' });
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
