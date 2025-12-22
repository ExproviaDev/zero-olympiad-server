const supabase = require("../config/db");
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

module.exports = { getAllUsers, updateUserStatus, deleteUser };