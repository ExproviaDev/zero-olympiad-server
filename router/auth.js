const supabase = require("../config/db")
const express = require('express');
const router = express.Router();

router.use(express.json());

router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ isAuthenticated: false, message: "No token provided" });
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ isAuthenticated: false, message: "Invalid token" });
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (profileError) return res.status(500).json({ message: "Profile not found" });
        res.status(200).json({
            isAuthenticated: true,
            user: profile
        });
    } catch (err) {
        res.status(500).json({ message: "authError" });
    }
});


router.put('/update-profile', async (req, res) => {
    try {
        const { name, phone, district, institution, education_typ, grade_level, profile_image_url } = req.body;
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) return res.status(401).json({ error: "No token provided" });
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
        const { data, error } = await supabase
            .from('user_profiles')
            .update({
                name,
                phone,
                district,
                institution,
                education_typ,
                grade_level,
                profile_image_url
            })
            .eq('user_id', user.id)
            .select();

        if (error) return res.status(500).json({ error: error.message });

        res.json({
            message: "Profile updated successfully",
            user: data[0]
        });
    } catch (err) {
        res.status(500).json({ error: "Something went wrong" });
    }
});
module.exports = router;