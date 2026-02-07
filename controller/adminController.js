const supabase = require('../config/db');

// ১. কম্পিটিশন সেটিংস নিয়ে আসা
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
            .eq('id', 1);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: "সব রাউন্ডের সেটিংস সফলভাবে আপডেট হয়েছে।",
            data
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ৩. জুরিদের জন্য রাউন্ড ২-এর ইউজার লিস্ট (আপডেটেড)
const getRound2Submissions = async (req, res) => {
    try {
        const { sdg_number, status, page = 1, limit = 10 } = req.query;

        // Pagination Logic
        const from = (page - 1) * limit;
        const to = from + limit - 1;

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
        res.status(500).json({ message: "ডাটা লোড করতে সমস্যা হয়েছে।" });
    }
};

// ৪. জুরি মার্ক এবং কমেন্ট আপডেট করা (আপডেটেড - অটোমেটিক টোটাল ক্যালকুলেশন)
const submitJuryScore = async (req, res) => {
    // ফ্রন্টএন্ড থেকে score_details অবজেক্ট আসবে
    const { submission_id, score_details, comments } = req.body;

    if (!submission_id || !score_details) {
        return res.status(400).json({ message: "Submission ID and Score Details are required." });
    }

    try {
        // ১. সার্ভার সাইডে টোটাল মার্ক ক্যালকুলেট করা (সিকিউরিটির জন্য)
        // score_details দেখতে এমন হবে: { "Creativity": 8, "Technical": 9, ... }
        const calculatedTotal = Object.values(score_details).reduce((acc, val) => acc + parseFloat(val || 0), 0);

        // ২. ডাটাবেস আপডেট
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
            message: "মার্ক সফলভাবে সেভ হয়েছে।",
            total_score: calculatedTotal
        });

    } catch (err) {
        console.error("Submit Score Error:", err.message);
        res.status(500).json({ message: "মার্ক আপডেট করা সম্ভব হয়নি।" });
    }
};

// ৫. ড্যাশবোর্ড স্ট্যাটস
const getDashboardStats = async (req, res) => {
    try {
        const { count: totalEnrolment } = await supabase
            .from('user_profiles')
            .select('*', { count: 'exact', head: true });

        const { count: totalParticipant } = await supabase
            .from('user_profiles')
            .select('*', { count: 'exact', head: true })
            .not('assigned_sdg_number', 'is', null);

        const { count: secondRoundCount } = await supabase
            .from('round_2_selection')
            .select('*', { count: 'exact', head: true });

        const { count: finalistCount } = await supabase
            .from('round_2_selection')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'selected');

        const { data: sdgStatsData, error: sdgError } = await supabase
            .from('user_profiles')
            .select('assigned_sdg_number');

        if (sdgError) throw sdgError;

        const sdgCounts = {};
        for (let i = 1; i <= 17; i++) sdgCounts[i] = 0;

        sdgStatsData.forEach(user => {
            if (user.assigned_sdg_number) {
                sdgCounts[user.assigned_sdg_number] = (sdgCounts[user.assigned_sdg_number] || 0) + 1;
            }
        });

        const sdg_registrations = Object.keys(sdgCounts).map(key => ({
            label: `SDG ${key}`,
            total: sdgCounts[key]
        }));

        res.status(200).json({
            total_enrolment: totalEnrolment || 0,
            total_participant: totalParticipant || 0,
            second_round_students: secondRoundCount || 0,
            total_finalists: finalistCount || 0,
            sdg_registrations: sdg_registrations
        });

    } catch (err) {
        console.error("Dashboard Stats Error:", err.message);
        res.status(500).json({ error: "ড্যাশবোর্ড ডাটা আনতে সমস্যা হয়েছে।" });
    }
};

module.exports = {
    getCompetitionSettings,
    updateCompetitionSettings,
    getRound2Submissions,
    submitJuryScore,
    getDashboardStats
};