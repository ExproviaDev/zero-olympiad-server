const axios = require('axios');
const supabase = require('../config/db');
const crypto = require('crypto');

// bKash Spec অনুযায়ী 30s timeout [cite: 176]
const bkashAxios = axios.create({
    timeout: 30000
});

// --- Auth Headers Handler ---
const getAuthHeaders = async () => {
    try {
        const { BKASH_USERNAME, BKASH_PASSWORD, BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_BASE_URL } = process.env;

        if (!BKASH_USERNAME || !BKASH_PASSWORD) {
            console.error("Critical Error: bKash Credentials missing in .env");
            return null;
        }

        // Supabase থেকে existing token check করা
        const { data: tokenData } = await supabase.from('bkash_tokens').select('*').eq('id', 1).maybeSingle();

        let token;
        const currentTime = new Date();
        // Token সাধারণত ৩৬০০ সেকেন্ড (১ ঘণ্টা) ভ্যালিড থাকে [cite: 304]
        const isExpired = !tokenData || !tokenData.updated_at || (currentTime - new Date(tokenData.updated_at) > 3500 * 1000);

        if (isExpired) {
            console.log("Fetching new bKash Token...");
            
            // ✅ FIX 1: সঠিক URL (PDF Page 11 অনুযায়ী) [cite: 300]
            // আগে ছিল: /tokenized-checkout/token/grant (ভুল)
            const response = await bkashAxios.post(`${BKASH_BASE_URL}/tokenized-checkout/auth/grant-token`, {
                app_key: BKASH_APP_KEY,   // Body parameter [cite: 302]
                app_secret: BKASH_APP_SECRET // Body parameter [cite: 302]
            }, {
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "username": BKASH_USERNAME, // Header parameter [cite: 302]
                    "password": BKASH_PASSWORD  // Header parameter [cite: 302]
                }
            });

            token = response.data.id_token; // [cite: 304]

            // Supabase-এ token save/update করা
            await supabase.from('bkash_tokens').upsert({
                id: 1,
                id_token: token,
                updated_at: new Date().toISOString()
            });
            console.log("Token Generated Successfully");
        } else {
            token = tokenData.id_token;
        }

        return {
            'authorization': token, // [cite: 377]
            'x-app-key': BKASH_APP_KEY, // [cite: 377]
            'accept': 'application/json'
        };
    } catch (error) {
        console.error("bKash Auth Error Details:", error.response ? error.response.data : error.message);
        return null;
    }
};

// --- Create Payment ---
exports.createPayment = async (req, res) => {
    try {
        const { amount } = req.body;
        const headers = await getAuthHeaders();

        if (!headers) return res.status(500).json({ error: "bKash Auth Failed. Check Terminal." });

        // ✅ FIX 2: সঠিক URL (PDF Page 22 অনুযায়ী) [cite: 584]
        // আগে ছিল: /tokenized-checkout/create (ভুল)
        const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/create`, {
            mode: '0011', 
            payerReference: "User_Registration", // [cite: 587]
            callbackURL: process.env.BKASH_CALLBACK_URL, // [cite: 587]
            amount: amount ? amount.toString() : "10", // [cite: 587]
            currency: "BDT", // [cite: 587]
            intent: "sale", // [cite: 587]
            merchantInvoiceNumber: "Inv_" + crypto.randomUUID().substring(0, 8) // [cite: 587]
        }, { headers });

        if (data.statusCode && data.statusCode !== '0000') {
            console.error("bKash Create Error:", data.statusMessage);
            return res.status(400).json({ error: data.statusMessage });
        }

        res.status(200).json({ bkashURL: data.bkashURL }); // [cite: 592]
    } catch (error) {
        console.error("Payment Creation Exception:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Payment creation failed" });
    }
};

// --- Callback Handler ---
exports.bkashCallback = async (req, res) => {
    try {
        const { paymentID, status } = req.query;

        if (status === 'cancel' || status === 'failure') {
            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?status=${status}`);
        }

        const headers = await getAuthHeaders();
        if (!headers) throw new Error("Auth headers failed during execution");

        if (status === 'success') {
            // ✅ FIX 3: সঠিক URL (PDF Page 24 অনুযায়ী) [cite: 633]
            // আগে ছিল: /tokenized-checkout/execute (ভুল)
            const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/execute`, 
                { paymentID }, // [cite: 635]
                { headers }
            );

            if (data && data.statusCode === '0000') { // [cite: 289]
                const verificationToken = crypto.randomUUID();

                // Payment সফল হলে Database-এ save করা
                await supabase.from('payment_verifications').insert({
                    payment_id: paymentID,
                    trx_id: data.trxID, // [cite: 639]
                    amount: data.amount,
                    verification_token: verificationToken,
                    status: 'completed',
                    customer_number: data.customerMsisdn || data.payerAccount // payerAccount V2 তে থাকে [cite: 639]
                });

                return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`);
            } else {
                console.error("Execute Payment Failed:", data.statusMessage);
                return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${data.statusMessage}`);
            }
        }
    } catch (error) {
        console.error("bKash Callback Exception:", error.response ? error.response.data : error.message);
        res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=internal_error`);
    }
};