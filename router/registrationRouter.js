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
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                    .header { background-color: #ffffff; padding: 20px; text-align: center; border-bottom: 3px solid #2563eb; }
                    .header h1 { color: #2563eb; margin: 0; font-size: 28px; letter-spacing: 1px; }
                    .content { padding: 30px; color: #333333; line-height: 1.6; }
                    .greeting { color: #1e3a8a; font-size: 20px; font-weight: bold; margin-bottom: 20px; }
                    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 5px solid #2563eb; }
                    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 15px; }
                    .divider { border-top: 1px solid #e5e7eb; margin: 30px 0; }
                    .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
                    .list-item { margin-bottom: 8px; }
                    a { color: #2563eb; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Zero Olympiad</h1>
                    </div>
                    
                    <div class="content">
                        <div class="greeting">Dear ${name},</div>

                        <p>Assalamu Alaikum. Thank you for registering for the Zero Olympiad.</p>
                        <p>By registering for the Zero Olympiad, you are getting the opportunity to complete a United Nations-recognized course from the <strong>United Nations Institute for Training and Research (UNITAR)</strong> and the <strong>UN Climate Change Learning Partnership (UN CC:Learn)</strong>.</p>

                        <div class="card">
                            <p style="margin-top:0; color: #475569; font-size: 14px;"><strong>Your Category:</strong> ${courseDetails.categoryName}</p>
                            <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 10px 0;">
                            <p style="margin-bottom: 5px;"><strong>Your Assigned Course:</strong></p>
                            <h2 style="color: #2563eb; margin: 0 0 10px 0; font-size: 22px;">${courseDetails.courseName}</h2>
                            <p>You can complete this course online for free at your own convenience.</p>
                            <center>
                                <a href="${courseDetails.courseLink}" target="_blank" class="btn">Start Course Now</a>
                            </center>
                        </div>

                        <p><strong>Important Information:</strong></p>
                        <ul>
                            <li class="list-item">Upon completion, you will receive a certificate directly from the United Nations institution.</li>
                            <li class="list-item">The 30 MCQ questions for the first round of Zero Olympiad will be based on this course.</li>
                            <li class="list-item"><strong>Exam Date:</strong> May 8.</li>
                            <li class="list-item">No marks will be deducted for wrong answers.</li>
                        </ul>
                        <p>You can log in to the Zero Olympiad website using your email and password to participate in the exam.</p>

                        <div class="divider"></div>

                        <div class="greeting">প্রিয় শিক্ষার্থী,</div>
                        <p>আসসালামু আলাইকুম। জিরো অলিম্পিয়াডে রেজিস্ট্রেশন করার জন্য আপনাকে ধন্যবাদ।</p>
                        <p>Zero Olympiad এ রেজিস্ট্রেশন করায় আপনি পাচ্ছেন <strong>United Nations Institute for Training and Research (UNITAR)</strong> এবং <strong>UN Climate Change Learning Partnership (UN CC:Learn)</strong> থেকে জাতিসংঘ স্বীকৃত একটি কোর্স করার সুযোগ।</p>

                        <div class="card">
                            <p style="margin-top:0; font-size: 14px;">আপনি যেহেতু <strong>${courseDetails.categoryName}</strong> ক্যাটাগরিতে রেজিস্ট্রেশন করেছেন, তাই আপনার কোর্স হবে:</p>
                            <h2 style="color: #2563eb; margin: 10px 0; font-size: 20px;">${courseDetails.courseName}</h2>
                            <p>কোর্সের লিংকে ক্লিক করে এই কোর্সটি অনলাইনে বিনামূল্যে নিজের সুবিধামত সময়ে করা যাবে।</p>
                            <center>
                                <a href="${courseDetails.courseLink}" target="_blank" class="btn">কোর্স শুরু করতে ক্লিক করুন</a>
                            </center>
                        </div>

                        <p><strong>গুরুত্বপূর্ণ তথ্য:</strong></p>
                        <ul>
                            <li class="list-item">কোর্স সম্পন্ন করার সাথে সাথে জাতিসংঘের এই প্রতিষ্ঠান থেকেই সার্টিফিকেট প্রদান করা হবে।</li>
                            <li class="list-item">এই কোর্স থেকেই Zero Olympiad এর ১ম রাউন্ডের ৩০টি MCQ প্রশ্ন থাকবে।</li>
                            <li class="list-item">পরবর্তী জীবনে বায়োডাটা বা সিভিতে এই কোর্স সম্পন্ন করার তথ্য উল্লেখ করলে তা আপনাকে অন্যদের থেকে এগিয়ে রাখবে।</li>
                            <li class="list-item"><strong>পরীক্ষার তারিখ:</strong> ৮ মে।</li>
                            <li class="list-item">৩০টি প্রশ্ন থাকবে (মোট ৩০ মার্ক)। ভুল উত্তরের জন্য কোন নম্বর কাটা যাবে না।</li>
                        </ul>
                        
                        <p>জিরো অলিম্পিয়াডের ওয়েবসাইটে আপনার ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করে ৮ মে দিনের যেকোন সময় পরীক্ষায় অংশগ্রহণ করতে পারবেন।</p>

                        <br>
                        <p style="margin-bottom: 0;">Best regards / শুভেচ্ছান্তে,</p>
                        <p style="font-weight: bold; margin-top: 5px; color: #2563eb;">Zero Olympiad Team</p>
                    </div>

                    <div class="footer">
                        <p>&copy; 2026 Zero Olympiad. All rights reserved.</p>
                        <p><a href="#">Contact Us</a> | <a href="#">Website</a></p>
                    </div>
                </div>
            </body>
            </html>
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
        educationType, gradeLevel, currentLevel, promoCode, paymentToken, role, myPromoCode,
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
            role: role || "user"
        }]);

        if (profileError) throw profileError;
        // ============================================================
        // 🔥 NEW INTEGRATION: AMBASSADOR & REFERRAL LOGIC
        // ============================================================

        // ক. ইউজার যদি অ্যাম্বাসেডর হিসেবে জয়েন করে
        if (role === 'ambassador' && myPromoCode) {
            await supabase.from('ambassador_profiles').insert([{
                user_id: newUserId,
                promo_code: myPromoCode.toUpperCase(),
                total_referrals: 0
            }]);
        }

        // খ. যদি কোনো কনটেস্টর অন্য কারো প্রোমো কোড ব্যবহার করে থাকে
        if (promoCode) {
            // ওই প্রোমো কোডটি কোন অ্যাম্বাসেডরের তা খুঁজে বের করা
            const { data: ambassadorData } = await supabase
                .from('ambassador_profiles')
                .select('id, total_referrals')
                .eq('promo_code', promoCode.toUpperCase())
                .single();

            if (ambassadorData) {
                // অ্যাম্বাসেডরের রেফারাল সংখ্যা ১ বাড়ানো
                await supabase
                    .from('ambassador_profiles')
                    .update({ total_referrals: (ambassadorData.total_referrals || 0) + 1 })
                    .eq('id', ambassadorData.id);
            }
        }
        // ============================================================

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