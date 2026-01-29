const axios = require('axios');
const supabase = require('../config/db');
const crypto = require('crypto'); // uuid-এর বদলে এটি ব্যবহার করো, কোনো প্যাকেজ ইনস্টল করা লাগে না

// ৩০ সেকেন্ড টাইমআউট (বিকাশ স্পেসিফিকেশন অনুযায়ী)
const bkashAxios = axios.create({
    timeout: 30000
});

const getAuthHeaders = async () => {
    try {
        const { BKASH_USERNAME, BKASH_PASSWORD, BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_BASE_URL } = process.env;

        // ক্রেডেনশিয়াল না থাকলে ক্রাশ রোধ করা
        if (!BKASH_USERNAME || BKASH_USERNAME === "BKASH_USERNAME") {
            console.warn("bKash credentials not configured in environment.");
            return null;
        }

        const { data: tokenData } = await supabase.from('bkash_tokens').select('*').eq('id', 1).maybeSingle();

        let token;
        const currentTime = new Date();
        const isExpired = !tokenData || !tokenData.updated_at || (currentTime - new Date(tokenData.updated_at) > 3000 * 1000);

        if (isExpired) {
            console.log("Requesting new bKash Token...");
            const response = await bkashAxios.post(`${BKASH_BASE_URL}/tokenized/checkout/token/grant`, {
                app_key: BKASH_APP_KEY,
                app_secret: BKASH_APP_SECRET
            }, {
                headers: { username: BKASH_USERNAME, password: BKASH_PASSWORD }
            });

            token = response.data.id_token;
            await supabase.from('bkash_tokens').upsert({
                id: 1,
                auth_token: token,
                updated_at: new Date().toISOString()
            });
        } else {
            token = tokenData.auth_token;
        }

        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "authorization": token,
            "x-app-key": BKASH_APP_KEY
        };
    } catch (error) {
        console.error("bKash Auth Process Failed:", error.message);
        return null;
    }
};

// --- পেমেন্ট তৈরি ---
exports.createPayment = async (req, res) => {
    try {
        const { amount } = req.body;
        const headers = await getAuthHeaders();

        if (!headers) return res.status(503).json({ error: "Payment gateway setup incomplete" });

        const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized/checkout/create`, {
            mode: "0011",
            currency: "BDT",
            intent: "sale",
            amount: amount,
            callbackURL: `${process.env.BACKEND_URL}/api/bkash/callback`,
            // uuidv4() এর বদলে crypto.randomUUID() ব্যবহার করো
            merchantInvoiceNumber: "Inv_" + crypto.randomUUID().substring(0, 8)
        }, { headers });

        res.status(200).json(data);
    } catch (error) {
        console.error("Payment Creation Error:", error.message);
        res.status(500).json({ error: error.message });
    }
};

// --- কলব্যাক হ্যান্ডেল ---
exports.bkashCallback = async (req, res) => {
    try {
        const { paymentID, status } = req.query;
        if (status !== 'success') return res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);

        const headers = await getAuthHeaders();
        if (!headers) throw new Error("Credentials missing during callback");

        const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized/checkout/execute`, { paymentID }, { headers });

        if (data && data.statusCode === '0000') {
            const regToken = crypto.randomUUID(); // এখানেও randomUUID

            await supabase.from('payment_verifications').insert({
                payment_id: paymentID,
                trx_id: data.trxID,
                amount: data.amount,
                verification_token: regToken,
                status: 'completed'
            });

            return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${regToken}`);
        }
    } catch (e) {
        console.error("bKash Callback Processing Error:", e.message);
    }
    res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
};