const axios = require('axios');
const supabase = require('../config/db');
const crypto = require('crypto');

// bKash Spec অনুযায়ী 30s timeout
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

        if (!headers) return res.status(500).json({ error: "bKash Auth Failed." });

        const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/create`, {
            mode: '0011', 
            payerReference: "User_Registration",
            callbackURL: process.env.BKASH_CALLBACK_URL,
            amount: amount ? amount.toString() : "300", 
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: "Inv_" + crypto.randomUUID().substring(0, 8)
        }, { headers });

        if (data.statusCode && data.statusCode !== '0000') {
            return res.status(400).json({ error: data.statusMessage });
        }

        res.status(200).json({ bkashURL: data.bkashURL });
    } catch (error) {
        console.error("Payment Creation Error:", error.message);
        res.status(500).json({ error: "Payment creation failed" });
    }
};

// --- Execute Payment (Updated with Correct Query URL) ---
exports.bkashCallback = async (req, res) => {
    try {
        const { paymentID, status } = req.query;

        if (status === 'cancel' || status === 'failure') {
            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?status=${status}`);
        }

        const headers = await getAuthHeaders();
        if (!headers) throw new Error("Auth headers failed");

        if (status === 'success') {
            const cleanPaymentID = String(paymentID).trim();
            let paymentData;

            // A. Execute API Call
            try {
                console.log("Executing Payment ID:", cleanPaymentID);
                const { data } = await bkashAxios.post(
                    `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/execute`, 
                    { paymentId: cleanPaymentID }, 
                    { headers }
                );
                paymentData = data;
                console.log("Execute Response:", paymentData);

            } catch (execError) {
                console.error("Execute API Failed. Trying Query API Fallback...");
                
                // B. Query API Fallback (DOC PAGE 27 অনুযায়ী FIX)
                try {
                    const { data: queryData } = await bkashAxios.post(
                        `${process.env.BKASH_BASE_URL}/tokenized-checkout/query/payment`, // ✅ Correct URL
                        { paymentId: cleanPaymentID }, // ✅ POST Body
                        { headers }
                    );
                    paymentData = queryData;
                    console.log("Query API Result:", paymentData);
                } catch (queryError) {
                    console.error("Query API also failed:", queryError.message);
                    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=verification_failed`);
                }
            }

            // C. Validate & Save
            if (paymentData && (paymentData.statusCode === '0000' || paymentData.transactionStatus === 'Completed')) {
                
                const finalTrxId = paymentData.trxID || paymentData.trxId;
                const verificationToken = crypto.randomUUID();
                const paymentAmount = paymentData.amount ? parseFloat(paymentData.amount) : 0;

                const { error: dbError } = await supabase.from('payment_verifications').insert({
                    payment_id: cleanPaymentID, 
                    trx_id: finalTrxId,
                    amount: paymentAmount,
                    verification_token: verificationToken,
                    status: 'completed',
                    customer_number: paymentData.customerMsisdn || paymentData.payerAccount
                });

                if (dbError) console.error("DB Error:", dbError);

                return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`);
            
            } else {
                return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${paymentData.statusMessage}`);
            }
        }
    } catch (error) {
        console.error("Callback Exception:", error.message);
        res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=internal_error`);
    }
};

// --- Query Payment API (Fixed according to Page 27) ---
exports.queryPayment = async (req, res) => {
    try {
        const { paymentID } = req.params;
        const headers = await getAuthHeaders();

        // ✅ URL: /tokenized-checkout/query/payment
        // ✅ Method: POST
        const { data } = await bkashAxios.post(
            `${process.env.BKASH_BASE_URL}/tokenized-checkout/query/payment`,
            { paymentId: paymentID },
            { headers }
        );

        res.status(200).json(data);
    } catch (error) {
        console.error("Query API Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.message });
    }
};

// --- Search Transaction API (Fixed according to Page 29) ---
exports.searchTransaction = async (req, res) => {
    try {
        const { trxID } = req.params;
        const headers = await getAuthHeaders();
        console.log("Searching TRX:", trxID);

        // ✅ URL: /tokenized-checkout/general/search-transaction ( হাইফেন আছে! )
        // ✅ Method: POST
        const { data } = await bkashAxios.post(
            `${process.env.BKASH_BASE_URL}/tokenized-checkout/general/search-transaction`,
            { trxId: trxID },
            { headers }
        );

        res.status(200).json(data);
    } catch (error) {
        console.error("Search API Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.message });
    }
};

// --- Refund API (Page 30) ---
exports.refundTransaction = async (req, res) => {
    try {
        const { paymentId, amount, trxId, reason } = req.body;
        const headers = await getAuthHeaders();

        const { data } = await bkashAxios.post(
            `${process.env.BKASH_BASE_URL}/tokenized-checkout/refund/payment/transaction`,
            {
                paymentId: paymentId, 
                refundAmount: amount,
                trxId: trxId, 
                sku: "payment",
                reason: reason || "System refund"
            },
            { headers }
        );

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};