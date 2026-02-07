const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
// ✅ getVideoRoundSettings ইম্পোর্ট করতে ভুলবেন না
const { submitVideoLink, getVideoStatus, getVideoRoundSettings } = require('../controller/videoController');

// ১. সেটিংস চেক করার রাউট (এটি আপনার মিসিং ছিল)
router.get('/settings', verifyToken, getVideoRoundSettings);

// ২. ভিডিও সাবমিট করার রাউট
router.post('/submit', verifyToken, submitVideoLink);

// ৩. ভিডিওর বর্তমান অবস্থা বা মার্ক দেখার রাউট
router.get('/status/:user_id', verifyToken, getVideoStatus);

module.exports = router;