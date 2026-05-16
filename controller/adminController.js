const supabase = require('../config/db');
const sql = require('../config/pg');

const getCompetitionSettings = async (req, res) => {
    try {
        if (sql) {
            const rows = await sql`
                SELECT * FROM competition_settings WHERE id = 1 LIMIT 1
            `;
            if (!rows[0]) return res.status(404).json({ error: 'Settings not found' });
            return res.status(200).json(rows[0]);
        }

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
            is_leaderboard_public,
            round_1_start, round_1_end, round_1_has_quiz, round_1_has_video,
            round_2_start, round_2_end, round_2_has_quiz, round_2_has_video,
            round_3_start, round_3_end, round_3_has_quiz, round_3_has_video,
        } = req.body;

        if (sql) {
            await sql`
                UPDATE competition_settings
                SET current_active_round = ${current_active_round},
                    is_leaderboard_public = ${is_leaderboard_public},
                    round_1_start = ${round_1_start},
                    round_1_end = ${round_1_end},
                    round_1_has_quiz = ${round_1_has_quiz},
                    round_1_has_video = ${round_1_has_video},
                    round_2_start = ${round_2_start},
                    round_2_end = ${round_2_end},
                    round_2_has_quiz = ${round_2_has_quiz},
                    round_2_has_video = ${round_2_has_video},
                    round_3_start = ${round_3_start},
                    round_3_end = ${round_3_end},
                    round_3_has_quiz = ${round_3_has_quiz},
                    round_3_has_video = ${round_3_has_video},
                    updated_at = NOW()
                WHERE id = 1
            `;
            return res.status(200).json({ success: true, message: "Settings Updated" });
        }

        const { data, error } = await supabase
            .from('competition_settings')
            .update({
                current_active_round,
                is_leaderboard_public,
                round_1_start, round_1_end, round_1_has_quiz, round_1_has_video,
                round_2_start, round_2_end, round_2_has_quiz, round_2_has_video,
                round_3_start, round_3_end, round_3_has_quiz, round_3_has_video,
                updated_at: new Date().toISOString(),
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
        const offset = (pageInt - 1) * limitInt;

        if (sql) {
            const sdgFilter = sdg_number ? parseInt(sdg_number) : null;
            const isPending = status !== 'evaluated';

            const rows = await sql`
                SELECT
                    r2.id,
                    r2.video_link,
                    r2.jury_score,
                    r2.score_details,
                    r2.jury_comments,
                    r2.status,
                    r2.updated_at,
                    json_build_object(
                        'name', up.name,
                        'email', up.email,
                        'institution', up.institution,
                        'assigned_sdg_number', up.assigned_sdg_number
                    ) AS user_profiles,
                    COUNT(*) OVER() AS total_count
                FROM round_2_selection r2
                INNER JOIN user_profiles up ON up.user_id = r2.user_id
                WHERE (${sdgFilter}::int IS NULL OR up.assigned_sdg_number = ${sdgFilter})
                  AND (
                    (${isPending}::boolean = TRUE AND r2.status = 'pending')
                    OR
                    (${isPending}::boolean = FALSE AND r2.status <> 'pending')
                  )
                ORDER BY r2.updated_at DESC
                LIMIT ${limitInt} OFFSET ${offset}
            `;

            const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
            const data = rows.map(({ total_count, ...rest }) => rest);

            return res.status(200).json({
                data,
                total,
                page: pageInt,
                limit: limitInt,
            });
        }

        const from = offset;
        const to = from + limitInt - 1;
        let query = supabase
            .from('round_2_selection')
            .select(`
                id, video_link, jury_score, score_details, jury_comments, status, updated_at,
                user_profiles!inner (name, email, institution, assigned_sdg_number)
            `, { count: 'exact' });

        if (sdg_number) {
            query = query.eq('user_profiles.assigned_sdg_number', sdg_number);
        }
        if (status === 'evaluated') {
            query = query.neq('status', 'pending');
        } else {
            query = query.eq('status', 'pending');
        }

        query = query.order('updated_at', { ascending: false }).range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        res.status(200).json({
            data,
            total: count,
            page: pageInt,
            limit: limitInt,
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
        const calculatedTotal = Object.values(score_details).reduce(
            (acc, val) => acc + parseFloat(val || 0),
            0,
        );

        if (sql) {
            await sql`
                UPDATE round_2_selection
                SET jury_score = ${calculatedTotal},
                    score_details = ${sql.json(score_details)},
                    jury_comments = ${comments},
                    status = 'evaluated',
                    updated_at = NOW()
                WHERE id = ${submission_id}
            `;
            return res.status(200).json({
                success: true,
                message: "Mark updated successfully.",
                total_score: calculatedTotal,
            });
        }

        const { error } = await supabase
            .from('round_2_selection')
            .update({
                jury_score: calculatedTotal,
                score_details,
                jury_comments: comments,
                status: 'evaluated',
                updated_at: new Date().toISOString(),
            })
            .eq('id', submission_id);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: "Mark updated successfully.",
            total_score: calculatedTotal,
        });
    } catch (err) {
        console.error("Submit Score Error:", err.message);
        res.status(500).json({ message: "Failed to update mark" });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const t0 = Date.now();

        if (sql) {
            // Five queries in parallel — much faster than Supabase JS sequential counts.
            const [
                enrolmentRows,
                participantRows,
                secondRoundRows,
                finalistRows,
                sdgRows,
            ] = await Promise.all([
                sql`SELECT COUNT(*)::int AS c FROM user_profiles`,
                sql`SELECT COUNT(*)::int AS c FROM user_profiles WHERE is_participated = true`,
                sql`SELECT COUNT(*)::int AS c FROM round_2_selection`,
                sql`SELECT COUNT(*)::int AS c FROM round_2_selection WHERE status = 'selected'`,
                sql`
                    SELECT assigned_sdg_number AS sdg_number, COUNT(*)::int AS registration_count
                    FROM user_profiles
                    WHERE assigned_sdg_number BETWEEN 1 AND 17
                    GROUP BY assigned_sdg_number
                `,
            ]);

            const sdgCountMap = {};
            for (let i = 1; i <= 17; i++) sdgCountMap[i] = 0;
            sdgRows.forEach((row) => {
                sdgCountMap[row.sdg_number] = row.registration_count;
            });

            const sdgStats = Object.entries(sdgCountMap).map(([sdgNumber, count]) => ({
                label: `SDG ${sdgNumber}`,
                total: count,
                sdg_number: Number(sdgNumber),
                registration_count: count,
            }));

            console.log("[admin/dashboard-stats]", { total_ms: Date.now() - t0, pg: true });

            return res.status(200).json({
                total_enrolment: enrolmentRows[0].c,
                total_participant: participantRows[0].c,
                second_round_students: secondRoundRows[0].c,
                total_finalists: finalistRows[0].c,
                sdg_registrations: sdgStats,
            });
        }

        const [
            enrolmentResult,
            participantResult,
            secondRoundResult,
            finalistResult,
            sdgResult,
        ] = await Promise.all([
            supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
            supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('is_participated', true),
            supabase.from('round_2_selection').select('*', { count: 'exact', head: true }),
            supabase.from('round_2_selection').select('*', { count: 'exact', head: true }).eq('status', 'selected'),
            supabase.rpc('get_sdg_stats'),
        ]);

        if (enrolmentResult.error) throw enrolmentResult.error;
        if (participantResult.error) throw participantResult.error;
        if (secondRoundResult.error) throw secondRoundResult.error;
        if (finalistResult.error) throw finalistResult.error;

        let sdgStats = [];
        let usedSdgFallback = false;
        const { data: rpcStats, error: sdgError } = sdgResult;

        if (!sdgError && Array.isArray(rpcStats)) {
            sdgStats = rpcStats.map((row) => ({
                label: row?.label || `SDG ${row?.sdg_number}`,
                total: row?.total ?? row?.registration_count ?? 0,
            }));
        } else {
            usedSdgFallback = true;
            const { data: profileRows, error: profileAggError } = await supabase
                .from('user_profiles')
                .select('assigned_sdg_number');

            if (profileAggError) throw profileAggError;

            const sdgCountMap = {};
            for (let i = 1; i <= 17; i++) sdgCountMap[i] = 0;

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
                registration_count: count,
            }));
        }

        console.log("[admin/dashboard-stats]", { total_ms: Date.now() - t0, sdg_fallback: usedSdgFallback });

        res.status(200).json({
            total_enrolment: enrolmentResult.count || 0,
            total_participant: participantResult.count || 0,
            second_round_students: secondRoundResult.count || 0,
            total_finalists: finalistResult.count || 0,
            sdg_registrations: sdgStats || [],
        });
    } catch (err) {
        console.error("Dashboard Stats Error:", err.message);
        res.status(500).json({ error: "Failed to fetch dashboard stats." });
    }
};

const getMarketingUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search?.trim() || '';

        if (search.length > 100) {
            return res.status(400).json({ error: "Search too long" });
        }

        const offset = (page - 1) * limit;

        if (sql) {
            const sanitized = search ? search.replace(/[%_]/g, '\\$&') : null;
            const pattern = sanitized ? `%${sanitized}%` : null;

            const rows = await sql`
                SELECT
                    name, email, phone, signup_source, created_at,
                    COUNT(*) OVER() AS total_count
                FROM user_profiles
                WHERE (${pattern}::text IS NULL OR signup_source ILIKE ${pattern})
                ORDER BY created_at DESC
                LIMIT ${limit} OFFSET ${offset}
            `;

            const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
            const data = rows.map(({ total_count, ...rest }) => rest);

            return res.status(200).json({
                success: true,
                data,
                totalUsers: total,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
            });
        }

        let query = supabase
            .from('user_profiles')
            .select('name, email, phone, signup_source, created_at', { count: 'exact' });

        if (search) {
            const sanitized = search.replace(/[%_]/g, '\\$&');
            query = query.ilike('signup_source', `%${sanitized}%`);
        }

        const { data, count, error } = await query
            .range(offset, offset + limit - 1)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json({
            success: true,
            data,
            totalUsers: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
        });
    } catch (err) {
        console.error("Marketing Users Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

const getMarketingStats = async (req, res) => {
    try {
        const expectedSources = ['Organic', 'Facebook', 'Mojaru', 'Instagram', 'Google', 'YouTube', 'Chorcha'];

        if (sql) {
            // Aggregate directly in SQL instead of pulling every row to Node.
            const rows = await sql`
                SELECT COALESCE(NULLIF(TRIM(signup_source), ''), 'Organic') AS source, COUNT(*)::int AS count
                FROM user_profiles
                GROUP BY 1
            `;

            const sourceCounts = {};
            expectedSources.forEach((source) => {
                sourceCounts[source.toLowerCase()] = { displayName: source, count: 0 };
            });

            rows.forEach((row) => {
                const lower = row.source.toLowerCase();
                if (sourceCounts[lower]) {
                    sourceCounts[lower].count += row.count;
                } else {
                    sourceCounts[lower] = { displayName: row.source, count: row.count };
                }
            });

            const formattedData = Object.values(sourceCounts)
                .map((item) => ({ source: item.displayName, count: item.count }))
                .sort((a, b) => b.count - a.count);

            return res.status(200).json({ success: true, data: formattedData });
        }

        const { data, error } = await supabase
            .from('user_profiles')
            .select('signup_source');

        if (error) throw error;

        const sourceCounts = {};
        expectedSources.forEach((source) => {
            sourceCounts[source.toLowerCase()] = { displayName: source, count: 0 };
        });

        data.forEach((user) => {
            const rawSource = user.signup_source ? user.signup_source.trim() : 'Organic';
            const lower = rawSource.toLowerCase();
            if (sourceCounts[lower]) {
                sourceCounts[lower].count += 1;
            } else {
                sourceCounts[lower] = { displayName: rawSource, count: 1 };
            }
        });

        const formattedData = Object.values(sourceCounts)
            .map((item) => ({ source: item.displayName, count: item.count }))
            .sort((a, b) => b.count - a.count);

        res.status(200).json({ success: true, data: formattedData });
    } catch (err) {
        console.error("Marketing Stats Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

const searchParticipant = async (req, res) => {
    const { email } = req.query;
    if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    try {
        const emailTrim = email.trim();

        if (sql) {
            const rows = await sql`
                SELECT user_id, name, email, role, sdg_role, is_participated, round_type, assigned_sdg_number
                FROM user_profiles
                WHERE email ILIKE ${emailTrim}
                LIMIT 1
            `;
            const profile = rows[0];
            if (!profile) return res.status(404).json({ success: false, error: 'No participant found with that email.' });

            const subRows = await sql`
                SELECT COUNT(*)::int AS c
                FROM quiz_submissions
                WHERE user_id = ${profile.user_id}
            `;
            return res.status(200).json({
                success: true,
                data: { ...profile, submission_count: subRows[0]?.c || 0 },
            });
        }

        const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('user_id, name, email, role, sdg_role, is_participated, round_type, assigned_sdg_number')
            .ilike('email', emailTrim)
            .maybeSingle();

        if (error) throw error;
        if (!profile) return res.status(404).json({ success: false, error: 'No participant found with that email.' });

        const { count: submissionCount } = await supabase
            .from('quiz_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', profile.user_id);

        res.status(200).json({
            success: true,
            data: { ...profile, submission_count: submissionCount || 0 },
        });
    } catch (err) {
        console.error('searchParticipant error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

const resetParticipant = async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ success: false, error: 'user_id is required.' });

    try {
        if (sql) {
            const profileRows = await sql`
                SELECT user_id, name, email FROM user_profiles WHERE user_id = ${user_id} LIMIT 1
            `;
            const profile = profileRows[0];
            if (!profile) return res.status(404).json({ success: false, error: 'Participant not found.' });

            const errors = [];
            try {
                await sql`DELETE FROM quiz_submissions WHERE user_id = ${user_id}`;
            } catch (e) { errors.push(`quiz_submissions: ${e.message}`); }

            try {
                await sql`UPDATE user_profiles SET is_participated = false WHERE user_id = ${user_id}`;
            } catch (e) { errors.push(`user_profiles: ${e.message}`); }

            try {
                await sql`
                    UPDATE round_1_initial
                    SET quiz_score = 0, is_qualified = false
                    WHERE user_id = ${user_id}
                `;
            } catch (e) { errors.push(`round_1_initial: ${e.message}`); }

            try {
                await sql`DELETE FROM round_performances WHERE user_id = ${user_id}`;
            } catch (e) { errors.push(`round_performances: ${e.message}`); }

            if (errors.length > 0) {
                console.error('[resetParticipant] partial errors:', errors);
                return res.status(500).json({
                    success: false,
                    error: `Reset partially failed: ${errors.join(' | ')}`,
                });
            }

            console.log(`[resetParticipant] reset OK for user_id=${user_id} (${profile.email})`);
            return res.status(200).json({
                success: true,
                message: `Quiz data reset for ${profile.name} (${profile.email}). They can now retake the quiz.`,
            });
        }

        const { data: profile, error: profileFetchError } = await supabase
            .from('user_profiles')
            .select('user_id, name, email')
            .eq('user_id', user_id)
            .single();

        if (profileFetchError || !profile) {
            return res.status(404).json({ success: false, error: 'Participant not found.' });
        }

        const errors = [];

        const { error: subError } = await supabase
            .from('quiz_submissions')
            .delete()
            .eq('user_id', user_id);
        if (subError) errors.push(`quiz_submissions: ${subError.message}`);

        const { error: profileError } = await supabase
            .from('user_profiles')
            .update({ is_participated: false })
            .eq('user_id', user_id);
        if (profileError) errors.push(`user_profiles: ${profileError.message}`);

        const { error: round1Error } = await supabase
            .from('round_1_initial')
            .update({ quiz_score: 0, is_qualified: false })
            .eq('user_id', user_id);
        if (round1Error && round1Error.code !== 'PGRST116') {
            errors.push(`round_1_initial: ${round1Error.message}`);
        }

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

// ─── backfillParticipation ────────────────────────────────────────────────────
// One-time (and safe-to-repeat) admin utility.
// Sets is_participated = true for every user who has a row in quiz_submissions
// but whose profile still has is_participated = false / NULL.
// Score doesn't matter — submitting the quiz earns the participation certificate.
const backfillParticipation = async (req, res) => {
    try {
        if (sql) {
            const result = await sql`
                UPDATE user_profiles
                SET is_participated = true
                WHERE user_id IN (
                    SELECT DISTINCT user_id FROM quiz_submissions
                )
                AND (is_participated IS NULL OR is_participated = false)
                RETURNING user_id
            `;
            return res.status(200).json({
                success: true,
                updated: result.length,
                message: `is_participated set to true for ${result.length} user(s).`,
            });
        }

        // Supabase JS path — fetch affected IDs first, then update
        const { data: submitters, error: fetchErr } = await supabase
            .from('quiz_submissions')
            .select('user_id');
        if (fetchErr) throw fetchErr;

        const ids = [...new Set(submitters.map(r => r.user_id))];
        if (ids.length === 0) {
            return res.status(200).json({ success: true, updated: 0, message: 'Nothing to update.' });
        }

        const { data: updated, error: updateErr } = await supabase
            .from('user_profiles')
            .update({ is_participated: true })
            .in('user_id', ids)
            .or('is_participated.is.null,is_participated.eq.false')
            .select('user_id');
        if (updateErr) throw updateErr;

        return res.status(200).json({
            success: true,
            updated: updated?.length ?? 0,
            message: `is_participated set to true for ${updated?.length ?? 0} user(s).`,
        });
    } catch (err) {
        console.error('backfillParticipation error:', err.message);
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
    backfillParticipation,
};
