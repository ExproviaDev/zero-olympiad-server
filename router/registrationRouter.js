const express = require('express');
const supabase = require('../config/db');
const router = express.Router();
const sgMail = require('@sendgrid/mail'); 

// SendGrid Setup (Make sure .env has SENDGRID_API_KEY & SENDER_EMAIL)
sgMail.setApiKey(process.env.SENDGRID_API_KEY); 

// --- ইমেইল পাঠানোর ফাংশন ---
const sendWelcomeEmail = async (email, name, courseDetails) => {
    const msg = {
        to: email,
        from: process.env.SENDER_EMAIL, // আপনার ভেরিফাইড সেন্ডার ইমেইল
        subject: 'Registration Successful - Zero Olympiad',
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div style="background-color: #2563eb; padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Zero Olympiad</h1>
                    <p style="color: #bfdbfe; margin-top: 5px;">Registration Confirmation</p>
                </div>
                
                <div style="padding: 30px; color: #374151; line-height: 1.6;">
                    <h2 style="color: #1e3a8a;">Dear ${name},</h2>
                    <p>Assalamu Alaikum. Thank you for registering for the Zero Olympiad.</p>
                    
                    <p>By registering, you get the opportunity to complete a United Nations-recognized course from <strong>UNITAR</strong> and <strong>UN CC:Learn</strong>.</p>
                    
                    <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; border: 1px solid #bae6fd; margin: 20px 0;">
                        <p style="margin-top: 0; font-size: 14px; color: #0369a1;">Category: <strong>${courseDetails.categoryName}</strong></p>
                        <hr style="border: 0; border-top: 1px solid #e0f2fe; margin: 10px 0;">
                        <p style="margin-bottom: 5px;">Your Assigned Course:</p>
                        <h3 style="color: #0284c7; margin: 0 0 10px 0;">${courseDetails.courseName}</h3>
                        <a href="${courseDetails.courseLink}" target="_blank" style="display: inline-block; background-color: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Start Course Now</a>
                    </div>

                    <p><strong>Important Information:</strong></p>
                    <ul style="color: #4b5563;">
                        <li>The 30 MCQ questions for the first round will be based on this course.</li>
                        <li>Exam Date: <strong>May 8</strong>.</li>
                    </ul>
                    
                    <p style="margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">Best regards,<br><strong>Zero Olympiad Team</strong></p>
                </div>
            </div>
        `,
    };

    try {
        await sgMail.send(msg);
        console.log(`✅ Email sent successfully to ${email}`);
    } catch (error) {
        console.error("❌ Email Error:", error.message);
    }
};

// --- SDG Number ক্যালকুলেশন হেল্পার ---
const calculateAssignedSDG = (gradeLevel, currentLevel) => {
    const grade = gradeLevel ? gradeLevel.trim() : "";
    const current = currentLevel ? currentLevel.trim() : "";

    // SDG 1-4 (Class 5 to 8)
    if (grade.includes("Class 5") || grade.includes("Grade 5") || grade.includes("PYP 5")) return 1;
    if (grade.includes("Class 6") || grade.includes("Grade 6") || grade.includes("MYP 1")) return 2;
    if (grade.includes("Class 7") || grade.includes("Grade 7") || grade.includes("MYP 2")) return 3;
    if (grade.includes("Class 8") || grade.includes("Grade 8") || grade.includes("MYP 3")) return 4;

    // SDG 5-10 (Class 9 to 12)
    if (grade.includes("Class 9") || grade.includes("Grade 9") || grade.includes("MYP 4")) return 5;
    if (grade.includes("Class 10") || grade.includes("Grade 10") || grade.includes("MYP 5")) return 6;
    if (grade.includes("SSC") || grade.includes("O Level")) return 7;
    if (grade.includes("Class 11") || grade.includes("Grade 11") || grade.includes("DP 1")) return 8;
    if (grade.includes("Class 12") || grade.includes("Grade 12") || grade.includes("DP 2")) return 9;
    if (grade.includes("HSC") || grade.includes("A Level")) return 10;

    // SDG 11-16 (Higher Ed)
    if (current.includes("1st Year") || current.includes("Diploma")) return 11;
    if (current.includes("2nd Year")) return 12;
    if (current.includes("3rd Year")) return 13;
    if (current.includes("4th Year")) return 14;
    if (current.includes("5th Year") || current.includes("Internship")) return 15;
    if (current.includes("Postgraduate") || current.includes("Kamil") || current.includes("Dawrah")) return 16;

    return 0; // Default
};

// --- ROUTES ---

router.post('/register', async (req, res) => {
    const {
        email, password, name, phone, district, institution,
        educationType, gradeLevel, currentLevel, promoCode, paymentToken
    } = req.body;

    try {
        // ১. পেমেন্ট ভেরিফিকেশন চেক
        const { data: paymentRecord, error: pError } = await supabase
            .from('payment_verifications')
            .select('*')
            .eq('verification_token', paymentToken)
            .eq('status', 'completed')
            .single();

        if (pError || !paymentRecord) {
            return res.status(400).json({
                message: "Payment verification failed. Please complete payment first."
            });
        }

        // ============================================================
        // ✅ ROBUST LOGIC: Identify Role & Course (Partial Match)
        // ============================================================
        
        let sdgRole = "General Member";
        let courseDetails = {};
        const trimmedGrade = gradeLevel ? gradeLevel.trim() : "";
        const trimmedCurrent = currentLevel ? currentLevel.trim() : "";

        // --- GROUP 1 CHECK (Class 5-8) ---
        const isGroup1 = [
            "Class 5", "Grade 5", "PYP 5", "Taysir", 
            "Class 6", "Grade 6", "MYP 1", "Mizan", 
            "Class 7", "Grade 7", "MYP 2", "Nahbameer", 
            "Class 8", "Grade 8", "MYP 3", "Hedayatun"
        ].some(keyword => trimmedGrade.includes(keyword));

        // --- GROUP 2 CHECK (Class 9-12 & Admission) ---
        const isGroup2 = [
            "Class 9", "Grade 9", "MYP 4", "Kafiya", 
            "Class 10", "Grade 10", "MYP 5", 
            "SSC", "O Level", 
            "Class 11", "Grade 11", "DP 1", "Jalalayn", 
            "Class 12", "Grade 12", "DP 2", 
            "HSC", "A Level"
        ].some(keyword => trimmedGrade.includes(keyword));

        if (isGroup1) {
            // CASE 1: Class 5 to 8
            sdgRole = "SDG Activist";
            courseDetails = {
                categoryName: "Class 5 to Class 8 (or equivalent)",
                courseName: "Sport For Climate Action",
                courseLink: "https://unccelearn.org/course/view.php?id=215&page=overview"
            };
        } else if (isGroup2) {
            // CASE 2: Class 9 to Admission
            sdgRole = "SDG Ambassador";
            courseDetails = {
                categoryName: "Class 9 to University Admission Candidate (or equivalent)",
                courseName: "Becoming A Climate Champion",
                courseLink: "https://unccelearn.org/course/view.php?id=201&page=overview"
            };
        } else {
            // CASE 3: University / Default
            if (trimmedCurrent && trimmedCurrent !== "None of These" && trimmedCurrent !== "N/A") {
                sdgRole = "SDG Achiever";
            }
            courseDetails = {
                categoryName: "Bachelor 1st Year to Masters (or equivalent)",
                courseName: "Scaling Climate Finance",
                courseLink: "https://unccelearn.org/course/view.php?id=205&page=overview"
            };
        }

        // SDG Number ক্যালকুলেশন
        const assignedSDGNumber = calculateAssignedSDG(gradeLevel, currentLevel);

        // ============================================================

        // ৩. Supabase Auth Create User
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });

        if (authError) {
            let msg = authError.message;
            if (msg.includes("User already registered")) msg = "Email already exists.";
            return res.status(400).json({ message: msg });
        }

        const newUserId = authData?.user?.id;
        if (!newUserId) return res.status(400).json({ message: "User creation failed." });

        // ৪. প্রোফাইল ডাটাবেসে সেভ করা
        const { error: profileError } = await supabase.from('user_profiles').insert([{
            user_id: newUserId,
            name, email, phone, district, institution,
            education_type: educationType,
            grade_level: gradeLevel,
            current_level: (currentLevel && currentLevel !== "None of These") ? currentLevel : gradeLevel,
            promo_code: promoCode || null, // ✅ Promo Code Added
            sdg_role: sdgRole, 
            assigned_sdg_number: assignedSDGNumber,
            round_type: "initial round_1",
            role: "user"
        }]);

        if (profileError) throw profileError;

        // ৫. রাউন্ড ১ এন্ট্রি
        await supabase.from('round_1_initial').insert([{ user_id: newUserId, quiz_score: 0, is_qualified: false }]);

        // ৬. পেমেন্ট টোকেন আপডেট (Used)
        await supabase.from('payment_verifications').update({ status: 'used' }).eq('verification_token', paymentToken);
        
        // ৭. ইমেইল পাঠানো
        await sendWelcomeEmail(email, name, courseDetails);

        res.status(201).json({
            message: "Registration Successful! Please check your email for course details.",
            user: authData.user
        });

    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ message: 'Server error, please try again later.' });
    }
});

// Forgot Password Route
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://z-o-frontend.vercel.app/update-password',
        });
        if (error) return res.status(400).json({ message: "Reset password failed." });
        res.status(200).json({ message: "Password reset link sent to your email." });
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
});

module.exports = router;