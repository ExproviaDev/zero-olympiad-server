const supabase = require("../config/db");
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');


sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const addMember = async (req, res) => {
  const { email, role, name, phone } = req.body;

  try {
    const tempPassword = crypto.randomBytes(4).toString('hex');
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: name, role: role }
    });

    if (authError) throw authError;

    // 🔥 Dynamic Role Logic
    let roundType = "staff_entry";
    let sdgRole = "Volunteer";

    // User বা Ambassador হলে তাদের ইনিশিয়াল রাউন্ডে পাঠানো হবে
    if (role === "user" || role === "ambassador") {
      roundType = "initial round_1";
    }

    // রোলের উপর ভিত্তি করে SDG Role সেট করা
    if (role === "user") sdgRole = "General Member";
    if (role === "ambassador") sdgRole = "SDG Ambassador";

    const { error: profileError } = await supabase
      .from("user_profiles")
      .insert([
        {
          user_id: authUser.user.id,
          email: email,
          name: name || (role === 'user' ? 'Participant' : 'Jury Member'),
          phone: phone || "00000000000",
          role: role || 'user',
          district: "N/A",
          institution: "Zero Olympiad",
          education_type: "General",
          grade_level: "N/A",
          current_level: "N/A",
          sdg_role: sdgRole,
          assigned_sdg_number: 0,
          round_type: roundType,
          is_blocked: false
        }
      ]);

    if (profileError) throw profileError;

    // 🔥 Extra Logic: User বা Ambassador হলে Round 1 টেবিলে ডাটা রাখা
    if (role === 'user' || role === 'ambassador') {
      await supabase.from('round_1_initial').insert([{
        user_id: authUser.user.id,
        quiz_score: 0,
        is_qualified: false
      }]);
    }

    // 🔥 Extra Logic: Ambassador হলে Ambassador টেবিলে ডাটা রাখা
    if (role === 'ambassador') {
      await supabase.from('ambassador_profiles').insert([{
        user_id: authUser.user.id,
        promo_code: null, // Admin কাস্টম কোড পরে আপডেট করে দিতে পারবে
        total_referrals: 0
      }]);
    }

    const msg = {
      to: email,
      from: process.env.SENDER_EMAIL,
      subject: `Invitation: Your Access to Zero Olympiad`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <div style="background-color: #2563eb; padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Zero Olympiad</h1>
                <p style="color: #bfdbfe; margin-top: 10px;">Welcome to the Platform</p>
            </div>
            
            <div style="padding: 30px; color: #374151; line-height: 1.6;">
                <h2 style="color: #1e3a8a; margin-top: 0;">Hello ${name},</h2>
                <p>An account has been successfully created for you as a <b style="color: #2563eb; font-size: 16px;">${role.toUpperCase()}</b> at Zero Olympiad.</p>
                
                <p style="color: #dc2626; font-weight: bold; font-size: 15px; text-align: center; margin-top: 25px;">
                    ⚠️ অনুগ্রহ করে নিচের ইমেইল এবং পাসওয়ার্ডটি কপি করে কোথাও সেভ করে রাখুন।
                </p>

                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 2px dashed #94a3b8; margin: 15px 0; text-align: center;">
                    <p style="margin: 8px 0; font-size: 16px;"><strong>Username / Email:</strong> <br><span style="color: #2563eb;">${email}</span></p>
                    <p style="margin: 15px 0 8px 0; font-size: 16px;"><strong>Temporary Password:</strong> <br><span style="color: #dc2626; font-weight: bold; font-size: 22px; letter-spacing: 2px;">${tempPassword}</span></p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL}/login" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(37,99,235,0.2);">লগইন করতে এখানে ক্লিক করুন</a>
                </div>

                ${(role === 'user' || role === 'ambassador') ? `
                <div style="background-color: #fff7ed; padding: 25px; border-left: 5px solid #f97316; margin: 30px 0; border-radius: 0 8px 8px 0;">
                    <h3 style="color: #c2410c; margin-top: 0; font-size: 18px;">লগইন করার পর আপনার করণীয়:</h3>
                    
                    <p style="color: #431407; margin-bottom: 12px; font-size: 15px;">
                        <strong>ধাপ ১:</strong> উপরের বাটনে ক্লিক করে ইমেইল ও পাসওয়ার্ড দিয়ে ওয়েবসাইটে লগইন করুন।
                    </p>
                    
                    <p style="color: #431407; margin-bottom: 12px; font-size: 15px;">
                        <strong>ধাপ ২:</strong> লগইন করার পর মেনু থেকে <b>"Profile"</b> বা <b>"Edit Profile"</b> অপশনে যান।
                    </p>
                    
                    <p style="color: #431407; margin-bottom: 12px; font-size: 15px;">
                        <strong>ধাপ ৩:</strong> প্রোফাইল পেজের একদম নিচে গিয়ে আপনার <b>"Current Level / Class"</b> এবং <b>"Education Type"</b> সঠিকভাবে সিলেক্ট করুন। এরপর <b>"Save Profile"</b> বাটনে ক্লিক করুন।
                    </p>
                    
                    <p style="color: #431407; margin-bottom: 0; font-size: 15px;">
                        <strong>ধাপ ৪:</strong> প্রোফাইল সেভ করার পর <b>"Dashboard"</b>-এ যান। সেখানে <b>"Start Course"</b> নামের একটি বাটন পাবেন, সেটিতে ক্লিক করে আপনার কোর্সটি শুরু করুন।
                    </p>
                </div>
                ` : ''}

                <p style="font-size: 14px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
                    <b>Note:</b> For security reasons, please change your password from your profile settings after your first login.
                </p>
            </div>
        </div>
      `,
    };

    await sgMail.send(msg);

    res.status(200).json({ success: true, message: `${role.toUpperCase()} added successfully & email sent!` });

  } catch (error) {
    console.error("Add Member Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
const updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { role, is_blocked } = req.body;

  try {
    // ১. অ্যাম্বাসেডর লজিক
    if (role === 'ambassador') {
      const { data: existingAmb } = await supabase
        .from('ambassador_profiles')
        .select('id')
        .eq('user_id', id)
        .maybeSingle();

      if (!existingAmb) {
        // নিশ্চিত করুন আপনার DB তে promo_code কলামটি NULL এলাউ করে
        const { error: ambError } = await supabase
          .from('ambassador_profiles')
          .insert([{
            user_id: id,
            promo_code: null,
            total_referrals: 0
          }]);

        if (ambError) throw ambError;
      }
    }

    // ২. শুধু যে ডাটাগুলো পাঠানো হয়েছে সেগুলোই আপডেট করা (Dynamic Update)
    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (is_blocked !== undefined) updateData.is_blocked = is_blocked;

    const { data, error } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("user_id", id);

    if (error) throw error;
    res.status(200).json({ success: true, message: "User updated successfully", data });
  } catch (error) {
    console.error("Update User Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from("user_profiles")
      .delete()
      .eq("user_id", id);

    if (error) throw error;
    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { addMember, getAllUsers, updateUserStatus, deleteUser };