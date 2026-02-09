const axios = require('axios');
const supabase = require('../config/db');
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

// --- Auth Headers Handler (Fixed Race Condition) ---
// const getAuthHeaders = async () => {
//     try {
//         const { BKASH_USERNAME, BKASH_PASSWORD, BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_BASE_URL } = process.env;

//         if (!BKASH_USERNAME || !BKASH_PASSWORD) {
//             console.error("Critical Error: bKash Credentials missing in .env");
//             return null;
//         }

//         const { data: tokenData } = await supabase.from('bkash_tokens').select('*').eq('id', 1).maybeSingle();

//         let token;
//         const currentTime = new Date();
//         // ৩০০০ সেকেন্ড (৫০ মিনিট) এর বেশি হলে টোকেন রিনিউ করবে
//         const isExpired = !tokenData || !tokenData.updated_at || (currentTime - new Date(tokenData.updated_at) > 3000 * 1000);

//         if (isExpired) {
//             console.log("Fetching new bKash Token...");

//             const response = await bkashAxios.post(`${BKASH_BASE_URL}/tokenized-checkout/auth/grant-token`, {
//                 app_key: BKASH_APP_KEY,
//                 app_secret: BKASH_APP_SECRET
//             }, {
//                 headers: {
//                     "Content-Type": "application/json",
//                     "Accept": "application/json",
//                     "username": BKASH_USERNAME,
//                     "password": BKASH_PASSWORD
//                 }
//             });

//             token = response.data.auth_token;

//             await supabase.from('bkash_tokens').upsert({
//                 id: 1,
//                 auth_token: token,
//                 updated_at: new Date().toISOString()
//             });
//             console.log("Token Generated Successfully");
//         } else {
//             token = tokenData.auth_token;
//             // console.log("Using Cached Token");
//         }

//         return {
//             'Authorization': token,
//             'X-App-Key': BKASH_APP_KEY,
//             'Accept': 'application/json',
//             'Content-Type': 'application/json'
//         };
//     } catch (error) {
//         console.error("bKash Auth Error Details:", error.response ? error.response.data : error.message);
//         return null;
//     }
// };

const getAuthHeaders = async () => {
    try {
        const {
            BKASH_USERNAME,
            BKASH_PASSWORD,
            BKASH_APP_KEY,
            BKASH_APP_SECRET,
            BKASH_BASE_URL
        } = process.env;

        if (!BKASH_USERNAME || !BKASH_PASSWORD || !BKASH_APP_KEY || !BKASH_APP_SECRET) {
            console.error("Critical Error: bKash credentials missing in .env");
            return null;
        }

        // 🔹 Get stored token
        const { data: tokenData } = await supabase
            .from('bkash_tokens')
            .select('auth_token, updated_at')
            .eq('id', 1)
            .maybeSingle();

        let token;
        const now = Date.now();

        // 🔹 Token validity: 55 minutes (bKash safe window)
        const TOKEN_VALIDITY_MS = 55 * 60 * 1000;

        const isExpired =
            !tokenData ||
            !tokenData.auth_token ||
            !tokenData.updated_at ||
            now - new Date(tokenData.updated_at).getTime() > TOKEN_VALIDITY_MS;

        if (isExpired) {
            console.log("Fetching new bKash Token...");

            const response = await bkashAxios.post(
                `${BKASH_BASE_URL}/tokenized-checkout/auth/grant-token`,
                {
                    app_key: BKASH_APP_KEY,
                    app_secret: BKASH_APP_SECRET
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "username": BKASH_USERNAME,
                        "password": BKASH_PASSWORD
                    }
                }
            );

            // 🔥 IMPORTANT: bKash returns id_token
            token = response.data.id_token;

            await supabase.from('bkash_tokens').upsert({
                id: 1,
                auth_token: token,
                updated_at: new Date().toISOString()
            });

            console.log("bKash Token Generated & Cached");
        } else {
            token = tokenData.auth_token;
            // console.log("Using cached bKash token");
        }

        return {
            Authorization: token,
            "X-App-Key": BKASH_APP_KEY,
            Accept: "application/json",
            "Content-Type": "application/json"
        };
    } catch (error) {
        console.error(
            "bKash Auth Error:",
            error.response?.data || error.message
        );
        return null;
    }
};


// --- Create Payment ---
exports.createPayment = async (req, res) => {
    try {
        const { amount } = req.body;
        const headers = await getAuthHeaders();

        if (!headers) return res.status(500).json({ error: "bKash Auth Failed." });

        const merchantInvoiceNumber = "Inv_" + crypto.randomUUID().substring(0, 8);

        const { data } = await bkashAxios.post(`${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/create`, {
            mode: '0011',
            payerReference: "User_Registration",
            callbackURL: process.env.BKASH_CALLBACK_URL,
            amount: amount ? amount.toString() : "300",
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: merchantInvoiceNumber
        }, { headers });

        if (data.errorMessageEn || (data.statusCode && data.statusCode !== '0000')) {
            const code = data.statusCode || data.errorCode;
            const mappedError = getBkashErrorMessage(code);
            const finalError = mappedError || data.errorMessageEn || data.statusMessage || "Unknown Error";
            return res.status(400).json({ error: finalError });
        }

        res.status(200).json({ bkashURL: data.bkashURL });
    } catch (error) {
        console.error("Payment Creation Error:", error.message);
        const responseData = error.response?.data;
        let finalError = "Payment creation failed";

        if (responseData) {
            const code = responseData.statusCode || responseData.errorCode;
            const mappedError = getBkashErrorMessage(code);
            finalError = mappedError || responseData.errorMessageEn || responseData.message || finalError;
        }

        res.status(500).json({ error: finalError });
    }
};

exports.bkashCallback = async (req, res) => {
    try {
        const { paymentID, status } = req.query;

        if (!paymentID || !status) {
            return res.redirect(
                `${process.env.FRONTEND_URL}/payment-failed?message=Invalid Callback Data`
            );
        }

        const cleanPaymentID = String(paymentID).trim();
        const now = new Date();

        let errorMessage = "Payment Failed";
        let invoiceNumber = `INV-${Date.now()}`;
        let transactionTime = now.toISOString();

        // 🔐 Auth header
        const headers = await getAuthHeaders();
        if (!headers) {
            return res.redirect(
                `${process.env.FRONTEND_URL}/payment-failed?message=Authentication Failed`
            );
        }

        /* ======================================================
           1️⃣ CANCEL CASE (NO QUERY API)
        ====================================================== */
        if (status === 'cancel') {
            errorMessage = "Payment Cancelled";

            await supabase.from('payment_logs').insert({
                payment_id: cleanPaymentID,
                invoice: invoiceNumber,
                status: 'cancelled',
                message: errorMessage,
                created_at: transactionTime
            });

            return res.redirect(
                `${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(
                    errorMessage
                )}&invoice=${invoiceNumber}`
            );
        }

        /* ======================================================
           2️⃣ FAILURE CASE (QUERY ONCE, 403 SAFE)
        ====================================================== */
        if (status === 'failure') {
            try {
                const { data } = await bkashAxios.post(
                    `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/query`,
                    { paymentId: cleanPaymentID },
                    { headers }
                );

                if (data) {
                    invoiceNumber = data.merchantInvoiceNumber || invoiceNumber;
                    transactionTime = data.paymentCreateTime || transactionTime;

                    const code = data.statusCode || data.errorCode;
                    errorMessage =
                        getBkashErrorMessage(code) ||
                        data.errorMessageEn ||
                        data.statusMessage ||
                        "Payment Failed";
                }
            } catch (err) {
                // 403 is EXPECTED in failure state
                errorMessage = "Payment Failed";
            }

            await supabase.from('payment_logs').insert({
                payment_id: cleanPaymentID,
                invoice: invoiceNumber,
                status: 'failed',
                message: errorMessage,
                created_at: transactionTime
            });

            return res.redirect(
                `${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(
                    errorMessage
                )}&invoice=${invoiceNumber}`
            );
        }

        /* ======================================================
           3️⃣ SUCCESS CASE (EXECUTE → QUERY FALLBACK)
        ====================================================== */
        if (status === 'success') {
            let paymentData;

            try {
                const { data } = await bkashAxios.post(
                    `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/execute`,
                    { paymentId: cleanPaymentID },
                    { headers }
                );
                paymentData = data;
            } catch (execErr) {
                try {
                    const { data } = await bkashAxios.post(
                        `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/query`,
                        { paymentId: cleanPaymentID },
                        { headers }
                    );
                    paymentData = data;
                } catch {
                    return res.redirect(
                        `${process.env.FRONTEND_URL}/payment-failed?message=Payment Verification Failed`
                    );
                }
            }

            if (
                paymentData &&
                (paymentData.statusCode === '0000' ||
                    paymentData.transactionStatus === 'Completed')
            ) {
                const trxId = paymentData.trxID || paymentData.trxId;
                const verificationToken = crypto.randomUUID();

                await supabase.from('payment_verifications').insert({
                    payment_id: cleanPaymentID,
                    trx_id: trxId,
                    amount: parseFloat(paymentData.amount || 0),
                    verification_token: verificationToken,
                    status: 'completed',
                    customer_number:
                        paymentData.customerMsisdn || paymentData.payerAccount
                });

                return res.redirect(
                    `${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`
                );
            }

            // Success callback but execution failed
            const code = paymentData?.statusCode || paymentData?.errorCode;
            errorMessage =
                getBkashErrorMessage(code) ||
                paymentData?.errorMessageEn ||
                "Payment Processing Failed";

            invoiceNumber =
                paymentData?.merchantInvoiceNumber || invoiceNumber;

            await supabase.from('payment_logs').insert({
                payment_id: cleanPaymentID,
                invoice: invoiceNumber,
                status: 'failed',
                message: errorMessage,
                created_at: transactionTime
            });

            return res.redirect(
                `${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(
                    errorMessage
                )}&invoice=${invoiceNumber}`
            );
        }

        /* ======================================================
           4️⃣ UNKNOWN STATUS
        ====================================================== */
        return res.redirect(
            `${process.env.FRONTEND_URL}/payment-failed?message=Unknown Payment Status`
        );
    } catch (error) {
        console.error("Callback System Error:", error.message);
        return res.redirect(
            `${process.env.FRONTEND_URL}/payment-failed?message=Server Internal Error`
        );
    }
};



// ... Query, Search, Refund API functions remain same as before ...
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
// ... Refund API remains same ...

// --- Refund API ---
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