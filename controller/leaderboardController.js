const supabase = require('../config/db');
const sql = require('../config/pg');

const getLeaderboardStatus = async (req, res) => {
    try {
        if (sql) {
            const rows = await sql`
                SELECT is_leaderboard_public
                FROM competition_settings
                WHERE id = 1
                LIMIT 1
            `;
            return res.status(200).json({
                success: true,
                is_public: rows[0]?.is_leaderboard_public ?? false,
            });
        }

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
            limit = 20,
            search = '',
        } = req.query;

        const pageInt = Math.max(parseInt(page) || 1, 1);
        // Cap raised to 5000 so the user-dashboard "fetch-all + client-side filter" flow
        // (which requests limit=4000) actually receives the full dataset.
        const limitInt = Math.min(Math.max(parseInt(limit) || 20, 1), 5000);

        const validRounds = ['round_1', 'round_2', 'round_3'];
        if (!validRounds.includes(round)) {
            return res.status(400).json({ success: false, message: 'Invalid Round Selected' });
        }

        const offset = (pageInt - 1) * limitInt;

        let sdgNum = null;
        if (sdg && sdg !== 'All' && sdg !== '') {
            const parsed = parseInt(sdg.toString().replace('SDG ', ''));
            if (!isNaN(parsed)) sdgNum = parsed;
        }

        const searchTrimmed = (search || '').toString().trim();
        const searchPattern = searchTrimmed ? `%${searchTrimmed}%` : null;

        if (sql) {
            let rows;

            if (round === 'round_1') {
                rows = await sql`
                    WITH ranked AS (
                        SELECT
                            rp.id,
                            rp.quiz_score AS score,
                            rp.time_taken AS time,
                            up.name,
                            up.email,
                            up.institution,
                            up.assigned_sdg_number AS sdg,
                            up.profile_image_url AS image,
                            ROW_NUMBER() OVER (ORDER BY rp.quiz_score DESC, rp.time_taken ASC) AS rank
                        FROM round_performances rp
                        INNER JOIN user_profiles up ON up.user_id = rp.user_id
                        WHERE rp.round_number = 1
                          AND (${sdgNum}::int IS NULL OR up.assigned_sdg_number = ${sdgNum})
                    )
                    SELECT *, COUNT(*) OVER() AS total_count
                    FROM ranked
                    WHERE (
                        ${searchPattern}::text IS NULL
                        OR name ILIKE ${searchPattern}
                        OR institution ILIKE ${searchPattern}
                        OR email ILIKE ${searchPattern}
                    )
                    ORDER BY rank ASC
                    LIMIT ${limitInt} OFFSET ${offset}
                `;
            } else if (round === 'round_2') {
                rows = await sql`
                    WITH ranked AS (
                        SELECT
                            r2.id,
                            r2.jury_score AS score,
                            r2.quiz_score AS extra_score,
                            r2.updated_at,
                            up.name,
                            up.email,
                            up.institution,
                            up.assigned_sdg_number AS sdg,
                            up.profile_image_url AS image,
                            ROW_NUMBER() OVER (ORDER BY r2.jury_score DESC, r2.quiz_score DESC, r2.updated_at ASC) AS rank
                        FROM round_2_selection r2
                        INNER JOIN user_profiles up ON up.user_id = r2.user_id
                        WHERE (${sdgNum}::int IS NULL OR up.assigned_sdg_number = ${sdgNum})
                    )
                    SELECT *, COUNT(*) OVER() AS total_count
                    FROM ranked
                    WHERE (
                        ${searchPattern}::text IS NULL
                        OR name ILIKE ${searchPattern}
                        OR institution ILIKE ${searchPattern}
                        OR email ILIKE ${searchPattern}
                    )
                    ORDER BY rank ASC
                    LIMIT ${limitInt} OFFSET ${offset}
                `;
            } else {
                rows = await sql`
                    WITH ranked AS (
                        SELECT
                            r3.id,
                            r3.total_calculated_score AS score,
                            up.name,
                            up.email,
                            up.institution,
                            up.assigned_sdg_number AS sdg,
                            up.profile_image_url AS image,
                            ROW_NUMBER() OVER (ORDER BY r3.total_calculated_score DESC) AS rank
                        FROM round_3_final r3
                        INNER JOIN user_profiles up ON up.user_id = r3.user_id
                        WHERE (${sdgNum}::int IS NULL OR up.assigned_sdg_number = ${sdgNum})
                    )
                    SELECT *, COUNT(*) OVER() AS total_count
                    FROM ranked
                    WHERE (
                        ${searchPattern}::text IS NULL
                        OR name ILIKE ${searchPattern}
                        OR institution ILIKE ${searchPattern}
                        OR email ILIKE ${searchPattern}
                    )
                    ORDER BY rank ASC
                    LIMIT ${limitInt} OFFSET ${offset}
                `;
            }

            const totalCount = rows[0]?.total_count ? Number(rows[0].total_count) : 0;

            const formattedData = rows.map((row) => ({
                rank: Number(row.rank),
                name: row.name,
                institution: row.institution,
                status: round === 'round_1' ? 'Promoted to Second Round' : `Qualified in ${round.replace('_', ' ').toUpperCase()}`,
                image: row.image,
            }));

            return res.status(200).json({
                success: true,
                data: formattedData,
                total: totalCount,
                page: pageInt,
                limit: limitInt,
            });
        }

        // Fallback: original Supabase JS path (used when SUPABASE_DB_URL is not set).
        // NOTE: This path cannot easily preserve absolute rank when a search filter
        // is applied, so we approximate by paginating the filtered result set.
        const from = offset;
        const to = from + limitInt - 1;
        let query;

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
        } else if (round === 'round_2') {
            query = supabase
                .from('round_2_selection')
                .select(`
                    id, jury_score, quiz_score, updated_at,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .order('jury_score', { ascending: false })
                .order('quiz_score', { ascending: false })
                .order('updated_at', { ascending: true });
        } else {
            query = supabase
                .from('round_3_final')
                .select(`
                    id, total_calculated_score,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .order('total_calculated_score', { ascending: false });
        }

        if (sdgNum !== null) {
            query = query.eq('user_profiles.assigned_sdg_number', sdgNum);
        }

        if (searchTrimmed) {
            const pattern = `%${searchTrimmed}%`;
            query = query.or(
                `name.ilike.${pattern},email.ilike.${pattern},institution.ilike.${pattern}`,
                { foreignTable: 'user_profiles' }
            );
        }

        const { data, count, error } = await query.range(from, to);
        if (error) throw error;

        const formattedData = data.map((item, index) => ({
            rank: from + index + 1,
            name: item.user_profiles?.name,
            institution: item.user_profiles?.institution,
            status: round === 'round_1' ? 'Promoted to Second Round' : `Qualified in ${round.replace('_', ' ').toUpperCase()}`,
            image: item.user_profiles?.profile_image_url,
        }));

        res.status(200).json({
            success: true,
            data: formattedData,
            total: count,
            page: pageInt,
            limit: limitInt,
        });
    } catch (err) {
        console.error('Leaderboard Error:', err.message);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

const getAdminLeaderboardData = async (req, res) => {
    try {
        const {
            round = 'round_1',
            sdg,
            page = 1,
            limit = 20,
            search = '',
        } = req.query;

        const pageInt = Math.max(parseInt(page) || 1, 1);
        const limitInt = Math.min(Math.max(parseInt(limit) || 20, 1), 5000);

        const validRounds = ['round_1', 'round_2', 'round_3'];
        if (!validRounds.includes(round)) {
            return res.status(400).json({ success: false, message: 'Invalid Round Selected' });
        }

        const offset = (pageInt - 1) * limitInt;

        let sdgNum = null;
        if (sdg && sdg !== 'All' && sdg !== '') {
            const parsed = parseInt(sdg.toString().replace('SDG ', ''));
            if (!isNaN(parsed)) sdgNum = parsed;
        }

        const searchTrimmed = (search || '').toString().trim();
        const searchPattern = searchTrimmed ? `%${searchTrimmed}%` : null;

        if (sql) {
            let rows;

            if (round === 'round_1') {
                rows = await sql`
                    WITH ranked AS (
                        SELECT
                            rp.id,
                            rp.quiz_score AS score,
                            rp.time_taken AS time,
                            up.name,
                            up.email,
                            up.institution,
                            up.assigned_sdg_number AS sdg,
                            up.profile_image_url AS image,
                            ROW_NUMBER() OVER (ORDER BY rp.quiz_score DESC, rp.time_taken ASC) AS rank
                        FROM round_performances rp
                        INNER JOIN user_profiles up ON up.user_id = rp.user_id
                        WHERE rp.round_number = 1
                          AND (${sdgNum}::int IS NULL OR up.assigned_sdg_number = ${sdgNum})
                    )
                    SELECT *, COUNT(*) OVER() AS total_count
                    FROM ranked
                    WHERE (
                        ${searchPattern}::text IS NULL
                        OR name ILIKE ${searchPattern}
                        OR institution ILIKE ${searchPattern}
                        OR email ILIKE ${searchPattern}
                    )
                    ORDER BY rank ASC
                    LIMIT ${limitInt} OFFSET ${offset}
                `;
            } else if (round === 'round_2') {
                rows = await sql`
                    WITH ranked AS (
                        SELECT
                            r2.id,
                            r2.jury_score AS score,
                            r2.quiz_score AS extra_score,
                            r2.updated_at,
                            up.name,
                            up.email,
                            up.institution,
                            up.assigned_sdg_number AS sdg,
                            up.profile_image_url AS image,
                            ROW_NUMBER() OVER (ORDER BY r2.jury_score DESC, r2.quiz_score DESC, r2.updated_at ASC) AS rank
                        FROM round_2_selection r2
                        INNER JOIN user_profiles up ON up.user_id = r2.user_id
                        WHERE (${sdgNum}::int IS NULL OR up.assigned_sdg_number = ${sdgNum})
                    )
                    SELECT *, COUNT(*) OVER() AS total_count
                    FROM ranked
                    WHERE (
                        ${searchPattern}::text IS NULL
                        OR name ILIKE ${searchPattern}
                        OR institution ILIKE ${searchPattern}
                        OR email ILIKE ${searchPattern}
                    )
                    ORDER BY rank ASC
                    LIMIT ${limitInt} OFFSET ${offset}
                `;
            } else {
                rows = await sql`
                    WITH ranked AS (
                        SELECT
                            r3.id,
                            r3.total_calculated_score AS score,
                            up.name,
                            up.email,
                            up.institution,
                            up.assigned_sdg_number AS sdg,
                            up.profile_image_url AS image,
                            ROW_NUMBER() OVER (ORDER BY r3.total_calculated_score DESC) AS rank
                        FROM round_3_final r3
                        INNER JOIN user_profiles up ON up.user_id = r3.user_id
                        WHERE (${sdgNum}::int IS NULL OR up.assigned_sdg_number = ${sdgNum})
                    )
                    SELECT *, COUNT(*) OVER() AS total_count
                    FROM ranked
                    WHERE (
                        ${searchPattern}::text IS NULL
                        OR name ILIKE ${searchPattern}
                        OR institution ILIKE ${searchPattern}
                        OR email ILIKE ${searchPattern}
                    )
                    ORDER BY rank ASC
                    LIMIT ${limitInt} OFFSET ${offset}
                `;
            }

            const totalCount = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
            const formattedData = rows.map((row) => ({
                rank: Number(row.rank),
                name: row.name,
                email: row.email,
                institution: row.institution,
                sdg: row.sdg,
                image: row.image,
                score: row.score,
                time: round === 'round_1' ? row.time : null,
            }));

            return res.status(200).json({
                success: true,
                data: formattedData,
                total: totalCount,
                page: pageInt,
                limit: limitInt,
            });
        }

        const from = offset;
        const to = from + limitInt - 1;
        let query;

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
        } else if (round === 'round_2') {
            query = supabase
                .from('round_2_selection')
                .select(`
                    id, jury_score, quiz_score, updated_at,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .order('jury_score', { ascending: false })
                .order('quiz_score', { ascending: false })
                .order('updated_at', { ascending: true });
        } else {
            query = supabase
                .from('round_3_final')
                .select(`
                    id, total_calculated_score,
                    user_profiles!inner (name, email, institution, assigned_sdg_number, profile_image_url)
                `, { count: 'exact' })
                .order('total_calculated_score', { ascending: false });
        }

        if (sdgNum !== null) {
            query = query.eq('user_profiles.assigned_sdg_number', sdgNum);
        }

        if (searchTrimmed) {
            const pattern = `%${searchTrimmed}%`;
            query = query.or(
                `name.ilike.${pattern},email.ilike.${pattern},institution.ilike.${pattern}`,
                { foreignTable: 'user_profiles' }
            );
        }

        const { data, count, error } = await query.range(from, to);
        if (error) throw error;

        const formattedData = data.map((item, index) => ({
            rank: from + index + 1,
            name: item.user_profiles?.name,
            email: item.user_profiles?.email,
            institution: item.user_profiles?.institution,
            sdg: item.user_profiles?.assigned_sdg_number,
            image: item.user_profiles?.profile_image_url,
            score: round === 'round_1'
                ? item.quiz_score
                : (round === 'round_2' ? item.jury_score : item.total_calculated_score),
            time: round === 'round_1' ? item.time_taken : null,
        }));

        res.status(200).json({
            success: true,
            data: formattedData,
            total: count,
            page: pageInt,
            limit: limitInt,
        });
    } catch (err) {
        console.error('Leaderboard Error:', err.message);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { getLeaderboardData, getLeaderboardStatus, getAdminLeaderboardData };
