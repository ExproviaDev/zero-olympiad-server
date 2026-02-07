const supabase = require('../config/db');

// ১. ইউজারের জন্য বর্তমান রাউন্ডের সেটিংস চেক করা (নতুন যোগ করা হয়েছে)
const getVideoRoundSettings = async (req, res) => {
    try {
        // সেটিংস টেবিল থেকে ডাটা আনা
        const { data: settings, error } = await supabase
            .from('competition_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) throw error;

        // বর্তমান অ্যাক্টিভ রাউন্ড বের করা (যেমন: 2 বা 'round_2')
        let activeRound = settings.current_active_round;
        
        // যদি ডাটাবেসে শুধু সংখ্যা থাকে (যেমন 1, 2), তবে সেটাকে 'round_1' বা 'round_2' বানাতে হবে
        const roundPrefix = typeof activeRound === 'number' ? `round_${activeRound}` : activeRound;

        // ডাইনামিক ভাবে সেই রাউন্ডের স্টার্ট এবং এন্ড টাইম বের করা
        const responseData = {
            round_name: roundPrefix,
            is_enabled: settings[`${roundPrefix}_has_video`], // video enabled কিনা
            start_time: settings[`${roundPrefix}_start`],     // start date
            end_time: settings[`${roundPrefix}_end`],         // end date
            server_time: new Date() // সার্ভারের সময় পাঠানো হলো যাতে ক্লায়েন্ট সিঙ্ক করতে পারে
        };

        res.status(200).json({ success: true, data: responseData });

    } catch (error) {
        console.error("Settings Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ২. ভিডিও লিংক সাবমিট করা
const submitVideoLink = async (req, res) => {
    const { user_id, video_link } = req.body;

    try {
        const { data: settings, error: settingsError } = await supabase
            .from('competition_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (settingsError) throw settingsError;

        let activeRound = settings.current_active_round;
        const roundPrefix = typeof activeRound === 'number' ? `round_${activeRound}` : activeRound;

        const startTime = new Date(settings[`${roundPrefix}_start`]);
        const endTime = new Date(settings[`${roundPrefix}_end`]);
        const isVideoEnabled = settings[`${roundPrefix}_has_video`];
        const now = new Date();

        // সিকিউরিটি চেক
        if (!isVideoEnabled) {
            return res.status(403).json({ success: false, message: "Video submission is currently disabled." });
        }
        if (now < startTime) {
            return res.status(403).json({ success: false, message: "Submission has not started yet." });
        }
        if (now > endTime) {
            return res.status(403).json({ success: false, message: "Submission deadline has passed." });
        }

        // ডাটাবেসে সেভ বা আপডেট করা
        // টেবিলের নাম ডাইনামিক হতে পারে, আপাতত 'round_2_selection' ফিক্সড রাখা হলো আপনার কোড অনুযায়ী
        const { data: existingEntry, error: fetchError } = await supabase
            .from('round_2_selection')
            .select('id')
            .eq('user_id', user_id)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if (existingEntry) {
            const { error: updateError } = await supabase
                .from('round_2_selection')
                .update({ video_link, status: 'pending', updated_at: new Date().toISOString() })
                .eq('user_id', user_id);
            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await supabase
                .from('round_2_selection')
                .insert([{ user_id, video_link, status: 'pending' }]);
            if (insertError) throw insertError;
        }

        return res.status(200).json({ success: true, message: "Video link submitted successfully." });

    } catch (err) {
        console.error("Video Controller Error:", err.message);
        return res.status(500).json({ success: false, message: "Server error occurred." });
    }
};

// ৩. স্ট্যাটাস চেক করা
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
        res.status(500).json({ message: "Failed to fetch status." });
    }
};

module.exports = {
    getVideoRoundSettings, // ✅ নতুন ফাংশন এক্সপোর্ট করা হলো
    submitVideoLink,
    getVideoStatus
};