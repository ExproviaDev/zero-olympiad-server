const axios = require('axios');
const supabase = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// ৩০ সেকেন্ড টাইমআউট কনফিগারেশন
const bkashAxios = axios.create({
    timeout: 30000 // 30 seconds as per bKash requirement
});

const getAuthHeaders = async () => {
    try {
        const { data: tokenData } = await supabase.from('bkash_tokens').select('*').eq('id', 1).maybeSingle();

        let token;
        const currentTime = new Date();
        // ৩০০০ সেকেন্ড = ৫০ মিনিট। বিকাশ টোকেন সাধারণত ১ ঘণ্টা থাকে।
        const isExpired = tokenData ? (currentTime - new Date(tokenData.updated_at) > 3000 * 1000) : true;

        if (isExpired) {
            // Grant Token API call
            const response = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized/checkout/token/grant`, {
                app_key: process.env.BKASH_APP_KEY,
                app_secret: process.env.BKASH_APP_SECRET
            }, {
                headers: {
                    username: process.env.BKASH_USERNAME,
                    password: process.env.BKASH_PASSWORD
                }
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
            "x-app-key": process.env.BKASH_APP_KEY
        };
    } catch (error) {
        console.error("bKash Auth Error:", error.response?.data || error.message);
        throw error;
    }
};

// ২. Query Payment Function (Mandatory for Compliance)
const queryPayment = async (paymentID, headers) => {
    try {
        const { data } = await bkashAxios.post(
            `${process.env.BKASH_BASE_URL}/tokenized/checkout/payment/status`,
            { paymentID },
            { headers }
        );
        return data;
    } catch (error) {
        console.error("Query Payment Error:", error.message);
        return null;
    }
};

exports.createPayment = async (req, res) => {
    try {
        const { amount } = req.body;
        const headers = await getAuthHeaders();

        const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized/checkout/create`, {
            mode: "0011",
            currency: "BDT",
            intent: "sale",
            amount: amount,
            callbackURL: `${process.env.BACKEND_URL}/api/bkash/callback`,
            merchantInvoiceNumber: "Inv_" + uuidv4().substring(0, 8)
        }, { headers });

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.bkashCallback = async (req, res) => {
    const { paymentID, status } = req.query;

    if (status === 'success') {
        try {
            const headers = await getAuthHeaders();
            
            // Execute Payment
            let { data } = await bkashAxios.post(
                `${process.env.BKASH_BASE_URL}/tokenized/checkout/execute`, 
                { paymentID }, 
                { headers }
            );

            // যদি Execute ফেইল করে কিন্তু টাকা কেটে নেয়, তবে Query API দিয়ে চেক করা
            if (data.statusCode !== '0000') {
                data = await queryPayment(paymentID, headers);
            }

            if (data && data.transactionStatus === 'Completed' || data.statusCode === '0000') {
                const regToken = uuidv4();

                await supabase.from('payment_verifications').insert({
                    payment_id: paymentID,
                    trx_id: data.trxID, // বিকাশ ট্রানজেকশন আইডি
                    amount: data.amount,
                    verification_token: regToken,
                    status: 'completed'
                });

                return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${regToken}`);
            }
        } catch (e) {
            console.error("Callback Processing Error:", e.message);
        }
    }
    res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
};