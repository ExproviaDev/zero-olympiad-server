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
        const t0 = Date.now();

        const [
            enrolmentResult,
            participantResult,
            secondRoundResult,
            finalistResult,
            sdgResult
        ] = await Promise.all([
            supabase
                .from('user_profiles')
                .select('*', { count: 'exact', head: true }),
            supabase
                .from('user_profiles')
                .select('*', { count: 'exact', head: true })
                .eq('is_participated', true),
            supabase
                .from('round_2_selection')
                .select('*', { count: 'exact', head: true }),
            supabase
                .from('round_2_selection')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'selected'),
            supabase.rpc('get_sdg_stats')
        ]);

        const { count: totalEnrolment, error: enrolmentError } = enrolmentResult;
        if (enrolmentError) throw enrolmentError;

        const { count: totalParticipant, error: participantError } = participantResult;
        if (participantError) throw participantError;

        const { count: secondRoundCount, error: secondRoundError } = secondRoundResult;
        if (secondRoundError) throw secondRoundError;

        const { count: finalistCount, error: finalistError } = finalistResult;
        if (finalistError) throw finalistError;

        let sdgStats = [];
        let usedSdgFallback = false;
        const { data: rpcStats, error: sdgError } = sdgResult;

        if (!sdgError && Array.isArray(rpcStats)) {
            // RPC data may come as {sdg_number, registration_count} shape
            sdgStats = rpcStats.map((row) => ({
                label: row?.label || `SDG ${row?.sdg_number}`,
                total: row?.total ?? row?.registration_count ?? 0,
            }));
        } else {
            // Fallback: compute SDG registrations from user_profiles
            usedSdgFallback = true;
            console.warn("get_sdg_stats RPC unavailable, using fallback aggregation:", sdgError?.message);
            const { data: profileRows, error: profileAggError } = await supabase
                .from('user_profiles')
                .select('assigned_sdg_number');

            if (profileAggError) throw profileAggError;

            const sdgCountMap = {};
            for (let i = 1; i <= 17; i++) {
                sdgCountMap[i] = 0;
            }

            (profileRows || []).forEach((row) => {
                const sdgNumber = Number(row?.assigned_sdg_number);
                if (Number.isInteger(sdgNumber) && sdgNumber >= 1 && sdgNumber <= 17) {
                    sdgCountMap[sdgNumber] += 1;
                }
            });

            sdgStats = Object.entries(sdgCountMap).map(([sdgNumber, count]) => ({
                label: `SDG ${sdgNumber}`,
                total: count,
                sdg_number: Number(sdgNumber),
                registration_count: count
            }));
        }

        console.log("[admin/dashboard-stats]", {
            total_ms: Date.now() - t0,
            sdg_fallback: usedSdgFallback,
        });

        // ৩. রেসপন্স পাঠানো
        res.status(200).json({
            total_enrolment: totalEnrolment || 0,
            total_participant: totalParticipant || 0,
            second_round_students: secondRoundCount || 0,
            total_finalists: finalistCount || 0,
            sdg_registrations: sdgStats || []
        });

    } catch (err) {
        console.error("Dashboard Stats Error:", err.message);
        res.status(500).json({ error: "Failed to fetch dashboard stats." });
    }
};


// adminController.js a add korun
const getMarketingUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20; // 20 jon kore
        const search = req.query.search?.trim() || ''; // Search keyword

        if (search.length > 100) {
            return res.status(400).json({ error: "Search too long" });
        }

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Base query with exact count
        let query = supabase
            .from('user_profiles')
            .select('name, email, phone, signup_source, created_at', { count: 'exact' });

        // 🔥 Partial Search Logic (face likhle facebook pabe)
        if (search) {
            const sanitized = search.replace(/[%_]/g, '\\$&');
            query = query.ilike('signup_source', `%${sanitized}%`);
        }

        // Pagination & Sorting (Notun ra age ashbe)
        const { data, count, error } = await query
            .range(from, to)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json({
            success: true,
            data,
            totalUsers: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });

    } catch (err) {
        console.error("Marketing Users Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
const getMarketingStats = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('signup_source');

        if (error) throw error;

        // ডিফল্ট সোর্সগুলো (যাতে ০ দেখায়)
        const expectedSources = ['Organic', 'Facebook', 'Mojaru', 'Instagram', 'Google', 'YouTube', 'Chorcha'];
        const sourceCounts = {};
        
        expectedSources.forEach(source => {
            sourceCounts[source.toLowerCase()] = { displayName: source, count: 0 };
        });

        data.forEach(user => {
            let rawSource = user.signup_source ? user.signup_source.trim() : 'Organic';
            let lowerSource = rawSource.toLowerCase();

            if (sourceCounts[lowerSource]) {
                sourceCounts[lowerSource].count += 1;
            } else {
                sourceCounts[lowerSource] = { displayName: rawSource, count: 1 };
            }
        });

        const formattedData = Object.values(sourceCounts)
            .map(item => ({ source: item.displayName, count: item.count }))
            .sort((a, b) => b.count - a.count);

        res.status(200).json({ success: true, data: formattedData });

    } catch (err) {
        console.error("Marketing Stats Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
// Search a participant by email — returns lean profile info for the reset UI
const searchParticipant = async (req, res) => {
    const { email } = req.query;
    if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    try {
        const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('user_id, name, email, role, sdg_role, is_participated, round_type, assigned_sdg_number')
            .ilike('email', email.trim())
            .maybeSingle();

        if (error) throw error;
        if (!profile) return res.status(404).json({ success: false, error: 'No participant found with that email.' });

        const { count: submissionCount } = await supabase
            .from('quiz_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', profile.user_id);

        res.status(200).json({ success: true, data: { ...profile, submission_count: submissionCount || 0 } });
    } catch (err) {
        console.error('searchParticipant error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Reset a participant's quiz data so they can retake the quiz.
// Clears: quiz_submissions, resets is_participated + round_1_initial score.
const resetParticipant = async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ success: false, error: 'user_id is required.' });

    try {
        // Verify user exists before touching anything
        const { data: profile, error: profileFetchError } = await supabase
            .from('user_profiles')
            .select('user_id, name, email')
            .eq('user_id', user_id)
            .single();

        if (profileFetchError || !profile) {
            return res.status(404).json({ success: false, error: 'Participant not found.' });
        }

        const errors = [];

        // 1. Delete all quiz submissions for this user
        const { error: subError } = await supabase
            .from('quiz_submissions')
            .delete()
            .eq('user_id', user_id);
        if (subError) errors.push(`quiz_submissions: ${subError.message}`);

        // 2. Reset is_participated flag on user_profiles
        const { error: profileError } = await supabase
            .from('user_profiles')
            .update({ is_participated: false })
            .eq('user_id', user_id);
        if (profileError) errors.push(`user_profiles: ${profileError.message}`);

        // 3. Reset round_1_initial score/qualification
        const { error: round1Error } = await supabase
            .from('round_1_initial')
            .update({ quiz_score: 0, is_qualified: false })
            .eq('user_id', user_id);
        // round_1_initial row might not exist for all users — treat as non-fatal
        if (round1Error && round1Error.code !== 'PGRST116') {
            errors.push(`round_1_initial: ${round1Error.message}`);
        }

        // 4. Delete from round_performances — this is what the leaderboard reads from.
        // Without this step the user stays visible on the leaderboard even after reset.
        const { error: rpError } = await supabase
            .from('round_performances')
            .delete()
            .eq('user_id', user_id);
        if (rpError) errors.push(`round_performances: ${rpError.message}`);

        if (errors.length > 0) {
            console.error('[resetParticipant] partial errors:', errors);
            return res.status(500).json({
                success: false,
                error: `Reset partially failed: ${errors.join(' | ')}`,
            });
        }

        console.log(`[resetParticipant] reset OK for user_id=${user_id} (${profile.email})`);
        res.status(200).json({
            success: true,
            message: `Quiz data reset for ${profile.name} (${profile.email}). They can now retake the quiz.`,
        });
    } catch (err) {
        console.error('resetParticipant error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    getCompetitionSettings,
    updateCompetitionSettings,
    getRound2Submissions,
    submitJuryScore,
    getDashboardStats,
    getMarketingUsers,
    getMarketingStats,
    searchParticipant,
    resetParticipant,
};