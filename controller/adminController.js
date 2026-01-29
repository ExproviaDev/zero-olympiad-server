const supabase = require('../config/db');

// ১. কম্পিটিশন সেটিংস নিয়ে আসা
const getCompetitionSettings = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('competition_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) throw error;
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ২. কম্পিটিশন সেটিংস আপডেট করা
const updateCompetitionSettings = async (req, res) => {
    try {
        const {
            current_active_round,
            round_1_start, round_1_end, round_1_has_quiz, round_1_has_video,
            round_2_start, round_2_end, round_2_has_quiz, round_2_has_video,
            round_3_start, round_3_end, round_3_has_quiz, round_3_has_video
        } = req.body;

        const { data, error } = await supabase
            .from('competition_settings')
            .update({
                current_active_round,
                round_1_start, round_1_end, round_1_has_quiz, round_1_has_video,
                round_2_start, round_2_end, round_2_has_quiz, round_2_has_video,
                round_3_start, round_3_end, round_3_has_quiz, round_3_has_video,
                updated_at: new Date().toISOString()
            })
            .eq('id', 1); // তোমার টেবিলে আইডি ১ এর রো-কে আপডেট করবে

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: "সব রাউন্ডের সেটিংস সফলভাবে আপডেট হয়েছে।",
            data
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

// ৩. জুরিদের জন্য রাউন্ড ২-এর ইউজার লিস্ট
const getRound2Submissions = async (req, res) => {
    try {
        const { sdg_number } = req.query;

        let query = supabase
            .from('round_2_selection')
            .select(`
                id,
                video_link,
                jury_score,
                jury_comments,
                status,
                user_profiles!inner (
                    name,
                    email,
                    institution,
                    assigned_sdg_number
                )
            `);

        // SDG নাম্বার থাকলে ফিল্টার করবে
        if (sdg_number) {
            query = query.eq('user_profiles.assigned_sdg_number', sdg_number);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.status(200).json(data);
    } catch (err) {
        console.error("Jury Fetch Error:", err.message);
        res.status(500).json({ message: "ডাটা লোড করতে সমস্যা হয়েছে।" });
    }
};

// ৪. জুরি মার্ক এবং কমেন্ট আপডেট করা
const submitJuryScore = async (req, res) => {
    const { submission_id, score, comments, status } = req.body;

    try {
        const { data, error } = await supabase
            .from('round_2_selection')
            .update({
                jury_score: score,
                jury_comments: comments,
                status: status || 'reviewed'
            })
            .eq('id', submission_id);

        if (error) throw error;
        res.status(200).json({ message: "মার্ক সফলভাবে সেভ হয়েছে।" });
    } catch (err) {
        console.error("Submit Score Error:", err.message);
        res.status(500).json({ message: "মার্ক আপডেট করা সম্ভব হয়নি।" });
    }
};

// সব ফাংশন একসাথে এক্সপোর্ট
module.exports = {
    getCompetitionSettings,
    updateCompetitionSettings,
    getRound2Submissions,
    submitJuryScore
};