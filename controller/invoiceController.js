const supabase = require('../config/db');

const getUserInvoice = async (req, res) => {
    try {
        // ১. টোকেন থেকে ইউজার আইডি নেওয়া
        const userId = req.user.sub || req.user.id;

        // ২. ইউজারের প্রোফাইল থেকে পেমেন্ট টোকেন এবং অন্যান্য তথ্য আনা
        const { data: userProfile, error: userError } = await supabase
            .from('user_profiles')
            .select('name, email, phone, institution, district, created_at, payment_verify_token')
            .eq('user_id', userId)
            .single();

        if (userError || !userProfile) {
            return res.status(404).json({ success: false, message: "User profile not found." });
        }

        let paymentData = null;

        // ৩. লজিক ১: প্রোফাইলে যদি পেমেন্ট টোকেন থাকে, সেটা দিয়ে পেমেন্ট টেবিল চেক করা (সবচেয়ে নির্ভুল)
        if (userProfile.payment_verify_token) {
            const { data } = await supabase
                .from('payment_verifications')
                .select('*')
                .eq('verification_token', userProfile.payment_verify_token)
                .single();
            
            if (data) paymentData = data;
        }

        // ৪. লজিক ২ (ব্যাকআপ): যদি টোকেন না থাকে বা পেমেন্ট না পাওয়া যায়, তবে ফোন নম্বর দিয়ে খোঁজা
        // (এটি মূলত পুরনো ইউজারদের জন্য যারা সিস্টেম আপডেটের আগে রেজিস্ট্রেশন করেছে)
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

        // ৫. ইনভয়েস ডাটা রেডি করা
        const invoiceData = {
            invoice_id: paymentData?.trx_id || `INV-${userId.slice(0, 6).toUpperCase()}`,
            date: paymentData?.created_at || userProfile.created_at,
            user_details: {
                name: userProfile.name,
                email: userProfile.email,
                phone: userProfile.phone,
                institution: userProfile.institution,
                address: userProfile.district
            },
            payment_details: {
                amount: paymentData?.amount || 0, // যদি পেমেন্ট ডাটা না পায় তবে ০ বা ডিফল্ট ফি দেখাতে পারেন
                trx_id: paymentData?.trx_id || "N/A",
                method: "bKash Online Payment",
                payment_phone: paymentData?.customer_number || "N/A",
                status: "Paid"
            },
            items: [
                {
                    description: "Zero Olympiad Registration Fee",
                    unit_price: paymentData?.amount || 0,
                    quantity: 1,
                    total: paymentData?.amount || 0
                }
            ]
        };

        res.status(200).json({ success: true, data: invoiceData });

    } catch (error) {
        console.error("Invoice Error:", error.message);
        res.status(500).json({ success: false, error: "Failed to generate invoice." });
    }
};

module.exports = { getUserInvoice };