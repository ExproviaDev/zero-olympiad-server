const axios = require('axios');
const supabase = require('../config/db');
const crypto = require('crypto');

// bKash Spec অনুযায়ী 30s timeout
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

        const { data: tokenData } = await supabase.from('bkash_tokens').select('*').eq('id', 1).maybeSingle();

        let token;
        const currentTime = new Date();
        const isExpired = !tokenData || !tokenData.updated_at || (currentTime - new Date(tokenData.updated_at) > 3500 * 1000);

        if (isExpired) {
            console.log("Fetching new bKash Token...");
            
            const response = await bkashAxios.post(`${BKASH_BASE_URL}/tokenized-checkout/auth/grant-token`, {
                app_key: BKASH_APP_KEY,
                app_secret: BKASH_APP_SECRET
            }, {
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "username": BKASH_USERNAME,
                    "password": BKASH_PASSWORD
                }
            });

            token = response.data.id_token;

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
            'Authorization': token,
            'X-App-Key': BKASH_APP_KEY,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
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

        const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/create`, {
            mode: '0011', 
            payerReference: "User_Registration",
            callbackURL: process.env.BKASH_CALLBACK_URL,
            amount: amount ? amount.toString() : "10",
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: "Inv_" + crypto.randomUUID().substring(0, 8)
        }, { headers });

        if (data.statusCode && data.statusCode !== '0000') {
            return res.status(400).json({ error: data.statusMessage });
        }

        res.status(200).json({ bkashURL: data.bkashURL });
    } catch (error) {
        console.error("Payment Creation Exception:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Payment creation failed" });
    }
};

// --- Callback Handler (Fixed for Invalid Request Body) ---
// exports.bkashCallback = async (req, res) => {
//     try {
//         const { paymentID, status } = req.query;

//         console.log("Callback Hit:", { paymentID, status });

//         if (status === 'cancel' || status === 'failure') {
//             return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?status=${status}`);
//         }

//         const headers = await getAuthHeaders();
//         if (!headers) throw new Error("Auth headers failed during execution");

//         if (status === 'success') {
//             try {
//                 // ১. paymentID ক্লিন করা
//                 const cleanPaymentID = String(paymentID).trim();
                
//                 console.log("Executing Payment ID:", cleanPaymentID);

//                 // ২. Execute API Call (Correct Key: paymentId)
//                 // আপনার PDF এর Page 24, Sample Request দেখুন: "paymentId" (ছোট হাতের d)
//                 const { data } = await bkashAxios.post(
//                     `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/execute`, 
//                     { paymentId: cleanPaymentID }, // ⚠️ FIX: paymentID -> paymentId
//                     { headers }
//                 );

//                 console.log("Execute Response:", data);

//                 if (data && (data.statusCode === '0000' || data.statusCode === '2062')) {
//                     const verificationToken = crypto.randomUUID();
//                     const trxId = data.trxID || data.trxId;
//                     const paymentAmount = data.amount ? parseFloat(data.amount) : 0;

//                     // ৩. ডাটাবেসে সেভ (এখানে আমরা আমাদের কলামের নাম 'payment_id' ব্যবহার করব)
//                     const { error: dbError } = await supabase.from('payment_verifications').insert({
//                         payment_id: cleanPaymentID, 
//                         trx_id: trxId,
//                         amount: paymentAmount,
//                         verification_token: verificationToken,
//                         status: 'completed',
//                         customer_number: data.payerAccount || data.customerMsisdn
//                     });

//                     if (dbError) {
//                         console.error("DB Error (Ignore if payment success):", dbError);
//                     }

//                     return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`);
//                 } else {
//                     console.error("Execute Failed Status:", data.statusMessage);
//                     return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${data.statusMessage}`);
//                 }

//             } catch (axiosError) {
//                 console.error("bKash Execute API Error:", axiosError.response ? axiosError.response.data : axiosError.message);
//                 const errorMsg = axiosError.response?.data?.statusMessage || "Payment Execution Failed";
//                 return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=${encodeURIComponent(errorMsg)}`);
//             }
//         }
//     } catch (error) {
//         console.error("bKash Callback Exception:", error.message);
//         res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=internal_error`);
//     }
// };

exports.bkashCallback = async (req, res) => {
    try {
        const { paymentID, status } = req.query;

        console.log("Callback Hit:", { paymentID, status });

        if (status === 'cancel' || status === 'failure') {
            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?status=${status}`);
        }

        const headers = await getAuthHeaders();
        if (!headers) throw new Error("Auth headers failed during execution");

        if (status === 'success') {
            try {
                const cleanPaymentID = String(paymentID).trim();
                console.log("Executing Payment ID:", cleanPaymentID);

                // Execute API Call
                const { data } = await bkashAxios.post(
                    `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/execute`, 
                    { paymentId: cleanPaymentID }, 
                    { headers }
                );

                console.log("Execute Response:", data); // সফল হলে এখানে transactionStatus: 'Completed' আসবে

                // ✅ FIX: V2 তে statusCode '0000' আসে না, transactionStatus 'Completed' আসে
                if (data && data.transactionStatus === 'Completed') {
                    
                    const verificationToken = crypto.randomUUID();
                    const trxId = data.trxID;
                    const paymentAmount = data.amount ? parseFloat(data.amount) : 0;

                    // ডাটাবেসে সেভ
                    const { error: dbError } = await supabase.from('payment_verifications').insert({
                        payment_id: cleanPaymentID, 
                        trx_id: trxId,
                        amount: paymentAmount,
                        verification_token: verificationToken,
                        status: 'completed',
                        customer_number: data.payerAccount || data.customerMsisdn
                    });

                    if (dbError) {
                        console.error("DB Error (Ignore if payment success):", dbError);
                    }

                    // সফল হলে রেজিস্ট্রেশন পেজে পাঠানো
                    return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`);
                } else {
                    // পেমেন্ট ফেইল হলে
                    console.error("Execute Failed:", data.statusMessage || "Unknown Error");
                    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${data.statusMessage}`);
                }

            } catch (axiosError) {
                console.error("bKash Execute API Error:", axiosError.response ? axiosError.response.data : axiosError.message);
                const errorMsg = axiosError.response?.data?.statusMessage || "Payment Execution Failed";
                return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=${encodeURIComponent(errorMsg)}`);
            }
        }
    } catch (error) {
        console.error("bKash Callback Exception:", error.message);
        res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=internal_error`);
    }
};