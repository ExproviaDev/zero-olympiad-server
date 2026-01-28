const supabase = require("../config/db");

// ১. ভিডিও লিংক সাবমিট করা (শুধুমাত্র আগের রাউন্ডে প্রমোটেড হলে পারবে)
const submitVideoLink = async (req, res) => {
    try {
        const { userId, quizId, videoLink, roundNumber, sdgCategory } = req.body;

        // রাউন্ড ২ বা তার বেশি হলে চেক করা হবে ইউজার প্রমোটেড কি না
        if (roundNumber > 1) {
            const { data: qualification } = await supabase
                .from('round_performances')
                .select('is_promoted')
                .eq('user_id', userId)
                .eq('round_number', roundNumber - 1)
                .single();

            if (!qualification || !qualification.is_promoted) {
                return res.status(403).json({ success: false, message: "You are not qualified for this round yet." });
            }
        }

        const { data, error } = await supabase
            .from('round_performances')
            .upsert({
                user_id: userId,
                quiz_set_id: quizId,
                video_link: videoLink,
                round_number: roundNumber,
                sdg_category: sdgCategory // প্রোফাইল থেকে আসা ক্যাটাগরি
            })
            .select();

        if (error) throw error;
        res.status(200).json({ success: true, message: "Video link submitted successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ২. জাজ স্কোর আপডেট করা (Judge Score + Quiz Score = Total Score)
const updateJudgeScore = async (req, res) => {
    try {
        const { userId, roundNumber, judgeScore } = req.body;

        const { data: performance } = await supabase
            .from('round_performances')
            .select('quiz_score')
            .eq('user_id', userId)
            .eq('round_number', roundNumber)
            .single();

        const totalScore = (performance?.quiz_score || 0) + parseFloat(judgeScore);

        const { error } = await supabase
            .from('round_performances')
            .update({
                judge_score: judgeScore,
                total_calculated_score: totalScore
            })
            .eq('user_id', userId)
            .eq('round_number', roundNumber);

        if (error) throw error;
        res.status(200).json({ success: true, message: "Judge score updated and total recalculated!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ৩. লিডারবোর্ড ফেচ করা (Round এবং SDG Category দিয়ে ফিল্টার)
const getLeaderboard = async (req, res) => {
    try {
        const { roundNumber, category } = req.query;

        let query = supabase
            .from('round_performances')
            .select(`
                *,
                user_profiles!user_id ( 
                    name, 
                    profile_image_url 
                )
            `)
            .eq('round_number', roundNumber);

        // যদি ক্যাটাগরি 'All' না হয় তবে ফিল্টার যোগ হবে
        if (category && category !== "All") {
            query = query.eq('sdg_category', category);
        }

        const { data, error } = await query.order('total_calculated_score', { ascending: false });

        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const setPassMarkAndPromote = async (req, res) => {
    const { passMark, category, roundNumber } = req.body;

    try {
        const { data: participants, error: fetchErr } = await supabase
            .from('round_performances')
            .select('user_id, total_calculated_score')
            .eq('round_number', roundNumber)
            .eq('sdg_category', category);

        if (fetchErr) throw fetchErr;
        const qualifiedIds = participants
            .filter(p => p.total_calculated_score >= passMark)
            .map(p => p.user_id);

        if (qualifiedIds.length > 0) {
            await supabase
                .from('round_performances')
                .update({ is_promoted: true })
                .in('user_id', qualifiedIds)
                .eq('round_number', roundNumber);
            await supabase
                .from('user_profiles')
                .update({ round_type: `round_${roundNumber + 1}` })
                .in('user_id', qualifiedIds);
            const nextRoundEntries = qualifiedIds.map(id => ({
                user_id: id,
                round_number: roundNumber + 1,
                sdg_category: category,
                is_promoted: false
            }));

            await supabase
                .from('round_performances')
                .upsert(nextRoundEntries, { onConflict: 'user_id, round_number' });
        }

        res.status(200).json({ success: true, message: `${qualifiedIds.length} users promoted to next round!` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    submitVideoLink,
    updateJudgeScore,
    getLeaderboard,
    setPassMarkAndPromote
};