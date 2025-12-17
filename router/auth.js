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
            .select('name, email, phone, district, institution, sdg_role, activities_role, profile_image_url, role')
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

module.exports = router;