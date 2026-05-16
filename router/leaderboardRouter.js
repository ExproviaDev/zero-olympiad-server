const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { getLeaderboardData, getLeaderboardStatus, getAdminLeaderboardData } = require('../controller/leaderboardController');

router.get('/',verifyToken, getLeaderboardData);
router.get('/status', verifyToken, getLeaderboardStatus);
router.get('/admin', verifyToken, verifyAdmin, getAdminLeaderboardData);

module.exports = router;