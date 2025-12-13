const express = require('express');
const supabase = require('../config/db');
const router = express.Router();


router.post('/register', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            console.error("Supabase Auth Error:", error.message);
            return res.status(400).json({ message: error.message });
        }

        res.status(201).json({ 
            message: "Registration successful! Please check your email for verification.",
            user: data.user
        });

    } catch (err) {
        console.error("Server Registration Error:", err);
        res.status(500).json({ message: 'Internal server error occurred during registration.' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    try {

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
        
            console.error("Supabase Login Error:", error.message);
            return res.status(401).json({ message: error.message });
        }
        
        res.status(200).json({ 
            message: "Login successful!",
            session: data.session, 
            user: data.user
        });

    } catch (err) {
        console.error("Server Login Error:", err);
        res.status(500).json({ message: 'Internal server error occurred during login.' });
    }
});

module.exports = router;
