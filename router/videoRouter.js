const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { submitVideoLink, getVideoStatus } = require('../controller/videoController');

// ভিডিও সাবমিট করার রাউট
router.post('/submit', verifyToken, submitVideoLink);

// ভিডিওর বর্তমান অবস্থা বা মার্ক দেখার রাউট
router.get('/status/:user_id', verifyToken, getVideoStatus);

module.exports = router;