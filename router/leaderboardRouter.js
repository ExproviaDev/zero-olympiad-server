const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { 
    submitVideoLink,
    updateJudgeScore,
    getLeaderboard,
    setPassMarkAndPromote 
} = require('../controller/leaderboardController');

const router = express.Router();

router.get('/view', verifyToken, getLeaderboard);
router.post('/submit-video', verifyToken, submitVideoLink);
router.patch('/judge-score', verifyToken, verifyAdmin, updateJudgeScore);
router.post('/set-pass-mark', verifyToken, verifyAdmin, setPassMarkAndPromote);

module.exports = router;