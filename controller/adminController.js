const supabase = require('../config/db');
const sql = require('../config/pg');

/** Last ~45 days cumulative counts for dashboard line chart */
async function fetchDashboardMetricsTrendSql(pgSql) {
    const rows = await pgSql`
        WITH series AS (
            SELECT (gs)::date AS day
            FROM generate_series(
                (CURRENT_DATE - INTERVAL '44 days')::date,
                CURRENT_DATE::date,
                INTERVAL '1 day'
            ) AS gs
        ),
        enrol_d AS (
            SELECT (created_at::date) AS day, COUNT(*)::int AS n
            FROM user_profiles
            WHERE created_at IS NOT NULL
            GROUP BY 1
        ),
        enrol_fill AS (
            SELECT s.day, COALESCE(e.n, 0)::int AS n
            FROM series s
            LEFT JOIN enrol_d e ON e.day = s.day
        ),
        enrol_cum AS (
            SELECT day, SUM(n) OVER (ORDER BY day)::int AS enrolment
            FROM enrol_fill
        ),
        r2_d AS (
            SELECT (COALESCE(created_at, updated_at))::date AS day, COUNT(*)::int AS n
            FROM round_2_selection
            WHERE COALESCE(created_at, updated_at) IS NOT NULL
            GROUP BY (COALESCE(created_at, updated_at))::date
        ),
        r2_fill AS (
            SELECT s.day, COALESCE(r.n, 0)::int AS n
            FROM series s
            LEFT JOIN r2_d r ON r.day = s.day
        ),
        r2_cum AS (
            SELECT day, SUM(n) OVER (ORDER BY day)::int AS second_round
            FROM r2_fill
        ),
        fin_d AS (
            SELECT (updated_at::date) AS day, COUNT(*)::int AS n
            FROM round_2_selection
            WHERE status = 'selected' AND updated_at IS NOT NULL
            GROUP BY 1
        ),
        fin_fill AS (
            SELECT s.day, COALESCE(f.n, 0)::int AS n
            FROM series s
            LEFT JOIN fin_d f ON f.day = s.day
        ),
        fin_cum AS (
            SELECT day, SUM(n) OVER (ORDER BY day)::int AS finalists
            FROM fin_fill
        )
        SELECT
            TO_CHAR(e.day, 'Mon DD') AS label,
            e.day AS sort_day,
            e.enrolment,
            r.second_round,
            f.finalists
        FROM enrol_cum e
        INNER JOIN r2_cum r ON r.day = e.day
        INNER JOIN fin_cum f ON f.day = e.day
        ORDER BY e.day ASC
    `;
    return rows.map((row) => ({
        label: row.label,
        enrolment: Number(row.enrolment) || 0,
        secondRound: Number(row.second_round) || 0,
        finalists: Number(row.finalists) || 0,
    }));
}

async function fetchDashboardMetricsTrendSupabase(sb) {
    const dayKey = (t) => {
        if (!t) return null;
        const x = new Date(t);
        if (Number.isNaN(x.getTime())) return null;
        return x.toISOString().slice(0, 10);
    };

    const [{ data: pu, error: e1 }, { data: r2, error: e2 }] = await Promise.all([
        sb.from('user_profiles').select('created_at'),
        sb.from('round_2_selection').select('created_at, updated_at, status'),
    ]);
    if (e1 || e2) throw e1 || e2;

    const enrolDates = (pu || [])
        .map((r) => dayKey(r.created_at))
        .filter(Boolean)
        .sort();

    const r2Rows = r2 || [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const trend = [];
    for (let offset = 44; offset >= 0; offset -= 1) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - offset);
        const dStr = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        let en = 0;
        while (en < enrolDates.length && enrolDates[en] <= dStr) en += 1;

        let sr = 0;
        for (const row of r2Rows) {
            const dk = dayKey(row.created_at) || dayKey(row.updated_at);
            if (dk && dk <= dStr) sr += 1;
        }

        let fn = 0;
        for (const row of r2Rows) {
            if (row.status !== 'selected') continue;
            const dk = dayKey(row.updated_at);
            if (dk && dk <= dStr) fn += 1;
        }

        trend.push({ label, enrolment: en, secondRound: sr, finalists: fn });
    }
    return trend;
}

const AMBASSADOR_PIE_TOP_N = 7;

function composeAmbassadorRegistrationPieFromRows(organicCount, referralRows) {
    const organic = Number(organicCount) || 0;
    const rows = [...(referralRows || [])].sort(
        (a, b) => Number(b?.cnt ?? b?.count ?? 0) - Number(a?.cnt ?? a?.count ?? 0),
    );
    const out = [];
    if (organic > 0) {
        out.push({
            key: 'organic',
            name: 'Organic — no ambassador code',
            value: organic,
            code: null,
        });
    }
    let otherSum = 0;
    rows.forEach((r, idx) => {
        const code = String(r?.code ?? r?.promo_code ?? '').trim().toUpperCase();
        const v = Number(r?.cnt ?? r?.count ?? 0) || 0;
        if (!code || v <= 0) return;
        const ambName = String(r?.ambassador_name ?? r?.display_name ?? '').trim();
        if (idx < AMBASSADOR_PIE_TOP_N) {
            const nm = ambName ? `${ambName.slice(0, 24)} (${code})` : code;
            out.push({ key: code, name: nm, value: v, code });
        } else {
            otherSum += v;
        }
    });
    if (otherSum > 0) {
        const nRest = rows.length > AMBASSADOR_PIE_TOP_N ? rows.length - AMBASSADOR_PIE_TOP_N : 1;
        out.push({
            key: '__others',
            name: `Other ambassador codes (${nRest}+)`,
            value: otherSum,
            code: 'others',
        });
    }
    return out.filter((x) => x.value > 0);
}

async function fetchAmbassadorRegistrationPieSql(pgSql) {
    // Aggregate signups purely from user_profiles — never block the pie on ambassador JOIN issues.
    const organicRows = await pgSql`
        SELECT COUNT(*)::int AS c
        FROM user_profiles
        WHERE promo_code IS NULL OR LENGTH(TRIM(COALESCE(promo_code, ''))) = 0
    `;
    const organicCount = organicRows?.[0]?.c ?? 0;

    const countsOnly = await pgSql`
        SELECT
            UPPER(TRIM(promo_code)) AS code,
            COUNT(*)::int AS cnt
        FROM user_profiles
        WHERE promo_code IS NOT NULL AND LENGTH(TRIM(promo_code)) > 0
        GROUP BY UPPER(TRIM(promo_code))
        ORDER BY cnt DESC
    `;

    const nameByCode = {};
    try {
        const nameRows = await pgSql`
            SELECT UPPER(TRIM(ap.promo_code)) AS code, MAX(TRIM(up.name)) AS ambassador_name
            FROM ambassador_profiles ap
            INNER JOIN user_profiles up ON up.user_id = ap.user_id
            WHERE ap.promo_code IS NOT NULL AND LENGTH(TRIM(ap.promo_code)) > 0
            GROUP BY UPPER(TRIM(ap.promo_code))
        `;
        (nameRows || []).forEach((row) => {
            const code = row?.code ? String(row.code).trim().toUpperCase() : '';
            if (!code) return;
            nameByCode[code] = String(row?.ambassador_name ?? '').trim();
        });
    } catch (nameErr) {
        console.error('[fetchAmbassadorRegistrationPieSql] name map skipped:', nameErr.message);
    }

    const refRows = (countsOnly || []).map((r) => ({
        code: r.code,
        cnt: r.cnt,
        ambassador_name: nameByCode[String(r.code).trim().toUpperCase()] || '',
    }));

    return composeAmbassadorRegistrationPieFromRows(Number(organicCount) || 0, refRows);
}

/** Paginate past PostgREST 1000-row default so ambassador pie matches full enrolment. */
async function fetchAllPromoRowsSupabase(sb) {
    const pageSize = 1000;
    let from = 0;
    const out = [];
    for (;;) {
        const { data, error } = await sb
            .from('user_profiles')
            .select('promo_code')
            .order('user_id', { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = Array.isArray(data) ? data : [];
        out.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
    }
    return out;
}

async function fetchAmbassadorProfilesPageSupabase(sb) {
    const pageSize = 1000;
    let from = 0;
    const out = [];
    for (;;) {
        const { data, error } = await sb
            .from('ambassador_profiles')
            .select('promo_code, user_id')
            .order('user_id', { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = Array.isArray(data) ? data : [];
        out.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
    }
    return out;
}

async function fetchAmbassadorRegistrationPieSupabase(sb) {
    const profiles = await fetchAllPromoRowsSupabase(sb);

    const nameByCode = {};

    try {
        const ambassadorRows = await fetchAmbassadorProfilesPageSupabase(sb);
        const userIds = [...new Set(ambassadorRows.map((r) => r?.user_id).filter(Boolean))];
        let profilesById = {};
        if (userIds.length > 0) {
            const pageSize = 1000;
            for (let i = 0; i < userIds.length; i += pageSize) {
                const slice = userIds.slice(i, i + pageSize);
                const nmRes = await sb.from('user_profiles').select('user_id, name').in('user_id', slice);
                if (nmRes.error) throw nmRes.error;
                (nmRes.data || []).forEach((r) => {
                    profilesById[r.user_id] = String(r?.name || '').trim();
                });
            }
        }
        ambassadorRows.forEach((row) => {
            const c = row?.promo_code ? String(row.promo_code).trim().toUpperCase() : '';
            if (!c) return;
            nameByCode[c] = profilesById[row?.user_id] || '';
        });
    } catch (mapErr) {
        console.error('[fetchAmbassadorRegistrationPieSupabase] ambassador name map skipped:', mapErr.message);
    }

    let organic = 0;
    const byCode = {};
    (profiles || []).forEach((p) => {
        const raw = p?.promo_code;
        const c = raw == null ? '' : String(raw).trim();
        if (!c) organic += 1;
        else {
            const ku = c.toUpperCase();
            byCode[ku] = (byCode[ku] || 0) + 1;
        }
    });

    const referralRows = Object.entries(byCode).map(([code, cnt]) => ({
        code,
        cnt,
        ambassador_name: nameByCode[code] || '',
    }));
    referralRows.sort((a, b) => b.cnt - a.cnt);

    return composeAmbassadorRegistrationPieFromRows(organic, referralRows);
}

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
            /* Promoted users stay 'pending' until they submit a video; submit sets 'submitted'; jury sets 'evaluated'. */
            const tabEvaluated = status === 'evaluated';

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
                WHERE r2.video_link IS NOT NULL
                  AND LENGTH(BTRIM(r2.video_link::text)) > 0
                  AND (${sdgFilter}::int IS NULL OR up.assigned_sdg_number = ${sdgFilter})
                  AND (
                    (${tabEvaluated} AND r2.status = 'evaluated')
                    OR
                    (${!tabEvaluated} AND r2.status = 'submitted')
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
            query = query.eq('status', 'evaluated');
        } else {
            query = query.eq('status', 'submitted');
        }

        query = query
            .not('video_link', 'is', null)
            .neq('video_link', '')
            .order('updated_at', { ascending: false })
            .range(from, to);

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

            let metrics_trend = [];
            try {
                metrics_trend = await fetchDashboardMetricsTrendSql(sql);
            } catch (trendErr) {
                console.error('[admin/dashboard-stats] metrics_trend (pg)', trendErr.message);
            }

            console.log("[admin/dashboard-stats]", { total_ms: Date.now() - t0, pg: true });

            let ambassador_registration_pie = [];
            try {
                ambassador_registration_pie = await fetchAmbassadorRegistrationPieSql(sql);
            } catch (ambErr) {
                console.error('[admin/dashboard-stats] ambassador_registration_pie (pg)', ambErr.message);
            }

            return res.status(200).json({
                total_enrolment: enrolmentRows[0].c,
                total_participant: participantRows[0].c,
                second_round_students: secondRoundRows[0].c,
                total_finalists: finalistRows[0].c,
                sdg_registrations: sdgStats,
                metrics_trend,
                ambassador_registration_pie,
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

        let metrics_trend = [];
        try {
            metrics_trend = await fetchDashboardMetricsTrendSupabase(supabase);
        } catch (trendErr) {
            console.error('[admin/dashboard-stats] metrics_trend (supabase)', trendErr.message);
        }

        let ambassador_registration_pie = [];
        try {
            ambassador_registration_pie = await fetchAmbassadorRegistrationPieSupabase(supabase);
        } catch (ambErr) {
            console.error('[admin/dashboard-stats] ambassador_registration_pie (supabase)', ambErr.message);
        }

        res.status(200).json({
            total_enrolment: enrolmentResult.count || 0,
            total_participant: participantResult.count || 0,
            second_round_students: secondRoundResult.count || 0,
            total_finalists: finalistResult.count || 0,
            sdg_registrations: sdgStats || [],
            metrics_trend,
            ambassador_registration_pie,
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
