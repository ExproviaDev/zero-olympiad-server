const supabase = require('../config/db');

// ১. সকল অ্যাম্বাসেডরদের লিস্ট ফেচ করা (অ্যাডমিনের জন্য)
const getAllAmbassadors = async (req, res) => {
    try {
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
            .order('total_referrals', { ascending: false }); // সবচেয়ে বেশি রেফারাল উপরে থাকবে

        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ২. নির্দিষ্ট অ্যাম্বাসেডরের আন্ডারে কারা জয়েন করেছে তাদের লিস্ট দেখা
const getReferralList = async (req, res) => {
    const { promoCode } = req.params;
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('name, district, institution, created_at')
            .eq('promo_code', promoCode.toUpperCase()) //
            .eq('role', 'contestor');

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

        const { data: profile, error: profileError } = await supabase
            .from('ambassador_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (profileError || !profile) {
            return res.status(404).json({ success: false, message: "Ambassador profile not found." });
        }

        // খ. ওই প্রোমো কোড ব্যবহার করে কারা জয়েন করেছে তাদের ডিটেইলস আনা
        const { data: referrals, error: refError } = await supabase
            .from('user_profiles')
            .select('name, district, institution, created_at')
            .eq('promo_code', profile.promo_code)
            .eq('role', 'contestor');

        if (refError) throw refError;

        res.status(200).json({
            success: true,
            myPromoCode: profile.promo_code,
            totalReferrals: profile.total_referrals,
            referralList: referrals
        });

    } catch (error) {
        console.error("Server Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};
module.exports = {
    getAllAmbassadors,
    getReferralList,
    getAmbassadorSelfStats
};