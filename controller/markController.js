const supabase = require("../config/db");

// ১. ভিডিও লিংক সাবমিট করা (Updated for Table per Round)
const submitVideoLink = async (req, res) => {
    try {
        const { userId, videoLink, roundNumber } = req.body;
        const roundNum = parseInt(roundNumber);

        // লজিক: আমরা এখন স্পেসিফিক রাউন্ডের টেবিলে ভিডিও জমা নিব
        let table = '';
        if (roundNum === 2) table = 'round_2_selection';
        else if (roundNum === 3) table = 'round_3_final'; // যদি রাউন্ড ৩ তে ভিডিও থাকে
        else {
            return res.status(400).json({ success: false, message: "Invalid round for video submission." });
        }

        // চেক করা ইউজার ওই টেবিলে আদৌ আছে কি না (মানে সে প্রমোটেড কি না)
        const { data: userExists, error: checkError } = await supabase
            .from(table)
            .select('user_id, status')
            .eq('user_id', userId)
            .single();

        if (checkError || !userExists) {
            return res.status(403).json({ success: false, message: "You are not qualified for this round." });
        }

        // ভিডিও লিংক আপডেট করা
        const { error: updateError } = await supabase
            .from(table)
            .update({
                video_link: videoLink,
                status: 'submitted', // স্ট্যাটাস চেঞ্জ
                updated_at: new Date()
            })
            .eq('user_id', userId);

        if (updateError) throw updateError;

        res.status(200).json({ success: true, message: "Video link submitted successfully!" });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ২. জাজ স্কোর আপডেট (Updated for Table per Round)
const updateJudgeScore = async (req, res) => {
    try {
        const { userId, roundNumber, judgeScore } = req.body;
        const roundNum = parseInt(roundNumber);

        let table = '';
        if (roundNum === 2) table = 'round_2_selection';
        else if (roundNum === 3) table = 'round_3_final';
        else return res.status(400).json({ message: "Invalid Round" });

        // আগের স্কোর আনা (যদি লাগে টোটাল ক্যালকুলেশনের জন্য)
        // Round 2 এর ক্ষেত্রে শুধু judge_score টাই মেইন, অথবা quiz_score এর সাথে যোগ হতে পারে।
        // আপনার লজিক অনুযায়ী Round 2 তে jury_score আপডেট হবে।

        const { error } = await supabase
            .from(table)
            .update({
                jury_score: parseFloat(judgeScore),
                status: 'evaluated',
                updated_at: new Date()
            })
            .eq('user_id', userId);

        if (error) throw error;

        res.status(200).json({ success: true, message: "Judge score updated!" });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ৩. লিডারবোর্ড ভিউ (Dynamic Table Switching)
// ৩. লিডারবোর্ড ভিউ (Dynamic Table Switching) - FIXED PAGINATION
const getLeaderboard = async (req, res) => {
    try {
        const { roundNumber, category, page = 1, limit = 50 } = req.query;
        const roundNum = parseInt(roundNumber);

        // 🔥 FIX: String থেকে Integer এ কনভার্ট করা
        const pageInt = parseInt(page);
        const limitInt = parseInt(limit);

        // Pagination Logic (এখন যোগফল সঠিক হবে)
        const from = (pageInt - 1) * limitInt;
        const to = from + limitInt - 1;

        let query;

        // 🔥 রাউন্ড অনুযায়ী টেবিল সুইচিং
        if (roundNum === 1) {
            // Round 1: round_performances টেবিল
            query = supabase
                .from('round_performances')
                .select(`*, user_profiles!inner(name, profile_image_url, assigned_sdg_number)`, { count: 'exact' })
                .eq('round_number', 1)
                .order('quiz_score', { ascending: false })
                .order('time_taken', { ascending: true });
        }
        else if (roundNum === 2) {
            // Round 2: round_2_selection টেবিল
            query = supabase
                .from('round_2_selection')
                .select(`*, user_profiles!inner(name, profile_image_url, assigned_sdg_number)`, { count: 'exact' })
                .order('jury_score', { ascending: false });
        }
        else if (roundNum === 3) {
            // Round 3: round_3_final টেবিল
            query = supabase
                .from('round_3_final')
                .select(`*, user_profiles!inner(name, profile_image_url, assigned_sdg_number)`, { count: 'exact' })
                .order('total_calculated_score', { ascending: false });
        }

        // Category Filter (Common for all tables)
        if (category && category !== "All") {
            if (roundNum === 1) query = query.ilike('sdg_category', `%${category}%`);
            else query = query.eq('assigned_sdg_number', parseInt(category.replace("SDG ", "")));
        }

        // রেঞ্জ দিয়ে ডাটা স্লাইস করা
        const { data, error, count } = await query.range(from, to);

        if (error) {
            console.error("Fetch Error:", error);
            throw error;
        }

        res.status(200).json({
            success: true,
            data,
            total: count,
            page: pageInt,  // আপডেটেড পেজ নম্বর পাঠানো
            limit: limitInt // আপডেটেড লিমিট পাঠানো
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ৪. 🔥 AUTOMATIC PROMOTION SYSTEM (Handles Round 1 -> 2 AND Round 2 -> 3)
const promoteUsersByRanking = async (req, res) => {
    const { limit, roundNumber } = req.body;

    try {
        const currentRound = parseInt(roundNumber);
        const nextRound = currentRound + 1;
        const limitNum = parseInt(limit);

        let totalPromotedCount = 0;
        let promotionLog = [];

        // ১ থেকে ১৭ পর্যন্ত লুপ (SDG 1 to 17)
        for (let i = 1; i <= 17; i++) {

            let topUsers = [];

            // CASE 1: Round 1 -> 2
            if (currentRound === 1) {
                const { data, error } = await supabase
                    .from('round_performances')
                    .select(`user_id, quiz_score, time_taken, user_profiles!inner(assigned_sdg_number)`)
                    .eq('round_number', 1)
                    .eq('user_profiles.assigned_sdg_number', i)
                    .order('quiz_score', { ascending: false })
                    .order('time_taken', { ascending: true })
                    .limit(limitNum);

                if (error) console.error(`Error SDG ${i}:`, error.message);
                topUsers = data || [];
            }
            // CASE 2: Round 2 -> 3
            else if (currentRound === 2) {
                // সোর্স: round_2_selection
                const { data, error } = await supabase
                    .from('round_2_selection')
                    .select(`
                        user_id, jury_score, quiz_score, updated_at,
                        user_profiles!inner(assigned_sdg_number)
                    `)
                    .eq('assigned_sdg_number', i)
                    // .eq('status', 'evaluated') // আনকমেন্ট করতে পারেন যদি শুধু মার্ক করা খাতা নিতে চান
                    .order('jury_score', { ascending: false })   // ১. জুরি মার্ক হাই
                    .order('quiz_score', { ascending: false })   // ২. কুইজ মার্ক হাই
                    .order('updated_at', { ascending: true })    // ৩. সাবমিশন টাইম আগে
                    .limit(limitNum); // টপ ৩ জন

                if (error) console.error(`Error SDG ${i}:`, error.message);
                topUsers = data || [];
            }

            // COMMON ACTION
            if (topUsers.length > 0) {
                const qualifiedIds = topUsers.map(u => u.user_id);

                // Update Old Table Status
                if (currentRound === 1) {
                    await supabase.from('round_performances').update({ is_promoted: true }).in('user_id', qualifiedIds).eq('round_number', 1);
                } else if (currentRound === 2) {
                    await supabase.from('round_2_selection').update({ is_finalist: true, status: 'selected' }).in('user_id', qualifiedIds);
                }

                // Insert into New Table
                if (nextRound === 2) {
                    const round2Entries = topUsers.map(user => ({
                        user_id: user.user_id,
                        assigned_sdg_number: i,
                        quiz_score: user.quiz_score,
                        status: 'pending',
                        video_link: null,
                        jury_score: 0,
                        is_finalist: false
                    }));
                    await supabase.from('round_2_selection').upsert(round2Entries, { onConflict: 'user_id' });
                }
                else if (nextRound === 3) {
                    const round3Entries = topUsers.map((user, index) => ({
                        user_id: user.user_id,
                        total_calculated_score: user.jury_score || 0,
                        rank: index + 1,
                        presentation_score: 0
                    }));
                    await supabase.from('round_3_final').upsert(round3Entries, { onConflict: 'user_id' });
                }

                // Update User Profile
                await supabase
                    .from('user_profiles')
                    .update({ round_type: `round_${nextRound}` })
                    .in('user_id', qualifiedIds);

                totalPromotedCount += qualifiedIds.length;
                promotionLog.push(`SDG ${i}: ${qualifiedIds.length} -> Round ${nextRound}`);
            }
        }

        res.status(200).json({
            success: true,
            message: `Success! Promoted ${totalPromotedCount} users to Round ${nextRound}.`,
            details: promotionLog
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    submitVideoLink,
    updateJudgeScore,
    getLeaderboard,
    promoteUsersByRanking
};