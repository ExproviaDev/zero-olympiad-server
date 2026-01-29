const axios = require('axios');
const supabase = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// ১. ৩০ সেকেন্ড টাইমআউট কনফিগারেশন (বিকাশ রিকোয়ারমেন্ট)
const bkashAxios = axios.create({
    timeout: 30000 
});

const getAuthHeaders = async () => {
    try {
        // Vercel-এ এনভায়রনমেন্ট ভেরিয়েবল চেক করা
        if (!process.env.BKASH_USERNAME || process.env.BKASH_USERNAME === "BKASH_USERNAME") {
            console.error("CRITICAL: bKash Credentials are missing in Environment Variables!");
            return null;
        }

        const { data: tokenData } = await supabase
            .from('bkash_tokens')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        let token;
        const currentTime = new Date();
        
        // টোকেন চেক: যদি টোকেন না থাকে বা ৫০ মিনিট (৩০০০ সেকেন্ড) পার হয়ে যায়
        const isExpired = !tokenData || (currentTime - new Date(tokenData.updated_at) > 3000 * 1000);

        if (isExpired) {
            console.log("Fetching new bKash Grant Token...");
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
            
            // ডাটাবেসে টোকেন সেভ করা
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
        return null; // ক্রাশ প্রতিরোধ করতে null রিটার্ন
    }
};

// ২. Query Payment Function (Mandatory: Execute ফেইল করলে এটি চেক করবে)
const queryPayment = async (paymentID, headers) => {
    try {
        const { data } = await bkashAxios.post(
            `${process.env.BKASH_BASE_URL}/tokenized/checkout/payment/status`,
            { paymentID },
            { headers }
        );
        return data;
    } catch (error) {
        console.error("Query Payment API Error:", error.message);
        return null;
    }
};

// ৩. পেমেন্ট রিকোয়েস্ট তৈরি
exports.createPayment = async (req, res) => {
    try {
        const { amount } = req.body;
        const headers = await getAuthHeaders();

        if (!headers) {
            return res.status(500).json({ error: "Payment gateway authentication failed." });
        }

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
        console.error("Create Payment Error:", error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
};

// ৪. বিকাশ কলব্যাক হ্যান্ডেল করা
exports.bkashCallback = async (req, res) => {
    const { paymentID, status } = req.query;

    if (status === 'success') {
        try {
            const headers = await getAuthHeaders();
            if (!headers) throw new Error("Auth headers missing");

            // Execute Payment
            let { data } = await bkashAxios.post(
                `${process.env.BKASH_BASE_URL}/tokenized/checkout/execute`, 
                { paymentID }, 
                { headers }
            );

            // যদি Execute API রেসপন্স না দেয় বা সাকসেস না হয়, তবে Query API কল করা (Mandatory)
            if (!data || data.statusCode !== '0000') {
                console.log("Execute failed, trying Query Payment...");
                data = await queryPayment(paymentID, headers);
            }

            // পেমেন্ট সফল হলে
            if (data && (data.transactionStatus === 'Completed' || data.statusCode === '0000')) {
                const regToken = uuidv4();

                // পেমেন্ট ভেরিফিকেশন সেভ করা
                await supabase.from('payment_verifications').insert({
                    payment_id: paymentID,
                    trx_id: data.trxID, 
                    amount: data.amount,
                    verification_token: regToken,
                    status: 'completed'
                });

                // রেজিস্ট্রেশনের ধাপ ৩-এ রিডাইরেক্ট করা
                return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${regToken}`);
            }
        } catch (e) {
            console.error("Callback Fatal Error:", e.message);
        }
    }
    
    // ব্যর্থ হলে ফেইল পেজে রিডাইরেক্ট
    res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
};