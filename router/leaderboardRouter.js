// router/leaderboardRouter.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware'); // যদি অথেনটিফিকেশন লাগে
const { getLeaderboardData } = require('../controller/leaderboardController');

router.get('/',verifyToken, getLeaderboardData);

module.exports = router;