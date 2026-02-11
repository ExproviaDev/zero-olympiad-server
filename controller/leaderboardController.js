const supabase = require('../config/db');

const getLeaderboardStatus = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('competition_settings')
            .select('is_leaderboard_public')
            .eq('id', 1)
            .single();
            
        if (error) throw error;
        
        res.status(200).json({ success: true, is_public: data.is_leaderboard_public });
    } catch (error) {
        res.status(500).json({ success: false, is_public: false });
    }
};

const getLeaderboardData = async (req, res) => {
    try {
        const { 
            round = 'round_1', 
            sdg, 
            page = 1, 
            limit = 20 
        } = req.query;

        // 🔥 FIX: String থেকে Integer এ কনভার্ট করা হচ্ছে
        const pageInt = parseInt(page);
        const limitInt = parseInt(limit);

        // Safety Check
        const validRounds = ['round_1', 'round_2', 'round_3'];
        if (!validRounds.includes(round)) {
            return res.status(400).json({ success: false, message: "Invalid Round Selected" });
        }

        // ক্যালকুলেশন এখন সঠিক হবে
        const from = (pageInt - 1) * limitInt;
        const to = from + limitInt - 1;

        let query;

        // রাউন্ড অনুযায়ী লজিক
        if (round === 'round_1') {
            query = supabase
                .from('round_performances') 
                .select(`
                    id, quiz_score, time_taken,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .eq('round_number', 1)
                .order('quiz_score', { ascending: false })
                .order('time_taken', { ascending: true });
        } 
        else if (round === 'round_2') {
            query = supabase
                .from('round_2_selection')
                .select(`
                    id, jury_score, quiz_score, updated_at,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .order('jury_score', { ascending: false })
                .order('quiz_score', { ascending: false })
                .order('updated_at', { ascending: true });
        }
        else if (round === 'round_3') {
            query = supabase
                .from('round_3_final')
                .select(`
                    id, total_calculated_score,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .order('total_calculated_score', { ascending: false });
        }

        // SDG ফিল্টার
        if (sdg && sdg !== "All" && sdg !== "") {
            const sdgNum = parseInt(sdg.toString().replace("SDG ", ""));
            if (!isNaN(sdgNum)) {
                query = query.eq('user_profiles.assigned_sdg_number', sdgNum);
            }
        }

        // Range দিয়ে ডাটা স্লাইস করা
        const { data, count, error } = await query.range(from, to);
        
        if (error) throw error;

        const formattedData = data.map((item, index) => ({
            rank: from + index + 1,
            name: item.user_profiles?.name,
            email: item.user_profiles?.email,
            institution: item.user_profiles?.institution,
            sdg: item.user_profiles?.assigned_sdg_number,
            image: item.user_profiles?.profile_image_url,
            score: round === 'round_1' ? item.quiz_score : (round === 'round_2' ? item.jury_score : item.total_calculated_score),
            time: round === 'round_1' ? item.time_taken : null
        }));

        res.status(200).json({ 
            success: true, 
            data: formattedData, 
            total: count,
            page: pageInt,   // আপডেটেড পেজ পাঠানো হলো
            limit: limitInt  // আপডেটেড লিমিট পাঠানো হলো
        });

    } catch (err) {
        console.error("Leaderboard Error:", err.message);
        res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
    }
};

module.exports = { getLeaderboardData, getLeaderboardStatus };