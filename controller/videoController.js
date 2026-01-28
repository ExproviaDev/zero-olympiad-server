const supabase = require('../config/db');

const submitVideoLink = async (req, res) => {
    const { user_id, video_link } = req.body;

    try {
        // ১. বর্তমানে অ্যাক্টিভ রাউন্ড এবং তার সেটিংস নিয়ে আসা
        const { data: settings, error: settingsError } = await supabase
            .from('competition_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (settingsError) throw settingsError;

        const activeRound = settings.current_active_round; // উদা: 'round_1' বা 'round_2'
        const startTime = new Date(settings[`${activeRound}_start`]);
        const endTime = new Date(settings[`${activeRound}_end`]);
        const isVideoEnabled = settings[`${activeRound}_has_video`];
        const now = new Date();

        // ২. সিকিউরিটি চেক: এই রাউন্ডে ভিডিও সাবমিশন কি পারমিটেড?
        if (!isVideoEnabled) {
            return res.status(403).json({
                success: false,
                message: `বর্তমানে ${activeRound}-এ ভিডিও সাবমিট করার অপশন বন্ধ আছে।`
            });
        }

        // ৩. টাইম চেক: সময় কি শুরু হয়েছে নাকি শেষ হয়ে গেছে?
        if (now < startTime) {
            return res.status(403).json({
                success: false,
                message: "ভিডিও সাবমিশন এখনো শুরু হয়নি।"
            });
        }

        if (now > endTime) {
            return res.status(403).json({
                success: false,
                message: "দুঃখিত, ভিডিও সাবমিট করার সময়সীমা শেষ হয়ে গেছে।"
            });
        }

        // ৪. সব ঠিক থাকলে ভিডিও লিঙ্ক আপডেট বা ইনসার্ট
        // এখানে আমরা activeRound অনুযায়ী আলাদা টেবিলে ডাটা রাখতে পারি অথবা স্ট্যাটাস আপডেট করতে পারি
        const { data: existingEntry, error: fetchError } = await supabase
            .from('round_2_selection') // তুমি চাইলে এখানেও ডায়নামিক টেবিল নাম দিতে পারো
            .select('id')
            .eq('user_id', user_id)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if (existingEntry) {
            const { error: updateError } = await supabase
                .from('round_2_selection')
                .update({
                    video_link,
                    status: 'pending',
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user_id);

            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await supabase
                .from('round_2_selection')
                .insert([{ user_id, video_link, status: 'pending' }]);

            if (insertError) throw insertError;
        }

        return res.status(200).json({
            success: true,
            message: "ভিডিও লিঙ্ক সফলভাবে সাবমিট/আপডেট করা হয়েছে।"
        });

    } catch (err) {
        console.error("Video Controller Error:", err.message);
        return res.status(500).json({
            success: false,
            message: "সার্ভারে সমস্যা হয়েছে।"
        });
    }
};
// getVideoStatus ফাংশন আগের মতোই থাকবে
const getVideoStatus = async (req, res) => {
    const { user_id } = req.params;
    try {
        const { data, error } = await supabase
            .from('round_2_selection')
            .select('video_link, jury_score, status, jury_comments')
            .eq('user_id', user_id)
            .maybeSingle();

        if (error) throw error;
        res.status(200).json(data || { message: "No submission found" });
    } catch (err) {
        res.status(500).json({ message: "তথ্য পেতে সমস্যা হয়েছে।" });
    }
};

module.exports = {
    submitVideoLink,
    getVideoStatus
};