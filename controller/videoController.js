const supabase = require('../config/db');
const sql = require('../config/pg');

const getVideoRoundSettings = async (req, res) => {
    try {
        const roundPrefix = 'round_2';

        if (sql) {
            const rows = await sql`
                SELECT *
                FROM competition_settings
                WHERE id = 1
                LIMIT 1
            `;
            const settings = rows[0];

            if (!settings) {
                return res.status(200).json({
                    success: true,
                    data: {
                        round_name: roundPrefix,
                        is_enabled: false,
                        start_time: null,
                        end_time: null,
                        server_time: new Date(),
                    },
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    round_name: roundPrefix,
                    is_enabled: settings[`${roundPrefix}_has_video`],
                    start_time: settings[`${roundPrefix}_start`],
                    end_time: settings[`${roundPrefix}_end`],
                    server_time: new Date(),
                },
            });
        }

        const { data: settings, error } = await supabase
            .from('competition_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) throw error;
        if (!settings) {
            return res.status(200).json({
                success: true,
                data: {
                    round_name: roundPrefix,
                    is_enabled: false,
                    start_time: null,
                    end_time: null,
                    server_time: new Date(),
                },
            });
        }

        res.status(200).json({
            success: true,
            data: {
                round_name: roundPrefix,
                is_enabled: settings[`${roundPrefix}_has_video`],
                start_time: settings[`${roundPrefix}_start`],
                end_time: settings[`${roundPrefix}_end`],
                server_time: new Date(),
            },
        });
    } catch (error) {
        console.error("Settings Error:", error.message);
        res.status(500).json({ success: false, message: "Server Error: Could not fetch settings" });
    }
};

const submitVideoLink = async (req, res) => {
    const { user_id, video_link } = req.body;

    try {
        const roundPrefix = 'round_2';
        let settings;

        if (sql) {
            const rows = await sql`
                SELECT * FROM competition_settings WHERE id = 1 LIMIT 1
            `;
            settings = rows[0];
        } else {
            const { data, error: settingsError } = await supabase
                .from('competition_settings')
                .select('*')
                .eq('id', 1)
                .single();
            if (settingsError) throw settingsError;
            settings = data;
        }

        const startTime = new Date(settings[`${roundPrefix}_start`]);
        const endTime = new Date(settings[`${roundPrefix}_end`]);
        const isVideoEnabled = settings[`${roundPrefix}_has_video`];
        const now = new Date();

        if (!isVideoEnabled) return res.status(403).json({ success: false, message: "Video submission is currently disabled." });
        if (now < startTime) return res.status(403).json({ success: false, message: "Submission has not started yet." });
        if (now > endTime) return res.status(403).json({ success: false, message: "Submission deadline has passed." });

        if (sql) {
            const rows = await sql`
                UPDATE round_2_selection
                SET video_link = ${video_link},
                    status = 'submitted',
                    updated_at = NOW()
                WHERE user_id = ${user_id}
                RETURNING *
            `;
            if (rows.length === 0) {
                return res.status(403).json({ success: false, message: "You are not qualified for Round 2 video submission." });
            }
            return res.status(200).json({ success: true, message: "Video link submitted successfully." });
        }

        const { data, error } = await supabase
            .from('round_2_selection')
            .update({
                video_link,
                status: 'submitted',
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', user_id)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(403).json({ success: false, message: "You are not qualified for Round 2 video submission." });
        }

        return res.status(200).json({ success: true, message: "Video link submitted successfully." });
    } catch (err) {
        console.error("Video Controller Error:", err.message);
        return res.status(500).json({ success: false, message: "Server error occurred." });
    }
};

const getVideoStatus = async (req, res) => {
    const { user_id } = req.params;
    try {
        if (sql) {
            const rows = await sql`
                SELECT video_link, jury_score, status, jury_comments
                FROM round_2_selection
                WHERE user_id = ${user_id}
                LIMIT 1
            `;
            if (!rows[0]) return res.status(404).json({ message: "Participant not found in Round 2." });
            return res.status(200).json(rows[0]);
        }

        const { data, error } = await supabase
            .from('round_2_selection')
            .select('video_link, jury_score, status, jury_comments')
            .eq('user_id', user_id)
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ message: "Participant not found in Round 2." });

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch status." });
    }
};

module.exports = {
    getVideoRoundSettings,
    submitVideoLink,
    getVideoStatus,
};
