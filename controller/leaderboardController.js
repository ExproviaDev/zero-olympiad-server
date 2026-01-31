const supabase = require('../config/db');

const getLeaderboardData = async (req, res) => {
    try {
        const { 
            round = 'round_1', 
            sdg, 
            page = 1, 
            limit = 20 
        } = req.query;

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query;

        // রাউন্ড অনুযায়ী আলাদা আলাদা লজিক
        if (round === 'round_1') {
            // রাউন্ড ১: কুইজ স্কোর (বেশি) + সময় (কম)
            query = supabase
                .from('round_1_initial')
                .select(`
                    id, quiz_score, time_taken,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .order('quiz_score', { ascending: false })
                .order('time_taken', { ascending: true });
        } 
        else if (round === 'round_2') {
            // রাউন্ড ২: শুধুমাত্র জুরি স্কোর (টাইম টেকেন নেই)
            query = supabase
                .from('round_2_selection')
                .select(`
                    id, jury_score,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .order('jury_score', { ascending: false });
        }
        else if (round === 'round_3') {
            // রাউন্ড ৩: ফাইনাল ক্যালকুলেটেড স্কোর
            query = supabase
                .from('round_3_final')
                .select(`
                    id, total_calculated_score,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .order('total_calculated_score', { ascending: false });
        }

        // SDG ফিল্টার (যদি থাকে)
        if (sdg && sdg !== "") {
            query = query.eq('user_profiles.assigned_sdg_number', sdg);
        }

        const { data, count, error } = await query.range(from, to);
        if (error) throw error;

        // ফ্রন্টএন্ডের জন্য ক্লিন ডাটা ফরম্যাট
        const formattedData = data.map((item, index) => ({
            rank: from + index + 1,
            name: item.user_profiles?.name,
            email: item.user_profiles?.email,
            institution: item.user_profiles?.institution,
            sdg: item.user_profiles?.assigned_sdg_number,
            image: item.user_profiles?.profile_image_url,
            // রাউন্ড অনুযায়ী ডাইনামিক স্কোর ফিল্ড
            score: round === 'round_1' ? item.quiz_score : (round === 'round_2' ? item.jury_score : item.total_calculated_score),
            time: round === 'round_1' ? item.time_taken : null // শুধু রাউন্ড ১ এ টাইম থাকবে
        }));

        res.status(200).json({ data: formattedData, total: count });

    } catch (err) {
        console.error("Leaderboard Error:", err.message);
        res.status(500).json({ message: "সার্ভারে সমস্যা হয়েছে।" });
    }
};

module.exports = { getLeaderboardData };