const supabase = require('../config/db');
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


const updateCompetitionSettings = async (req, res) => {
    try {
        const {
            current_active_round,
            is_leaderboard_public, // 🔥 নতুন ফিল্ড
            round_1_start, round_1_end, round_1_has_quiz, round_1_has_video,
            round_2_start, round_2_end, round_2_has_quiz, round_2_has_video,
            round_3_start, round_3_end, round_3_has_quiz, round_3_has_video
        } = req.body;

        const { data, error } = await supabase
            .from('competition_settings')
            .update({
                current_active_round,
                is_leaderboard_public, // 🔥 আপডেট লজিক
                round_1_start, round_1_end, round_1_has_quiz, round_1_has_video,
                round_2_start, round_2_end, round_2_has_quiz, round_2_has_video,
                round_3_start, round_3_end, round_3_has_quiz, round_3_has_video,
                updated_at: new Date().toISOString()
            })
            .eq('id', 1);

        if (error) throw error;

        res.status(200).json({ success: true, message: "Settings Updated", data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const getRound2Submissions = async (req, res) => {
    try {
        const { sdg_number, status, page = 1, limit = 10 } = req.query;
        const pageInt = parseInt(page);
        const limitInt = parseInt(limit);
        const from = (pageInt - 1) * limitInt;
        const to = from + limitInt - 1;

        let query = supabase
            .from('round_2_selection')
            .select(`
                id,
                video_link,
                jury_score,
                score_details, 
                jury_comments,
                status,
                updated_at,
                user_profiles!inner (
                    name,
                    email,
                    institution,
                    assigned_sdg_number
                )
            `, { count: 'exact' });
        // 👆 'score_details' যোগ করা হয়েছে যাতে এডিট করার সময় আগের ডাটা লোড হয়

        // ১. SDG ফিল্টার
        if (sdg_number) {
            query = query.eq('user_profiles.assigned_sdg_number', sdg_number);
        }

        // ২. স্ট্যাটাস ফিল্টার
        if (status === 'evaluated') {
            // 'evaluated' অথবা 'reviewed' স্ট্যাটাস চেক করা হচ্ছে
            query = query.neq('status', 'pending');
        } else {
            query = query.eq('status', 'pending');
        }

        // ৩. প্যাজিনেশন এবং সর্টিং
        query = query
            .order('updated_at', { ascending: false })
            .range(from, to);

        const { data, error, count } = await query;

        if (error) throw error;

        res.status(200).json({
            data,
            total: count,
            page: parseInt(page),
            limit: parseInt(limit)
        });

    } catch (err) {
        console.error("Jury Fetch Error:", err.message);
        res.status(500).json({ message: "Jury Fetch Error" });
    }
};

const submitJuryScore = async (req, res) => {
    const { submission_id, score_details, comments } = req.body;

    if (!submission_id || !score_details) {
        return res.status(400).json({ message: "Submission ID and Score Details are required." });
    }

    try {
        const calculatedTotal = Object.values(score_details).reduce((acc, val) => acc + parseFloat(val || 0), 0);
        const { data, error } = await supabase
            .from('round_2_selection')
            .update({
                jury_score: calculatedTotal,      // মোট স্কোর (0-100)
                score_details: score_details,     // ১০টি পয়েন্টের বিস্তারিত (JSON)
                jury_comments: comments,
                status: 'evaluated',              // স্ট্যাটাস চেঞ্জ
                updated_at: new Date().toISOString()
            })
            .eq('id', submission_id);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: "Mark updated successfully.",
            total_score: calculatedTotal
        });

    } catch (err) {
        console.error("Submit Score Error:", err.message);
        res.status(500).json({ message: "Failed to update mark" });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const { count: totalEnrolment } = await supabase
            .from('user_profiles')
            .select('*', { count: 'exact', head: true });

        const { count: totalParticipant } = await supabase
            .from('user_profiles')
            .select('*', { count: 'exact', head: true })
            .eq('is_participated', true); // 🔥 নতুন কন্ডিশন

        const { count: secondRoundCount } = await supabase
            .from('round_2_selection')
            .select('*', { count: 'exact', head: true });

        const { count: finalistCount } = await supabase
            .from('round_2_selection')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'selected');

        const { data: sdgStats, error: sdgError } = await supabase.rpc('get_sdg_stats');

        if (sdgError) throw sdgError;

        // ৩. রেসপন্স পাঠানো
        res.status(200).json({
            total_enrolment: totalEnrolment || 0,
            total_participant: totalParticipant || 0,
            second_round_students: secondRoundCount || 0,
            total_finalists: finalistCount || 0,
            sdg_registrations: sdgStats // সরাসরি ডাটাবেস থেকে আসা সঠিক লিস্ট
        });

    } catch (err) {
        console.error("Dashboard Stats Error:", err.message);
        res.status(500).json({ error: "Failed to fetch dashboard stats." });
    }
};
module.exports = {
    getCompetitionSettings,
    updateCompetitionSettings,
    getRound2Submissions,
    submitJuryScore,
    getDashboardStats
};