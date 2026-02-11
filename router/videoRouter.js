const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { submitVideoLink, getVideoStatus, getVideoRoundSettings } = require('../controller/videoController');
router.get('/settings', verifyToken, getVideoRoundSettings);
router.post('/submit', verifyToken, submitVideoLink);
router.get('/status/:user_id', verifyToken, getVideoStatus);

module.exports = router;