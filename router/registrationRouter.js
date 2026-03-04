const express = require('express');
const supabase = require('../config/db');
const router = express.Router();
const sgMail = require('@sendgrid/mail');

// SendGrid Setup (Make sure .env has SENDGRID_API_KEY & SENDER_EMAIL)
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// --- ইমেইল পাঠানোর ফাংশন ---
const sendWelcomeEmail = async (email, name, courseDetails, examDateEn, examDateBn) => {
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
        
        /* নতুন বড় বাটন ডিজাইন (Course) */
        .btn-primary { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; margin-top: 15px; box-shadow: 0 4px 6px rgba(37,99,235,0.3); text-align: center; }
        
        /* নতুন বড় বাটন ডিজাইন (Video) */
        .btn-video { display: inline-block; background-color: #dc2626; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 15px; box-shadow: 0 4px 6px rgba(220,38,38,0.3); text-align: center; }
        
        .divider { border-top: 1px solid #e5e7eb; margin: 30px 0; }
        .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
        .list-item { margin-bottom: 8px; }
        a { color: #2563eb; text-decoration: none; }
        .video-guide { background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin-top: 25px; text-align: center; font-size: 15px; }
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
                <h2 style="color: #2563eb; margin: 0 0 15px 0; font-size: 22px; text-align: center;">${courseDetails.courseName}</h2>
                <p style="text-align: center;">You can complete this course online for free at your own convenience.</p>
                
                <center>
                    <a href="${courseDetails.courseLink}" target="_blank" class="btn-primary">▶ Start Course Now</a>
                </center>
                
                <div class="video-guide">
                    <p style="margin: 0 0 15px 0; color: #9a3412;">
                        Although the courses on the UN website are very easy and manageable on your own, if you face any difficulties, please follow this step-by-step video guide:
                    </p>
                    <center>
                        <a href="https://www.youtube.com/watch?v=zOmotLWToLY" target="_blank" class="btn-video">🎥 Watch Guide Video</a>
                    </center>
                </div>
            </div>

            <p><strong>Important Information:</strong></p>
            <ul>
                <li class="list-item">Upon completion, you will receive a certificate directly from the United Nations institution.</li>
                <li class="list-item">The 30 MCQ questions for the first round of Zero Olympiad will be based on this course.</li>
                <li class="list-item"><strong>Exam Date:</strong> ${examDateEn}.</li>
                <li class="list-item">No marks will be deducted for wrong answers.</li>
            </ul>
            <p>You can log in to the Zero Olympiad website using your email and password to participate in the exam.</p>

            <div class="divider"></div>

            <div class="greeting">প্রিয় শিক্ষার্থী,</div>
            <p>আসসালামু আলাইকুম। জিরো অলিম্পিয়াডে রেজিস্ট্রেশন করার জন্য আপনাকে ধন্যবাদ।</p>
            <p>Zero Olympiad এ রেজিস্ট্রেশন করায় আপনি পাচ্ছেন <strong>United Nations Institute for Training and Research (UNITAR)</strong> এবং <strong>UN Climate Change Learning Partnership (UN CC:Learn)</strong> থেকে জাতিসংঘ স্বীকৃত একটি কোর্স করার সুযোগ।</p>

            <div class="card">
                <p style="margin-top:0; font-size: 14px;">আপনি যেহেতু <strong>${courseDetails.categoryName}</strong> ক্যাটাগরিতে রেজিস্ট্রেশন করেছেন, তাই আপনার কোর্স হবে:</p>
                <h2 style="color: #2563eb; margin: 15px 0; font-size: 20px; text-align: center;">${courseDetails.courseName}</h2>
                <p style="text-align: center;">কোর্সের লিংকে ক্লিক করে এই কোর্সটি অনলাইনে বিনামূল্যে নিজের সুবিধামত সময়ে করা যাবে।</p>
                
                <center>
                    <a href="${courseDetails.courseLink}" target="_blank" class="btn-primary">▶ কোর্স শুরু করতে ক্লিক করুন</a>
                </center>

                <div class="video-guide">
                    <p style="margin: 0 0 15px 0; color: #9a3412;">
                        যদিও জাতিসঙ্ঘের ওয়েবসাইট থেকে কোর্সগুলো করা খুবই সহজ এবং আপনি নিজেই তা করতে পারবেন, তবুও কোনো সমস্যার সম্মুখীন হলে এই ভিডিওটি দেখে সেই অনুযায়ী সম্পন্ন করুন: 
                    </p>
                    <center>
                        <a href="https://www.youtube.com/watch?v=zOmotLWToLY" target="_blank" class="btn-video">🎥 গাইড ভিডিওটি দেখুন</a>
                    </center>
                </div>
            </div>

            <p><strong>গুরুত্বপূর্ণ তথ্য:</strong></p>
            <ul>
                <li class="list-item">কোর্স সম্পন্ন করার সাথে সাথে জাতিসংঘের এই প্রতিষ্ঠান থেকেই সার্টিফিকেট প্রদান করা হবে।</li>
                <li class="list-item">এই কোর্স থেকেই Zero Olympiad এর ১ম রাউন্ডের ৩০টি MCQ প্রশ্ন থাকবে।</li>
                <li class="list-item">পরবর্তী জীবনে বায়োডাটা বা সিভিতে এই কোর্স সম্পন্ন করার তথ্য উল্লেখ করলে তা আপনাকে অন্যদের থেকে এগিয়ে রাখবে।</li>
                <li class="list-item"><strong>পরীক্ষার তারিখ:</strong> ${examDateBn}।</li>
                <li class="list-item">৩০টি প্রশ্ন থাকবে (মোট ৩০ মার্ক)। ভুল উত্তরের জন্য কোন নম্বর কাটা যাবে না।</li>
            </ul>
            
            <p>জিরো অলিম্পিয়াডের ওয়েবসাইটে আপনার ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করে ${examDateBn} দিনের যেকোন সময় পরীক্ষায় অংশগ্রহণ করতে পারবেন।</p>

            <br>
            <p style="margin-bottom: 0;">Best regards / শুভেচ্ছান্তে,</p>
            <p style="font-weight: bold; margin-top: 5px; color: #2563eb;">Zero Olympiad Team</p>
        </div>

        <div class="footer">
            <p>&copy; 2026 Zero Olympiad. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `
    };

    try {
        await sgMail.send(msg);
        console.log(`✅ Email sent successfully to ${email}`);
    } catch (error) {
        console.error("❌ Email Error:", error.message);
    }
};


// --- SDG Number ক্যালকুলেশন হেল্পার (Diploma সহ ১৭টি SDG) ---
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

    // 🔥 University ও Diploma এর জন্য ম্যাপিং
    if (l.includes("1st Year") || l.includes("Fazil") || l.includes("Mishkat")) return 12;
    if (l.includes("2nd Year")) return 13;
    if (l.includes("3rd Year")) return 14;
    if (l.includes("4th Year")) return 15;

    if (l.includes("5th Year") || l.includes("Kamil") || l.includes("Dawrah")) return 16;
    if (l.includes("Postgraduate")) return 17;

    return 0;
};
// --- ROUTES ---

router.post('/register', async (req, res) => {
    const {
        email, password, name, phone, district, institution,
        educationType, gradeLevel, promoCode, paymentToken, role, myPromoCode, signup_source
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
        // SDG Number ক্যালকুলেশন (ইউনিফাইড ড্রপডাউন থেকে আসা gradeLevel ব্যবহার করে)
        const assignedSDGNumber = calculateAssignedSDG(gradeLevel);

        let sdgRole = "General Member";
        let courseDetails = {};
        let examDateEn = "";
        let examDateBn = "";

        // আপনার দেয়া টেবিল অনুযায়ী ১৭টি SDG এর ম্যাপিং
        if (assignedSDGNumber >= 1 && assignedSDGNumber <= 4) {
            // SDG 1-4: Activist
            sdgRole = "SDG Activist";
            examDateEn = "7 May";
            examDateBn = "৭ মে";
            courseDetails = {
                categoryName: "Class 5 to Class 8 (or equivalent) - (SDG 1 to SDG 4)",
                courseName: "A Participant Guide of the UN Climate Change Process",
                courseLink: "https://unccelearn.org/course/view.php?id=174&page=overview"
            };
        } else if (assignedSDGNumber >= 5 && assignedSDGNumber <= 10) {
            // SDG 5-10: Ambassador
            sdgRole = "SDG Ambassador";
            examDateEn = "8 May";
            examDateBn = "৮ মে";
            courseDetails = {
                categoryName: "Class 9 to University Admission Candidate (or equivalent) - (SDG 5 to SDG 10)",
                courseName: "Convention on Long-range Transboundary Air Pollution",
                courseLink: "https://unccelearn.org/course/view.php?id=150&page=overview"
            };
        } else if (assignedSDGNumber >= 11 && assignedSDGNumber <= 17) {
            // SDG 11-17: Achiever
            sdgRole = "SDG Achiever";
            examDateEn = "9 May";
            examDateBn = "৯ মে";
            courseDetails = {
                categoryName: "University & Diploma (or equivalent) - (SDG 11 to SDG 17)",
                courseName: "Climate Change International Legal Regime",
                courseLink: "https://unccelearn.org/course/view.php?id=68&page=overview&lang=en"
            };
        }

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
            current_level: gradeLevel,
            promo_code: promoCode || null, // ✅ Promo Code Added
            sdg_role: sdgRole,
            assigned_sdg_number: assignedSDGNumber,
            round_type: "initial round_1",
            role: role || "user",
            payment_verify_token: paymentToken,
            signup_source: signup_source || 'organic'
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
        await sendWelcomeEmail(email, name, courseDetails, examDateEn, examDateBn);

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
            redirectTo: 'https://www.zeroolympiad.com/update-password',
        });
        if (error) return res.status(400).json({ message: "Reset password failed." });
        res.status(200).json({ message: "Password reset link sent to your email." });
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
});

module.exports = router;