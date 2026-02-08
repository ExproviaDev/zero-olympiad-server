const axios = require('axios');
const supabase = require('../config/db');
const crypto = require('crypto');

// bKash Spec অনুযায়ী 30s timeout
const bkashAxios = axios.create({
    timeout: 30000
});

// ✅ bKash Error Code Mapping (লজিক বিল্ড করা হলো)
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
        '2029': 'Duplicate for all transactions', // 👈 আপনার কাঙ্ক্ষিত এরর
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

        // ✅ UPDATE: এরর কোড ধরে মেসেজ বের করার লজিক
        if (data.errorMessageEn || (data.statusCode && data.statusCode !== '0000')) {
            const code = data.statusCode || data.errorCode;
            const mappedError = getBkashErrorMessage(code); // কোড থেকে মেসেজ খুঁজবে

            // যদি ম্যাপে থাকে তবে সেটা, না হলে bKash এর ডিফল্ট মেসেজ
            const finalError = mappedError || data.errorMessageEn || data.statusMessage || "Unknown Error";
            return res.status(400).json({ error: finalError });
        }

        res.status(200).json({ bkashURL: data.bkashURL });
    } catch (error) {
        console.error("Payment Creation Error:", error.message);

        // Axios এরর হ্যান্ডলিং লজিক
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

// --- Execute Payment (Updated Callback) ---
// exports.bkashCallback = async (req, res) => {
//     try {
//         const { paymentID, status, message, errorMessage, statusMessage } = req.query;
//         if (status === 'cancel' || status === 'failure') {
//             let failureMsg = "Unknown Error";

//             if (message) failureMsg = message;
//             else if (errorMessage) failureMsg = errorMessage;
//             else if (statusMessage) failureMsg = statusMessage;
//             else if (status === 'cancel') failureMsg = "Payment Cancelled by User";
//             else if (status === 'failure') failureMsg = "Payment Failed (Gateway Error)";

//             return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(failureMsg)}`);
//         }
//         const headers = await getAuthHeaders();
//         if (!headers) throw new Error("Auth headers failed");

//         if (status === 'success') {
//             const cleanPaymentID = String(paymentID).trim();
//             let paymentData;
//             try {
//                 console.log("Executing Payment ID:", cleanPaymentID);
//                 const { data } = await bkashAxios.post(
//                     `${process.env.BKASH_BASE_URL}/tokenized-checkout/payment/execute`,
//                     { paymentId: cleanPaymentID },
//                     { headers }
//                 );
//                 paymentData = data;
//                 console.log("Execute Response:", paymentData);

//             } catch (execError) {
//                 console.error("Execute API Failed. Trying Query API Fallback...");
//                 try {
//                     const { data: queryData } = await bkashAxios.post(
//                         `${process.env.BKASH_BASE_URL}/tokenized-checkout/query/payment`,
//                         { paymentId: cleanPaymentID },
//                         { headers }
//                     );
//                     paymentData = queryData;
//                 } catch (queryError) {
//                     console.error("Query API also failed:", queryError.message);
//                     return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=Verification Failed`);

//                 }
//             }
//             if (paymentData && (paymentData.statusCode === '0000' || paymentData.transactionStatus === 'Completed')) {

//                 const finalTrxId = paymentData.trxID || paymentData.trxId;
//                 const verificationToken = crypto.randomUUID();
//                 const paymentAmount = paymentData.amount ? parseFloat(paymentData.amount) : 0;

//                 const { error: dbError } = await supabase.from('payment_verifications').insert({
//                     payment_id: cleanPaymentID,
//                     trx_id: finalTrxId,
//                     amount: paymentAmount,
//                     verification_token: verificationToken,
//                     status: 'completed',
//                     customer_number: paymentData.customerMsisdn || paymentData.payerAccount
//                 });

//                 if (dbError) console.error("DB Error:", dbError);

//                 return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`);

//             } else {
//                 console.error("Payment Execution Failed Logic:", paymentData);

//                 const code = paymentData?.statusCode || paymentData?.errorCode;
//                 const mappedError = getBkashErrorMessage(code);

//                 const errorMessage =
//                     mappedError ||
//                     paymentData?.errorMessageEn ||
//                     paymentData?.statusMessage ||
//                     paymentData?.message ||
//                     "Unknown Error Occurred";

//                 const invoiceNumber = paymentData?.merchantInvoiceNumber || "N/A";

//                 return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(errorMessage)}&invoice=${encodeURIComponent(invoiceNumber)}`);
//             }
//         }
//     } catch (error) {
//         console.error("Callback System Error:", error.message);
//         return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=Server Internal Error`);
//     }
// };


// --- Execute Payment (Updated Callback with Console Logs) ---
exports.bkashCallback = async (req, res) => {
    try {
        const { paymentID, status } = req.query;
        let errorMessage = "Unknown Error";
        let invoiceNumber = "N/A";

        // ১. Auth Header নিয়ে আসা
        const headers = await getAuthHeaders();
        if (!headers) throw new Error("Auth headers failed");

        // ২. যদি পেমেন্ট ফেইল বা ক্যান্সেল হয়
        if (status === 'cancel' || status === 'failure') {
            console.log(`\n=== Payment ${status.toUpperCase()} Log ===`);
            
            try {
                // পেমেন্টের বিস্তারিত জানতে Query API কল করা হচ্ছে
                const { data: queryData } = await bkashAxios.post(
                    `${process.env.BKASH_BASE_URL}/tokenized-checkout/query/payment`,
                    { paymentId: paymentID }, 
                    { headers }
                );

                // --- এই অংশটি টার্মিনালে ডাটা প্রিন্ট করবে (bKash PDF এর মতো) ---
                if (queryData) {
                    // Time Formatting (e.g., 03:43pm Dec 22 2019)
                    const dateObj = new Date(queryData.paymentCreateTime || Date.now());
                    const formattedTime = dateObj.toLocaleString('en-US', { 
                        hour: 'numeric', minute: 'numeric', hour12: true, 
                        day: 'numeric', month: 'short', year: 'numeric' 
                    });

                    console.log(`Invoice number: ${queryData.merchantInvoiceNumber}`);
                    console.log(`Time of Transaction: ${formattedTime}`);
                    
                    // ইনভয়েস নম্বরটি ভেরিয়েবলে রাখা হলো ফ্রন্টএন্ডে পাঠানোর জন্য
                    invoiceNumber = queryData.merchantInvoiceNumber;
                }
                // -------------------------------------------------------------

                // এরর মেসেজ বের করা
                const code = queryData.statusCode || queryData.errorCode;
                const mappedError = getBkashErrorMessage(code); 
                errorMessage = mappedError || queryData.errorMessageEn || queryData.statusMessage || "Payment Failed";
                
                console.log(`Reason: ${errorMessage}`);
                console.log("=========================================\n");

            } catch (error) {
                console.error("Query failed during error logging:", error.message);
                errorMessage = "Payment Failed (Gateway Error)";
            }
            
            // ফ্রন্টএন্ডে পাঠানো (সাথে ইনভয়েস নম্বরও যাচ্ছে)
            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(errorMessage)}&invoice=${encodeURIComponent(invoiceNumber)}`);
        }

        // ৩. যদি পেমেন্ট সাকসেস হয়
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
            } catch (execError) {
                console.error("Execute API Failed. Trying Query...");
                // B. Query API Fallback
                try {
                    const { data: queryData } = await bkashAxios.post(
                        `${process.env.BKASH_BASE_URL}/tokenized-checkout/query/payment`,
                        { paymentId: cleanPaymentID }, 
                        { headers }
                    );
                    paymentData = queryData;
                } catch (queryError) {
                    // Query Fail Log
                    const qData = queryError.response?.data;
                    const qCode = qData?.statusCode || qData?.errorCode;
                    const qMsg = getBkashErrorMessage(qCode) || "Verification System Failed";
                    return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(qMsg)}`);
                }
            }

            // C. Validate & Save
            if (paymentData && (paymentData.statusCode === '0000' || paymentData.transactionStatus === 'Completed')) {
                const finalTrxId = paymentData.trxID || paymentData.trxId;
                const verificationToken = crypto.randomUUID();
                const paymentAmount = paymentData.amount ? parseFloat(paymentData.amount) : 0;

                await supabase.from('payment_verifications').insert({
                    payment_id: cleanPaymentID, 
                    trx_id: finalTrxId, 
                    amount: paymentAmount,
                    verification_token: verificationToken, 
                    status: 'completed',
                    customer_number: paymentData.customerMsisdn || paymentData.payerAccount
                });

                return res.redirect(`${process.env.FRONTEND_URL}/registration?step=3&token=${verificationToken}`);
            } else {
                // Execute ফেইল হলে লগ প্রিন্ট
                console.log(`\n=== Payment Execution Failed Log ===`);
                const invoice = paymentData?.merchantInvoiceNumber || "N/A";
                const dateObj = new Date();
                const formattedTime = dateObj.toLocaleString('en-US', { 
                        hour: 'numeric', minute: 'numeric', hour12: true, 
                        day: 'numeric', month: 'short', year: 'numeric' 
                });
                
                console.log(`Invoice number: ${invoice}`);
                console.log(`Time of Transaction: ${formattedTime}`);

                const code = paymentData?.statusCode || paymentData?.errorCode;
                const mappedError = getBkashErrorMessage(code); 
                errorMessage = mappedError || paymentData?.errorMessageEn || paymentData?.statusMessage || "Processing Failed";
                
                console.log(`Reason: ${errorMessage}`);
                console.log("====================================\n");

                return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=${encodeURIComponent(errorMessage)}&invoice=${encodeURIComponent(invoice)}`);
            }
        }
    } catch (error) {
        console.error("Callback System Error:", error.message);
        return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?message=Server Internal Error`);
    }
};



// --- Query Payment API ---
exports.queryPayment = async (req, res) => {
    try {
        const { paymentID } = req.params;
        const headers = await getAuthHeaders();

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

// --- Search Transaction API ---
exports.searchTransaction = async (req, res) => {
    try {
        const { trxID } = req.params;
        const headers = await getAuthHeaders();
        console.log("Searching TRX:", trxID);

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