const axios = require('axios');
const supabase = require('../config/db');
const sql = require('../config/pg');
const crypto = require('crypto');

// bKash Spec অনুযায়ী 30s timeout
const bkashAxios = axios.create({
    timeout: 30000
});

// ✅ bKash Error Code Mapping
const getBkashErrorMessage = (code) => {
    const errors = {
        '2001': 'Invalid App Key',
        '2002': 'Invalid Payment ID',
        '2003': 'Process failed',
        '2004': 'Invalid firstPaymentDate',
        '2005': 'Invalid frequency',
        '2006': 'Invalid amount',
        '2007': 'Invalid currency',
        '2008': 'Invalid intent',
        '2009': 'Invalid Wallet',
        '2010': 'Invalid OTP',
        '2011': 'Invalid PIN',
        '2012': 'Invalid Receiver MSISDN',
        '2013': 'Resend Limit Exceeded',
        '2014': 'Wrong PIN',
        '2015': 'Wrong PIN count exceeded',
        '2016': 'Wrong verification code',
        '2017': 'Wrong verification limit exceeded',
        '2018': 'OTP verification time expired',
        '2019': 'PIN verification time expired',
        '2020': 'Exception Occurred',
        '2021': 'Invalid Mandate ID',
        '2022': 'The mandate does not exist',
        '2023': 'Insufficient Balance',
        '2024': 'Exception occurred',
        '2025': 'Invalid request body',
        '2026': 'The reversal amount cannot be greater than the original transaction amount',
        '2027': 'The mandate corresponding to the payer reference number already exists',
        '2028': 'Reverse failed because the transaction serial number does not exist',
        '2029': 'Duplicate for all transactions',
        '2030': 'Invalid mandate request type',
        '2031': 'Invalid merchant invoice number',
        '2032': 'Invalid transfer type',
        '2033': 'Transaction not found',
        '2034': 'The transaction cannot be reversed',
        '2035': 'Reverse failed because the initiator has no permission',
        '2036': 'The direct debit mandate is not in Active state',
        '2037': 'The account of the debit party is in a state which prohibits execution',
        '2038': 'Debit party identity tag prohibits execution',
        '2039': 'The account of the credit party is in a state which prohibits execution',
        '2040': 'Credit party identity tag prohibits execution',
        '2041': 'Credit party identity is in a state which does not support the current service',
        '2042': 'Reverse failed because the initiator has no permission',
        '2043': 'The security credential of the subscriber is incorrect',
        '2044': 'Identity has not subscribed to a product that contains the expected service',
        '2045': 'The MSISDN of the customer does not exist',
        '2046': 'Identity has not subscribed to a product that contains requested service',
        '2047': 'TLV Data Format Error',
        '2048': 'Invalid Payer Reference',
        '2049': 'Invalid Merchant Callback URL',
        '2050': 'Agreement already exists between payer and merchant',
        '2051': 'Invalid Agreement ID',
        '2052': 'Agreement is in incomplete state',
        '2053': 'Agreement has already been cancelled',
        '2054': 'Agreement execution pre-requisite has not been met',
        '2055': 'Invalid Agreement State',
        '2056': 'Invalid Payment State',
        '2057': 'Not a bKash Account',
        '2058': 'Not a Customer Wallet',
        '2059': 'Multiple OTP request for a single session denied',
        '2060': 'Payment execution pre-requisite has not been met',
        '2061': 'This action can only be performed by the agreement or payment initiator party',
        '2062': 'The payment has already been completed',
        '2063': 'Mode is not valid as per request data',
        '2064': 'This product mode currently unavailable',
        '2065': 'Mandatory field missing',
        '2066': 'Agreement is not shared with other merchant',
        '2067': 'Invalid permission',
        '2068': 'Transaction has already been completed',
        '2069': 'Transaction has already been cancelled',
        '503': 'System is undergoing maintenance. Please try again later'
    };
    return errors[code] || null;
};

// --- Auth Headers Handler ---
// forceRefresh=true দিলে cached token ignore করে নতুন token আনবে
const getAuthHeaders = async ({ forceRefresh = false } = {}) => {
    try {
        const { BKASH_USERNAME, BKASH_PASSWORD, BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_BASE_URL } = process.env;

        if (!BKASH_USERNAME || !BKASH_PASSWORD || !BKASH_APP_KEY || !BKASH_APP_SECRET) {
            console.error("❌ Critical Error: bKash credentials missing in .env");
            return null;
        }

        let tokenData = null;
        if (sql) {
            try {
                const rows = await sql`
                    SELECT auth_token, updated_at FROM bkash_tokens WHERE id = 1 LIMIT 1
                `;
                tokenData = rows[0] ?? null;
            } catch (e) {
                console.warn('[bKash Token] pg read failed, falling back:', e.message);
            }
        }
        if (!tokenData) {
            const { data } = await supabase
                .from('bkash_tokens')
                .select('auth_token, updated_at')
                .eq('id', 1)
                .maybeSingle();
            tokenData = data ?? null;
        }

        let token;
        const now = Date.now();
        const TOKEN_VALIDITY_MS = 55 * 60 * 1000; // 55 minutes

        const isExpired =
            forceRefresh ||
            !tokenData ||
            !tokenData.auth_token ||
            !tokenData.updated_at ||
            now - new Date(tokenData.updated_at).getTime() > TOKEN_VALIDITY_MS;

        if (isExpired) {
            console.log(`🔄 [bKash Token] Fetching new token from bKash...${forceRefresh ? " (forced)" : ""}`);
            const tokenStartTime = Date.now();
            
            try {
                const response = await bkashAxios.post(
                    `${BKASH_BASE_URL}/tokenized-checkout/auth/grant-token`,
                    { app_key: BKASH_APP_KEY, app_secret: BKASH_APP_SECRET },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "application/json",
                            "username": BKASH_USERNAME,
                            "password": BKASH_PASSWORD
                        }
                    }
                );

                token = response.data.id_token;
                const tokenGenerationTime = Date.now() - tokenStartTime;
                console.log(`✅ [bKash Token] Generated in ${tokenGenerationTime}ms`);

                if (sql) {
                    sql`
                        INSERT INTO bkash_tokens (id, auth_token, updated_at)
                        VALUES (1, ${token}, NOW())
                        ON CONFLICT (id) DO UPDATE
                            SET auth_token = EXCLUDED.auth_token, updated_at = NOW()
                    `.catch((err) => {
                        console.error("⚠️ [bKash Token] DB cache failed:", err?.message || err);
                    });
                } else {
                    supabase
                        .from('bkash_tokens')
                        .upsert({
                            id: 1,
                            auth_token: token,
                            updated_at: new Date().toISOString()
                        })
                        .then(({ error: cacheError }) => {
                            if (cacheError) {
                                console.error("⚠️ [bKash Token] DB cache failed:", cacheError.message);
                            }
                        })
                        .catch?.((err) => {
                            console.error("⚠️ [bKash Token] DB cache failed:", err?.message || err);
                        });
                }

            } catch (tokenError) {
                console.error("❌ [bKash Token] Generation failed:", tokenError.message);
                // Forced refresh fail হলে stale token দিয়ে proceed করা উচিত না (401 loop তৈরি হয়)
                if (forceRefresh) return null;

                // Non-forced path এ last-resort fallback (avoid total outage)
                if (tokenData?.auth_token) {
                    console.warn("⚠️ [bKash Token] Using cached token as last-resort fallback");
                    token = tokenData.auth_token;
                } else return null;
            }
        } else {
            token = tokenData.auth_token;
            const tokenAge = Math.round((now - new Date(tokenData.updated_at).getTime()) / 1000);
            console.log(`✅ [bKash Token] Using cached token (age: ${tokenAge}s)`);
        }

        return {
            Authorization: token,
            "X-App-Key": BKASH_APP_KEY,
            Accept: "application/json",
            "Content-Type": "application/json"
        };
    } catch (error) {
        console.error("❌ [bKash Auth] Unexpected error:", error.message);
        return null;
    }
};


// --- Create Payment ---
exports.createPayment = async (req, res) => {
    try {
        const startTime = Date.now();
        console.log("🔄 [bKash] Payment create initiated");
        
        const headers = await getAuthHeaders();
        if (!headers) {
            console.error("❌ [bKash] Auth failed - headers null");
            return res.status(500).json({ error: "bKash Auth Failed. Please try again." });
        }
        
        const tokenTime = Date.now() - startTime;
        console.log(`✅ [bKash] Auth completed in ${tokenTime}ms`);
        
        const merchantInvoiceNumber = "Inv_" + crypto.randomUUID().substring(0, 8);

        const createPayload = {
            mode: '0011',
            payerReference: "User_Registration",
            callbackURL: process.env.BKASH_CALLBACK_URL,
            // amount: amount ? amount.toString() : "300",
            amount: "300",
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: merchantInvoiceNumber
        };

        let data;
        try {
            const resp = await bkashAxios.post(
                `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/create`,
                createPayload,
                { headers }
            );
            data = resp.data;
        } catch (err) {
            const status = err?.response?.status;
            const msg = err?.response?.data?.message || err?.response?.data?.errorMessageEn || err?.message;

            // Token expired / Unauthorized => force refresh and retry once
            if (status === 401 || /token.*expired/i.test(String(msg || ""))) {
                console.warn("⚠️ [bKash] Unauthorized/expired token. Forcing token refresh & retry...");
                const refreshedHeaders = await getAuthHeaders({ forceRefresh: true });
                if (!refreshedHeaders) {
                    return res.status(500).json({ error: "bKash Auth refresh failed. Please try again." });
                }

                const retryResp = await bkashAxios.post(
                    `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/create`,
                    createPayload,
                    { headers: refreshedHeaders }
                );
                data = retryResp.data;
            } else {
                throw err;
            }
        }

        console.log(`[bKash] Payment create response:`, {
            statusCode: data?.statusCode,
            hasURL: !!data?.bkashURL,
            errorCode: data?.errorCode
        });

        if (data.errorMessageEn || (data.statusCode && data.statusCode !== '0000')) {
            const code = data.statusCode || data.errorCode;
            const mappedError = getBkashErrorMessage(code);
            const finalError = mappedError || data.errorMessageEn || data.statusMessage || "Unknown Error";
            console.error(`❌ [bKash] Payment creation error: ${finalError} (Code: ${code})`);
            return res.status(400).json({ error: finalError });
        }

        console.log(`✅ [bKash] Payment created successfully. Total time: ${Date.now() - startTime}ms`);
        res.status(200).json({ bkashURL: data.bkashURL });
    } catch (error) {
        console.error("❌ [bKash] Payment Creation Error:", error.message);
        const responseData = error.response?.data;
        let finalError = "Payment creation failed";

        if (responseData) {
            const code = responseData.statusCode || responseData.errorCode;
            const mappedError = getBkashErrorMessage(code);
            finalError = mappedError || responseData.errorMessageEn || responseData.message || finalError;
        }

        if (error.code === 'ECONNABORTED') {
            finalError = "Request timeout. bKash server is slow. Please try again.";
            console.error("⏱️ [bKash] Timeout error:", finalError);
        }

        res.status(500).json({ error: finalError });
    }
};

exports.bkashCallback = async (req, res) => {
    try {
        const { paymentID, status } = req.query;
        if (!paymentID || !status) return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=Invalid Callback`);

        const cleanPaymentID = String(paymentID).trim();
        const now = new Date();
        let errorMessage = "Payment Failed";
        let invoiceNumber = `INV-${Date.now()}`;
        let transactionTime = now.toISOString();

        const headers = await getAuthHeaders();
        if (!headers) return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=Auth Failed`);

        // 1️⃣ CANCEL CASE
        if (status === 'cancel') {
            errorMessage = "Payment Cancelled";

            // 📄 PDF LOG: Query call just for logs (optional but helpful for PDF)
            try {
                const { data: cancelQuery } = await bkashAxios.post(
                    `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/query`,
                    { paymentId: cleanPaymentID }, { headers }
                );
            } catch (e) { console.log("Cancel Log Query Skipped"); }

            if (sql) {
                await sql`
                    INSERT INTO payment_logs (payment_id, invoice, status, message, created_at)
                    VALUES (${cleanPaymentID}, ${invoiceNumber}, 'cancelled', ${errorMessage}, ${transactionTime})
                `;
            } else {
                await supabase.from('payment_logs').insert({
                    payment_id: cleanPaymentID, invoice: invoiceNumber, status: 'cancelled', message: errorMessage, created_at: transactionTime
                });
            }

            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(errorMessage)}&invoice=${invoiceNumber}`);
        }

        // 2️⃣ FAILURE CASE
        if (status === 'failure') {
            try {
                const { data } = await bkashAxios.post(
                    `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/query`,
                    { paymentId: cleanPaymentID }, { headers }
                );


                if (data) {
                    invoiceNumber = data.merchantInvoiceNumber || invoiceNumber;
                    transactionTime = data.paymentCreateTime || transactionTime;
                    const code = data.statusCode || data.errorCode;
                    errorMessage = getBkashErrorMessage(code) || data.errorMessageEn || data.statusMessage || "Payment Failed";
                }
            } catch (err) {
                errorMessage = "Payment Failed";
            }

            if (sql) {
                await sql`
                    INSERT INTO payment_logs (payment_id, invoice, status, message, created_at)
                    VALUES (${cleanPaymentID}, ${invoiceNumber}, 'failed', ${errorMessage}, ${transactionTime})
                `;
            } else {
                await supabase.from('payment_logs').insert({
                    payment_id: cleanPaymentID, invoice: invoiceNumber, status: 'failed', message: errorMessage, created_at: transactionTime
                });
            }

            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(errorMessage)}&invoice=${invoiceNumber}`);
        }

        // 3️⃣ SUCCESS CASE
        if (status === 'success') {
            let paymentData;
            try {
                const { data } = await bkashAxios.post(
                    `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/execute`,
                    { paymentId: cleanPaymentID }, { headers }
                );
                paymentData = data;

            } catch (execErr) {
                try {
                    const { data } = await bkashAxios.post(
                        `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/query`,
                        { paymentId: cleanPaymentID }, { headers }
                    );
                    paymentData = data;
                } catch {
                    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=Payment Verification Failed`);
                }
            }

            // if (paymentData && (paymentData.statusCode === '0000' || paymentData.transactionStatus === 'Completed')) {
            //     const trxId = paymentData.trxID || paymentData.trxId;
            //     const verificationToken = crypto.randomUUID();

            //     await supabase.from('payment_verifications').insert({
            //         payment_id: cleanPaymentID,
            //         trx_id: trxId,
            //         amount: parseFloat(paymentData.amount || 0),
            //         verification_token: verificationToken,
            //         status: 'completed',
            //         customer_number: paymentData.customerMsisdn || paymentData.payerAccount
            //     });

            //     return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`);
            // }
            if (paymentData && (paymentData.statusCode === '0000' || paymentData.transactionStatus === 'Completed')) {

                // ✅ বাগ ফিক্স: এখানে চেক করতে হবে ইউজার আসলেই ৩০০ টাকা দিয়েছে কি না
                const paidAmount = parseFloat(paymentData.amount || 0);
                if (paidAmount < 300) {
                    if (sql) {
                        await sql`
                            INSERT INTO payment_logs (payment_id, invoice, status, message, created_at)
                            VALUES (${cleanPaymentID}, ${invoiceNumber}, 'failed', 'Amount mismatch/Partial payment', ${transactionTime})
                        `;
                    } else {
                        await supabase.from('payment_logs').insert({
                            payment_id: cleanPaymentID, invoice: invoiceNumber, status: 'failed', message: 'Amount mismatch/Partial payment', created_at: transactionTime
                        });
                    }
                    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=Invalid Payment Amount`);
                }

                // ৩০০ টাকা ঠিক থাকলে এরপর ডাটাবেসে এন্ট্রি হবে
                const trxId = paymentData.trxID || paymentData.trxId;
                const verificationToken = crypto.randomUUID();

                if (sql) {
                    await sql`
                        INSERT INTO payment_verifications (
                            payment_id, trx_id, amount, verification_token, status, customer_number
                        ) VALUES (
                            ${cleanPaymentID}, ${trxId}, ${paidAmount}, ${verificationToken}, 'completed',
                            ${paymentData.customerMsisdn || paymentData.payerAccount}
                        )
                    `;
                    return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`);
                }

                await supabase.from('payment_verifications').insert({
                    payment_id: cleanPaymentID,
                    trx_id: trxId,
                    amount: paidAmount, // এখানে paidAmount ভ্যারিয়েবলটা দিয়ে দিলাম
                    verification_token: verificationToken,
                    status: 'completed',
                    customer_number: paymentData.customerMsisdn || paymentData.payerAccount
                });

                return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`);
            } else {
                const code = paymentData?.statusCode || paymentData?.errorCode;
                errorMessage = getBkashErrorMessage(code) || paymentData?.errorMessageEn || "Payment Processing Failed";
                invoiceNumber = paymentData?.merchantInvoiceNumber || invoiceNumber;

                if (sql) {
                    await sql`
                        INSERT INTO payment_logs (payment_id, invoice, status, message, created_at)
                        VALUES (${cleanPaymentID}, ${invoiceNumber}, 'failed', ${errorMessage}, ${transactionTime})
                    `;
                } else {
                    await supabase.from('payment_logs').insert({
                        payment_id: cleanPaymentID, invoice: invoiceNumber, status: 'failed', message: errorMessage, created_at: transactionTime
                    });
                }

                return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(errorMessage)}&invoice=${invoiceNumber}`);
            }
        }

        return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=Unknown Payment Status`);
    } catch (error) {
        console.error("Callback Error:", error.message);
        return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=Server Error`);
    }
};

// --- Query & Search APIs (With PDF Logs) ---
exports.queryPayment = async (req, res) => {
    try {
        const { paymentID } = req.params;
        const headers = await getAuthHeaders();
        const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized-checkout/query/payment`, { paymentId: paymentID }, { headers });

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.searchTransaction = async (req, res) => {
    try {
        const { trxID } = req.params;
        const headers = await getAuthHeaders();
        const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized-checkout/general/search-transaction`, { trxId: trxID }, { headers });


        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Refund API ---
exports.refundTransaction = async (req, res) => {
    try {
        const { paymentId, amount, trxId, reason } = req.body;
        const headers = await getAuthHeaders();
        const { data } = await bkashAxios.post(
            `${process.env.BKASH_BASE_URL}/tokenized-checkout/refund/payment/transaction`,
            { paymentId: paymentId, refundAmount: amount, trxId: trxId, sku: "payment", reason: reason || "System refund" },
            { headers }
        );
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};