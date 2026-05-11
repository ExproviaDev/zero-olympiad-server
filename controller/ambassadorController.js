const supabase = require('../config/db');
const sql = require('../config/pg');

const getAllAmbassadors = async (req, res) => {
    try {
        if (sql) {
            const rows = await sql`
                SELECT
                    ap.id,
                    ap.promo_code,
                    ap.total_referrals,
                    ap.created_at,
                    json_build_object(
                        'name', up.name,
                        'email', up.email,
                        'phone', up.phone,
                        'district', up.district,
                        'institution', up.institution
                    ) AS user_profiles
                FROM ambassador_profiles ap
                LEFT JOIN user_profiles up ON up.user_id = ap.user_id
                ORDER BY ap.total_referrals DESC
            `;
            return res.status(200).json({ success: true, data: rows });
        }

        const { data, error } = await supabase
            .from('ambassador_profiles')
            .select(`
                id,
                promo_code,
                total_referrals,
                created_at,
                user_profiles (
                    name,
                    email,
                    phone,
                    district,
                    institution
                )
            `)
            .order('total_referrals', { ascending: false });

        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getReferralList = async (req, res) => {
    const { promoCode } = req.params;
    try {
        const codeUpper = promoCode.toUpperCase();

        if (sql) {
            const rows = await sql`
                SELECT name, district, institution, created_at
                FROM user_profiles
                WHERE promo_code = ${codeUpper}
            `;
            return res.status(200).json({ success: true, count: rows.length, data: rows });
        }

        const { data, error } = await supabase
            .from('user_profiles')
            .select('name, district, institution, created_at')
            .eq('promo_code', codeUpper);

        if (error) throw error;
        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


const getAmbassadorSelfStats = async (req, res) => {
    try {
        const userId = req.user.sub || req.user.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "User ID not found in token." });
        }

        if (sql) {
            let profileRows = await sql`
                SELECT *
                FROM ambassador_profiles
                WHERE user_id = ${userId}
                LIMIT 1
            `;
            let profile = profileRows[0] ?? null;

            if (!profile) {
                const userRows = await sql`
                    SELECT role
                    FROM user_profiles
                    WHERE user_id = ${userId}
                    LIMIT 1
                `;
                const userProfile = userRows[0];

                if (userProfile && userProfile.role === 'ambassador') {
                    const upserted = await sql`
                        INSERT INTO ambassador_profiles (user_id, promo_code, total_referrals)
                        VALUES (${userId}, NULL, 0)
                        ON CONFLICT (user_id) DO UPDATE
                            SET total_referrals = ambassador_profiles.total_referrals
                        RETURNING *
                    `;
                    profile = upserted[0];
                    console.log(`Auto-healed ambassador profile for: ${userId}`);
                } else {
                    return res.status(404).json({ success: false, message: "Ambassador profile not found or unauthorized." });
                }
            }

            let referrals = [];
            if (profile.promo_code) {
                referrals = await sql`
                    SELECT name, district, institution, created_at
                    FROM user_profiles
                    WHERE promo_code = ${profile.promo_code}
                `;
            }

            return res.status(200).json({
                success: true,
                myPromoCode: profile.promo_code,
                totalReferrals: profile.total_referrals,
                referralList: referrals,
            });
        }

        let { data: profile, error: profileError } = await supabase
            .from('ambassador_profiles')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (!profile) {
            const { data: userProfile } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('user_id', userId)
                .single();

            if (userProfile && userProfile.role === 'ambassador') {
                const { data: upsertedProfile, error: upsertError } = await supabase
                    .from('ambassador_profiles')
                    .upsert(
                        [{ user_id: userId, promo_code: null, total_referrals: 0 }],
                        { onConflict: 'user_id' }
                    )
                    .select()
                    .single();

                if (upsertError) throw upsertError;
                profile = upsertedProfile;
            } else {
                return res.status(404).json({ success: false, message: "Ambassador profile not found or unauthorized." });
            }
        }

        let referrals = [];
        if (profile.promo_code) {
            const { data: refData, error: refError } = await supabase
                .from('user_profiles')
                .select('name, district, institution, created_at')
                .eq('promo_code', profile.promo_code);

            if (refError) throw refError;
            referrals = refData || [];
        }

        res.status(200).json({
            success: true,
            myPromoCode: profile.promo_code,
            totalReferrals: profile.total_referrals,
            referralList: referrals,
        });
    } catch (error) {
        console.error("Server Error in getAmbassadorSelfStats:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const updatePromoCode = async (req, res) => {
    const { newPromoCode } = req.body;
    const userId = req.user.sub || req.user.id;

    if (!newPromoCode) {
        return res.status(400).json({ success: false, message: "Promo code is required." });
    }

    const formattedCode = newPromoCode.trim().toUpperCase();

    try {
        if (sql) {
            const profileRows = await sql`
                SELECT promo_code
                FROM ambassador_profiles
                WHERE user_id = ${userId}
                LIMIT 1
            `;
            const profile = profileRows[0];

            if (!profile) {
                return res.status(404).json({ success: false, message: "Ambassador profile not found." });
            }
            if (profile.promo_code) {
                return res.status(400).json({ success: false, message: "Promo code is already set and cannot be changed." });
            }

            const existing = await sql`
                SELECT id FROM ambassador_profiles WHERE promo_code = ${formattedCode} LIMIT 1
            `;
            if (existing[0]) {
                return res.status(400).json({ success: false, message: "This promo code is already taken. Please try another." });
            }

            await sql`
                UPDATE ambassador_profiles
                SET promo_code = ${formattedCode}
                WHERE user_id = ${userId}
            `;

            return res.status(200).json({
                success: true,
                message: "Promo code set successfully!",
                promoCode: formattedCode,
            });
        }

        const { data: profile, error: profileError } = await supabase
            .from('ambassador_profiles')
            .select('promo_code')
            .eq('user_id', userId)
            .single();

        if (profileError || !profile) {
            return res.status(404).json({ success: false, message: "Ambassador profile not found." });
        }
        if (profile.promo_code) {
            return res.status(400).json({ success: false, message: "Promo code is already set and cannot be changed." });
        }

        const { data: existingCode } = await supabase
            .from('ambassador_profiles')
            .select('id')
            .eq('promo_code', formattedCode)
            .maybeSingle();

        if (existingCode) {
            return res.status(400).json({ success: false, message: "This promo code is already taken. Please try another." });
        }

        const { error: updateError } = await supabase
            .from('ambassador_profiles')
            .update({ promo_code: formattedCode })
            .eq('user_id', userId);

        if (updateError) throw updateError;

        res.status(200).json({
            success: true,
            message: "Promo code set successfully!",
            promoCode: formattedCode,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getAllAmbassadors,
    getReferralList,
    getAmbassadorSelfStats,
    updatePromoCode,
};
