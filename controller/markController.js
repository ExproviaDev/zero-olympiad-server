const supabase = require("../config/db");
const sql = require("../config/pg");

const SDG_NAMES = [
    "No Poverty",
    "Zero Hunger",
    "Good Health and Well-being",
    "Quality Education",
    "Gender Equality",
    "Clean Water and Sanitation",
    "Affordable and Clean Energy",
    "Decent Work and Economic Growth",
    "Industry, Innovation and Infrastructure",
    "Reduced Inequalities",
    "Sustainable Cities and Communities",
    "Responsible Consumption and Production",
    "Climate Action",
    "Life Below Water",
    "Life on Land",
    "Peace, Justice and Strong Institutions",
    "Partnerships for the Goals",
];

const submitVideoLink = async (req, res) => {
    try {
        const { userId, videoLink, roundNumber } = req.body;
        const roundNum = parseInt(roundNumber);

        let table = '';
        if (roundNum === 2) table = 'round_2_selection';
        else if (roundNum === 3) table = 'round_3_final';
        else {
            return res.status(400).json({ success: false, message: "Invalid round for video submission." });
        }

        if (sql) {
            const tableIdent = sql(table);
            const rows = await sql`
                SELECT user_id FROM ${tableIdent} WHERE user_id = ${userId} LIMIT 1
            `;
            if (!rows[0]) {
                return res.status(403).json({ success: false, message: "You are not qualified for this round." });
            }

            await sql`
                UPDATE ${tableIdent}
                SET video_link = ${videoLink},
                    status = 'submitted',
                    updated_at = NOW()
                WHERE user_id = ${userId}
            `;
            return res.status(200).json({ success: true, message: "Video link submitted successfully!" });
        }

        const { data: userExists, error: checkError } = await supabase
            .from(table)
            .select('user_id, status')
            .eq('user_id', userId)
            .single();

        if (checkError || !userExists) {
            return res.status(403).json({ success: false, message: "You are not qualified for this round." });
        }

        const { error: updateError } = await supabase
            .from(table)
            .update({
                video_link: videoLink,
                status: 'submitted',
                updated_at: new Date(),
            })
            .eq('user_id', userId);

        if (updateError) throw updateError;

        res.status(200).json({ success: true, message: "Video link submitted successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const updateJudgeScore = async (req, res) => {
    try {
        const { userId, roundNumber, judgeScore } = req.body;
        const roundNum = parseInt(roundNumber);

        let table = '';
        if (roundNum === 2) table = 'round_2_selection';
        else if (roundNum === 3) table = 'round_3_final';
        else return res.status(400).json({ message: "Invalid Round" });

        const score = parseFloat(judgeScore);

        if (sql) {
            const tableIdent = sql(table);
            await sql`
                UPDATE ${tableIdent}
                SET jury_score = ${score},
                    status = 'evaluated',
                    updated_at = NOW()
                WHERE user_id = ${userId}
            `;
            return res.status(200).json({ success: true, message: "Judge score updated!" });
        }

        const { error } = await supabase
            .from(table)
            .update({
                jury_score: score,
                status: 'evaluated',
                updated_at: new Date(),
            })
            .eq('user_id', userId);

        if (error) throw error;

        res.status(200).json({ success: true, message: "Judge score updated!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getLeaderboard = async (req, res) => {
    try {
        const { roundNumber, sdgNumber, category, page = 1, limit = 50 } = req.query;
        const roundNum = parseInt(roundNumber);
        const pageInt = parseInt(page);
        const limitInt = parseInt(limit);

        let sdgNum = null;
        if (sdgNumber && sdgNumber !== "all") {
            sdgNum = parseInt(sdgNumber);
        } else if (category && category !== "All") {
            const idx = SDG_NAMES.findIndex(
                (n) => n.toLowerCase() === String(category).toLowerCase()
            );
            if (idx !== -1) sdgNum = idx + 1;
        }

        const offset = (pageInt - 1) * limitInt;

        if (sql) {
            let rows = [];

            if (roundNum === 1) {
                rows = await sql`
                    SELECT
                        rp.*,
                        json_build_object(
                            'name', up.name,
                            'profile_image_url', up.profile_image_url,
                            'assigned_sdg_number', up.assigned_sdg_number
                        ) AS user_profiles,
                        COUNT(*) OVER() AS total_count
                    FROM round_performances rp
                    INNER JOIN user_profiles up ON up.user_id = rp.user_id
                    WHERE rp.round_number = 1
                      AND (${sdgNum}::int IS NULL OR up.assigned_sdg_number = ${sdgNum})
                    ORDER BY rp.quiz_score DESC, rp.time_taken ASC
                    LIMIT ${limitInt} OFFSET ${offset}
                `;
            } else if (roundNum === 2) {
                rows = await sql`
                    SELECT
                        r2.*,
                        json_build_object(
                            'name', up.name,
                            'profile_image_url', up.profile_image_url,
                            'assigned_sdg_number', up.assigned_sdg_number
                        ) AS user_profiles,
                        COUNT(*) OVER() AS total_count
                    FROM round_2_selection r2
                    INNER JOIN user_profiles up ON up.user_id = r2.user_id
                    WHERE (${sdgNum}::int IS NULL OR r2.assigned_sdg_number = ${sdgNum})
                    ORDER BY r2.jury_score DESC
                    LIMIT ${limitInt} OFFSET ${offset}
                `;
            } else if (roundNum === 3) {
                rows = await sql`
                    SELECT
                        r3.*,
                        json_build_object(
                            'name', up.name,
                            'profile_image_url', up.profile_image_url,
                            'assigned_sdg_number', up.assigned_sdg_number
                        ) AS user_profiles,
                        COUNT(*) OVER() AS total_count
                    FROM round_3_final r3
                    INNER JOIN user_profiles up ON up.user_id = r3.user_id
                    WHERE (${sdgNum}::int IS NULL OR up.assigned_sdg_number = ${sdgNum})
                    ORDER BY r3.total_calculated_score DESC
                    LIMIT ${limitInt} OFFSET ${offset}
                `;
            }

            const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
            const data = rows.map((row) => {
                const { total_count, ...rest } = row;
                return rest;
            });

            return res.status(200).json({
                success: true,
                data,
                total,
                page: pageInt,
                limit: limitInt,
            });
        }

        const from = offset;
        const to = from + limitInt - 1;
        let query;

        if (roundNum === 1) {
            query = supabase
                .from('round_performances')
                .select(`*, user_profiles!inner(name, profile_image_url, assigned_sdg_number)`, { count: 'exact' })
                .eq('round_number', 1)
                .order('quiz_score', { ascending: false })
                .order('time_taken', { ascending: true });
            if (sdgNum) query = query.eq('user_profiles.assigned_sdg_number', sdgNum);
        } else if (roundNum === 2) {
            query = supabase
                .from('round_2_selection')
                .select(`*, user_profiles!inner(name, profile_image_url, assigned_sdg_number)`, { count: 'exact' })
                .order('jury_score', { ascending: false });
            if (sdgNum) query = query.eq('assigned_sdg_number', sdgNum);
        } else if (roundNum === 3) {
            query = supabase
                .from('round_3_final')
                .select(`*, user_profiles!inner(name, profile_image_url, assigned_sdg_number)`, { count: 'exact' })
                .order('total_calculated_score', { ascending: false });
            if (sdgNum) query = query.eq('user_profiles.assigned_sdg_number', sdgNum);
        }

        const { data, error, count } = await query.range(from, to);
        if (error) throw error;

        res.status(200).json({
            success: true,
            data,
            total: count,
            page: pageInt,
            limit: limitInt,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Promotion is multi-step write logic — kept on Supabase JS to minimize risk.
// Performance impact is low: this runs only at round transitions (admin action).
const promoteUsersByRanking = async (req, res) => {
    const { limit, roundNumber, sdgNumber } = req.body;

    try {
        const currentRound = parseInt(roundNumber);
        const nextRound = currentRound + 1;
        const limitNum = parseInt(limit);

        const targetSdgNum = sdgNumber ? parseInt(sdgNumber) : null;
        const sdgRange = targetSdgNum ? [targetSdgNum] : Array.from({ length: 17 }, (_, i) => i + 1);

        let totalPromotedCount = 0;
        const promotionLog = [];

        for (const i of sdgRange) {
            let topUsers = [];

            if (currentRound === 1) {
                const { data, error } = await supabase
                    .from('round_performances')
                    .select(`user_id, quiz_score, time_taken, user_profiles!inner(assigned_sdg_number)`)
                    .eq('round_number', 1)
                    .eq('user_profiles.assigned_sdg_number', i)
                    .order('quiz_score', { ascending: false })
                    .order('time_taken', { ascending: true })
                    .limit(limitNum);

                if (error) console.error(`[promote] SDG ${i} round 1 error:`, error.message);
                topUsers = data || [];
            } else if (currentRound === 2) {
                const { data, error } = await supabase
                    .from('round_2_selection')
                    .select(`
                        user_id, jury_score, quiz_score, updated_at,
                        user_profiles!inner(assigned_sdg_number)
                    `)
                    .eq('assigned_sdg_number', i)
                    .order('jury_score', { ascending: false })
                    .order('quiz_score', { ascending: false })
                    .order('updated_at', { ascending: true })
                    .limit(limitNum);

                if (error) console.error(`[promote] SDG ${i} round 2 error:`, error.message);
                topUsers = data || [];
            }

            if (topUsers.length === 0) {
                promotionLog.push(`SDG ${i}: 0 users (skipped)`);
                continue;
            }

            const qualifiedIds = topUsers.map((u) => u.user_id);

            if (currentRound === 1) {
                await supabase
                    .from('round_performances')
                    .update({ is_promoted: true })
                    .in('user_id', qualifiedIds)
                    .eq('round_number', 1);
            } else if (currentRound === 2) {
                await supabase
                    .from('round_2_selection')
                    .update({ is_finalist: true, status: 'selected' })
                    .in('user_id', qualifiedIds);
            }

            if (nextRound === 2) {
                const round2Entries = topUsers.map((user) => ({
                    user_id: user.user_id,
                    assigned_sdg_number: i,
                    quiz_score: user.quiz_score,
                    status: 'pending',
                    video_link: null,
                    jury_score: 0,
                    is_finalist: false,
                }));
                await supabase.from('round_2_selection').upsert(round2Entries, { onConflict: 'user_id' });
            } else if (nextRound === 3) {
                const round3Entries = topUsers.map((user, index) => ({
                    user_id: user.user_id,
                    total_calculated_score: user.jury_score || 0,
                    rank: index + 1,
                    presentation_score: 0,
                }));
                await supabase.from('round_3_final').upsert(round3Entries, { onConflict: 'user_id' });
            }

            await supabase
                .from('user_profiles')
                .update({ round_type: `round_${nextRound}` })
                .in('user_id', qualifiedIds);

            totalPromotedCount += qualifiedIds.length;
            promotionLog.push(`SDG ${i}: ${qualifiedIds.length} promoted → Round ${nextRound}`);
        }

        const scope = targetSdgNum ? `SDG ${targetSdgNum}` : "All SDGs";
        res.status(200).json({
            success: true,
            message: `Success! Promoted ${totalPromotedCount} users from ${scope} to Round ${nextRound}.`,
            details: promotionLog,
        });
    } catch (error) {
        console.error("[promoteUsersByRanking]", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    submitVideoLink,
    updateJudgeScore,
    getLeaderboard,
    promoteUsersByRanking,
};
