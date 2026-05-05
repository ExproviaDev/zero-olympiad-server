const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { getLeaderboardData, getLeaderboardStatus } = require('../controller/leaderboardController');

router.get('/',verifyToken, getLeaderboardData);
router.get('/status', verifyToken, getLeaderboardStatus);

module.exports = router;