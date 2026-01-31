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
    const { error: profileError } = await supabase
      .from("user_profiles")
      .insert([
        {
          user_id: authUser.user.id,
          email: email,
          name: name || 'Jury Member',
          phone: phone || "00000000000",
          role: role || 'manager',
          district: "N/A",
          institution: "Zero Olympiad",
          education_type: "General",
          grade_level: "N/A",
          current_level: "N/A",
          sdg_role: "Volunteer",
          activities_role: "Staff",
          assigned_sdg_number: 0,
          round_type: "staff_entry",
          is_blocked: false
        }
      ]);

    if (profileError) throw profileError;
    const msg = {
      to: email,
      from: process.env.SENDER_EMAIL,
      subject: 'Invitation: Your Access to Zero Olympiad Jury Panel',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #2563eb; padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Zero Olympiad</h1>
                <p style="color: #bfdbfe; margin-top: 10px;">Welcome to the Jury Panel</p>
            </div>
            <div style="padding: 30px; color: #374151; line-height: 1.6;">
                <h2 style="color: #1e3a8a;">Hello ${name},</h2>
                <p>We are excited to inform you that you have been added as a <b>${role === 'manager' ? 'Jury (Manager)' : role}</b>.</p>
                <div style="background-color: #f3f4f6; padding: 25px; border-radius: 8px; border: 1px dashed #9ca3af; margin: 25px 0;">
                    <p style="margin: 8px 0;"><strong>User Email:</strong> ${email}</p>
                    <p style="margin: 8px 0;"><strong>Password:</strong> <span style="color: #dc2626; font-weight: bold; font-size: 18px;">${tempPassword}</span></p>
                </div>
                <p style="font-size: 14px; color: #6b7280;"><b>Note:</b> Change your password after your first login.</p>
            </div>
        </div>
      `,
    };

    await sgMail.send(msg);

    res.status(200).json({ success: true, message: "Member registered & invitation email sent!" });

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
    const { data, error } = await supabase
      .from("user_profiles")
      .update({ role, is_blocked })
      .eq("user_id", id);

    if (error) throw error;
    res.status(200).json({ success: true, message: "User updated successfully", data });
  } catch (error) {
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