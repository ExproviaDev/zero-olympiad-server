const jwt = require("jsonwebtoken")
const supabase = require("../config/db")
const express = require('express');
const router = express.Router();

router.use(express.json());


router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

    try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) return res.status(401).json({ message: authError.message });
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', authData.user.id)
            .single();

        if (profileError || !profile) return res.status(404).json({ message: "Profile not found." });
        const customToken = jwt.sign(
            { sub: authData.user.id, role: profile.role, email: authData.user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.status(200).json({
            message: "Login successful!",
            token: customToken,
            user: profile
        });

    } catch (err) {
        res.status(500).json({ message: 'Internal server error occurred.' });
    }
});

router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ isAuthenticated: false });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', decoded.sub)
            .single();

        if (profileError) return res.status(404).json({ message: "Profile not found" });

        res.status(200).json({
            isAuthenticated: true,
            user: profile
        });
    } catch (err) {
        res.status(401).json({ isAuthenticated: false });
    }
});


router.put('/update-profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];

        if (!token) return res.status(401).json({ error: "No token provided" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userId = decoded.sub || decoded.user_id || decoded.id;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: User ID not found in token" });
        }

        const updates = { ...req.body };
        delete updates.email;
        delete updates.user_id; 
        delete updates.id;

        const { data, error } = await supabase
            .from('user_profiles')
            .update(updates)
            .eq('user_id', userId)
            .select();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ message: "Profile updated successfully", user: data[0] });
    } catch (err) {
        res.status(401).json({ error: "Invalid Token" });
    }
});

module.exports = router;