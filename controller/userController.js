const supabase = require("../config/db");
const sql = require("../config/pg");
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');


sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const addMember = async (req, res) => {
  const { email, role, name, phone, promoCode } = req.body;

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
    let roundType = "initial round_1";
    let sdgRole = "General Member";

    // User বা Ambassador হলে তাদের ইনিশিয়াল রাউন্ডে পাঠানো হবে
    if (role === "manager") {
      roundType = "staff_entry";
      sdgRole = "Jury Member";
    } else if (role === "admin") {
      roundType = "admin_access"; // অ্যাডমিনদের জন্য আলাদা রাউন্ড টাইপ রাখা ভালো
      sdgRole = "Admin";
    } else if (role === "ambassador") {
      sdgRole = "SDG Ambassador";
    }

    const newUserId = authUser.user.id;

    if (sql) {
      await sql`
        INSERT INTO user_profiles (
          user_id, email, name, phone, role, district, institution,
          education_type, grade_level, current_level, sdg_role,
          assigned_sdg_number, round_type, is_blocked, promo_code
        ) VALUES (
          ${newUserId}, ${email}, ${name}, ${phone}, ${role || 'user'},
          'N/A', 'Zero Olympiad', 'General', 'N/A', 'N/A', ${sdgRole},
          0, ${roundType}, false, ${promoCode || null}
        )
      `;
    } else {
      const { error: profileError } = await supabase
        .from("user_profiles")
        .insert([
          {
            user_id: newUserId,
            email: email,
            name: name,
            phone: phone,
            role: role || 'user',
            district: "N/A",
            institution: "Zero Olympiad",
            education_type: "General",
            grade_level: "N/A",
            current_level: "N/A",
            sdg_role: sdgRole,
            assigned_sdg_number: 0,
            round_type: roundType,
            is_blocked: false,
            promo_code: promoCode || null
          }
        ]);

      if (profileError) throw profileError;
    }

    // 🔥 Extra Logic: User বা Ambassador হলে Round 1 টেবিলে ডাটা রাখা
    if (role === 'user' || role === 'ambassador' || role === 'Participant') {
      if (sql) {
        await sql`
          INSERT INTO round_1_initial (user_id, quiz_score, is_qualified)
          VALUES (${newUserId}, 0, false)
        `;
      } else {
        await supabase.from('round_1_initial').insert([{
          user_id: newUserId,
          quiz_score: 0,
          is_qualified: false
        }]);
      }
    }

    // 🔥 Extra Logic: Ambassador হলে Ambassador টেবিলে ডাটা রাখা
    if (role === 'ambassador') {
      if (sql) {
        await sql`
          INSERT INTO ambassador_profiles (user_id, promo_code, total_referrals)
          VALUES (${newUserId}, NULL, 0)
        `;
      } else {
        await supabase.from('ambassador_profiles').insert([{
          user_id: newUserId,
          promo_code: null,
          total_referrals: 0
        }]);
      }
    }
    if (promoCode && sql) {
      await sql`
        UPDATE ambassador_profiles
        SET total_referrals = COALESCE(total_referrals, 0) + 1
        WHERE promo_code = ${promoCode.toUpperCase()}
      `;
    } else if (promoCode) {
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
    const t0 = Date.now();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const search = req.query.search?.trim() || "";
    const role = req.query.role?.trim() || "all";
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    if (search.length > 100) {
      return res.status(400).json({ success: false, error: "Search query is too long." });
    }

    if (sql) {
      const sanitized = search ? search.replace(/[%_]/g, "\\$&") : null;
      const pattern = sanitized ? `%${sanitized}%` : null;
      const roleFilter = role !== "all" ? role : null;

      const rows = await sql`
        SELECT
          user_id, name, email, phone, district, institution,
          education_type, grade_level, role, is_blocked, created_at,
          COUNT(*) OVER() AS total_count
        FROM user_profiles
        WHERE (${pattern}::text IS NULL OR
               name ILIKE ${pattern} OR email ILIKE ${pattern} OR phone ILIKE ${pattern})
          AND (${roleFilter}::text IS NULL OR role = ${roleFilter})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${from}
      `;

      const totalUsers = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
      const data = rows.map(({ total_count, ...rest }) => rest);

      console.log("[admin/all-users]", {
        total_ms: Date.now() - t0,
        page, limit,
        returned: data.length,
        total: totalUsers,
        pg: true,
      });

      return res.status(200).json({
        success: true,
        data,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
        currentPage: page,
        limit,
      });
    }

    let query = supabase
      .from("user_profiles")
      .select(
        "user_id, name, email, phone, district, institution, education_type, grade_level, role, is_blocked, created_at",
        { count: "exact" }
      );

    if (search) {
      const sanitized = search.replace(/[%_]/g, "\\$&");
      query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,phone.ilike.%${sanitized}%`);
    }

    if (role !== "all") {
      query = query.eq("role", role);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    console.log("[admin/all-users]", {
      total_ms: Date.now() - t0,
      page,
      limit,
      returned: data?.length || 0,
      total: count || 0,
      search: Boolean(search),
      role,
    });

    res.status(200).json({
      success: true,
      data,
      totalUsers: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: page,
      limit,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
const ensureAmbassadorProfileRow = async (userId) => {
  const rows = await sql`
    SELECT 1 AS ok FROM ambassador_profiles WHERE user_id = ${userId} LIMIT 1
  `;
  if (rows.length) return;
  try {
    await sql`
      INSERT INTO ambassador_profiles (user_id, promo_code, total_referrals)
      VALUES (${userId}, NULL, 0)
    `;
  } catch (_e) {
    const code = `ADM${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    await sql`
      INSERT INTO ambassador_profiles (user_id, promo_code, total_referrals)
      VALUES (${userId}, ${code}, 0)
    `;
  }
};

const updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { role, is_blocked } = req.body;

  try {
    if (sql) {
      // Avoid ON CONFLICT (user_id) unless DB has UNIQUE(user_id)—many setups don't, which breaks the whole update.
      if (role === "ambassador") {
        await ensureAmbassadorProfileRow(id);
      }
      if (role !== undefined && is_blocked !== undefined) {
        if (role === "ambassador") {
          await sql`
            UPDATE user_profiles
            SET role = ${role}, is_blocked = ${is_blocked}, sdg_role = 'SDG Ambassador'
            WHERE user_id = ${id}
          `;
        } else {
          await sql`
            UPDATE user_profiles SET role = ${role}, is_blocked = ${is_blocked} WHERE user_id = ${id}
          `;
        }
      } else if (role !== undefined) {
        if (role === "ambassador") {
          await sql`
            UPDATE user_profiles
            SET role = ${role}, sdg_role = 'SDG Ambassador'
            WHERE user_id = ${id}
          `;
        } else {
          await sql`UPDATE user_profiles SET role = ${role} WHERE user_id = ${id}`;
        }
      } else if (is_blocked !== undefined) {
        await sql`UPDATE user_profiles SET is_blocked = ${is_blocked} WHERE user_id = ${id}`;
      }
      return res.status(200).json({ success: true, message: "User updated successfully" });
    }

    // ১. অ্যাম্বাসেডর লজিক
    if (role === 'ambassador') {
      const { data: existingAmb } = await supabase
        .from('ambassador_profiles')
        .select('id')
        .eq('user_id', id)
        .maybeSingle();

      if (!existingAmb) {
        const { error: ambError } = await supabase
          .from('ambassador_profiles')
          .insert([{
            user_id: id,
            promo_code: null,
            total_referrals: 0
          }]);

        if (ambError) {
          const fallback = `ADM${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
          const { error: retryErr } = await supabase
            .from('ambassador_profiles')
            .insert([{
              user_id: id,
              promo_code: fallback,
              total_referrals: 0
            }]);
          if (retryErr) throw retryErr;
        }
      }
    }

    // ২. শুধু যে ডাটাগুলো পাঠানো হয়েছে সেগুলোই আপডেট করা (Dynamic Update)
    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (role === "ambassador") updateData.sdg_role = "SDG Ambassador";
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
    if (sql) {
      const { error: authError } = await supabase.auth.admin.deleteUser(id);
      if (authError) throw authError;

      await sql`DELETE FROM user_profiles WHERE user_id = ${id}`;
      return res.status(200).json({ success: true, message: "User completely deleted from system" });
    }

    // ১. প্রথমে Supabase Auth থেকে ইউজারকে ডিলিট করা
    const { error: authError } = await supabase.auth.admin.deleteUser(id);

    if (authError) throw authError;

    // ২. (ঐচ্ছিক) যদি আপনার ডাটাবেসে Cascade Delete সেট করা না থাকে,
    // তবে user_profiles থেকেও ম্যানুয়ালি ডিলিট করতে হবে।
    const { error: profileError } = await supabase
      .from("user_profiles")
      .delete()
      .eq("user_id", id);

    if (profileError) throw profileError;

    res.status(200).json({ success: true, message: "User completely deleted from system" });
  } catch (error) {
    console.error("Delete User Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { addMember, getAllUsers, updateUserStatus, deleteUser };