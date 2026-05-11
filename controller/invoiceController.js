const supabase = require('../config/db');
const sql = require('../config/pg');

const getUserInvoice = async (req, res) => {
    try {
        const userId = req.user.sub || req.user.id;

        if (sql) {
            const profileRows = await sql`
                SELECT name, email, phone, institution, district, created_at, payment_verify_token
                FROM user_profiles
                WHERE user_id = ${userId}
                LIMIT 1
            `;
            const userProfile = profileRows[0];

            if (!userProfile) {
                return res.status(404).json({ success: false, message: "User profile not found." });
            }

            let paymentData = null;

            if (userProfile.payment_verify_token) {
                const rows = await sql`
                    SELECT *
                    FROM payment_verifications
                    WHERE verification_token = ${userProfile.payment_verify_token}
                    LIMIT 1
                `;
                if (rows[0]) paymentData = rows[0];
            }

            if (!paymentData && userProfile.phone) {
                const rows = await sql`
                    SELECT *
                    FROM payment_verifications
                    WHERE customer_number = ${userProfile.phone}
                      AND status IN ('used', 'completed')
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                paymentData = rows[0] ?? null;
            }

            const invoiceData = buildInvoice(userId, userProfile, paymentData);
            return res.status(200).json({ success: true, data: invoiceData });
        }

        const { data: userProfile, error: userError } = await supabase
            .from('user_profiles')
            .select('name, email, phone, institution, district, created_at, payment_verify_token')
            .eq('user_id', userId)
            .single();

        if (userError || !userProfile) {
            return res.status(404).json({ success: false, message: "User profile not found." });
        }

        let paymentData = null;

        if (userProfile.payment_verify_token) {
            const { data } = await supabase
                .from('payment_verifications')
                .select('*')
                .eq('verification_token', userProfile.payment_verify_token)
                .single();

            if (data) paymentData = data;
        }

        if (!paymentData) {
            const { data } = await supabase
                .from('payment_verifications')
                .select('*')
                .eq('customer_number', userProfile.phone)
                .or('status.eq.used,status.eq.completed')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            paymentData = data;
        }

        const invoiceData = buildInvoice(userId, userProfile, paymentData);
        res.status(200).json({ success: true, data: invoiceData });
    } catch (error) {
        console.error("Invoice Error:", error.message);
        res.status(500).json({ success: false, error: "Failed to generate invoice." });
    }
};

function buildInvoice(userId, userProfile, paymentData) {
    return {
        invoice_id: paymentData?.trx_id || `INV-${userId.slice(0, 6).toUpperCase()}`,
        date: paymentData?.created_at || userProfile.created_at,
        user_details: {
            name: userProfile.name,
            email: userProfile.email,
            phone: userProfile.phone,
            institution: userProfile.institution,
            address: userProfile.district,
        },
        payment_details: {
            amount: paymentData?.amount || 0,
            trx_id: paymentData?.trx_id || "N/A",
            method: "bKash Online Payment",
            payment_phone: paymentData?.customer_number || "N/A",
            status: "Paid",
        },
        items: [
            {
                description: "Zero Olympiad Registration Fee",
                unit_price: paymentData?.amount || 0,
                quantity: 1,
                total: paymentData?.amount || 0,
            },
        ],
    };
}

module.exports = { getUserInvoice };
