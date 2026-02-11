const supabase = require('../config/db');

// ১. ইউজারের জন্য বর্তমান রাউন্ডের সেটিংস চেক করা
const getVideoRoundSettings = async (req, res) => {
    try {
        const { data: settings, error } = await supabase
            .from('competition_settings')
            .eq('id', 1)
            .single();

        if (error) throw error;

        // হার্ডকোডেড রাউন্ড ২ সেটিংস চেক (যেহেতু আপনি ফিক্সড রাখতে চেয়েছেন)
        const roundPrefix = 'round_2'; 

        const responseData = {
            round_name: roundPrefix,
            is_enabled: settings[`${roundPrefix}_has_video`], 
            start_time: settings[`${roundPrefix}_start`],     
            end_time: settings[`${roundPrefix}_end`],         
            server_time: new Date() 
        };

        res.status(200).json({ success: true, data: responseData });

    } catch (error) {
        console.error("Settings Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ২. ভিডিও লিংক সাবমিট করা (শুধুমাত্র প্রমোটেড ইউজারদের জন্য)
const submitVideoLink = async (req, res) => {
    const { user_id, video_link } = req.body;

    try {
        // ১. সেটিংস চেক
        const { data: settings, error: settingsError } = await supabase
            .from('competition_settings')
            .eq('id', 1)
            .single();

        if (settingsError) throw settingsError;

        const roundPrefix = 'round_2'; // ফিক্সড রাউন্ড ২
        const startTime = new Date(settings[`${roundPrefix}_start`]);
        const endTime = new Date(settings[`${roundPrefix}_end`]);
        const isVideoEnabled = settings[`${roundPrefix}_has_video`];
        const now = new Date();

        // ২. সময় এবং পারমিশন চেক
        if (!isVideoEnabled) return res.status(403).json({ success: false, message: "Video submission is currently disabled." });
        if (now < startTime) return res.status(403).json({ success: false, message: "Submission has not started yet." });
        if (now > endTime) return res.status(403).json({ success: false, message: "Submission deadline has passed." });

        // ৩. 🔥 SECURITY CHECK: ইউজার কি আদৌ রাউন্ড ২-এ আছে?
        // আমরা সরাসরি আপডেট করার চেষ্টা করব। যদি রো না থাকে, তার মানে সে কোয়ালিফাইড না।
        const { data, error, count } = await supabase
            .from('round_2_selection') //
            .update({ 
                video_link: video_link, 
                status: 'submitted', 
                updated_at: new Date().toISOString() 
            })
            .eq('user_id', user_id)
            .select(); // আপডেট হওয়া ডাটা রিটার্ন করবে

        if (error) throw error;

        // যদি কোনো রো আপডেট না হয়, তার মানে ইউজার কোয়ালিফাইড নয়
        if (!data || data.length === 0) {
            return res.status(403).json({ success: false, message: "You are not qualified for Round 2 video submission." });
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
            .from('round_2_selection') //
            .select('video_link, jury_score, status, jury_comments')
            .eq('user_id', user_id)
            .maybeSingle();

        if (error) throw error;
        
        // যদি ডাটা না থাকে, মানে সে রাউন্ড ২ তে নেই
        if (!data) return res.status(404).json({ message: "Participant not found in Round 2." });

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch status." });
    }
};

module.exports = {
    getVideoRoundSettings,
    submitVideoLink,
    getVideoStatus
};