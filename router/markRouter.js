const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware'); // Admin middleware জরুরি
const { 
    submitVideoLink,
    updateJudgeScore,
    getLeaderboard,
    promoteUsersByRanking 
} = require('../controller/markController');

const router = express.Router();

router.get('/view', verifyToken, getLeaderboard);
router.post('/submit-video', verifyToken, submitVideoLink);
router.patch('/judge-score', verifyToken, verifyAdmin, updateJudgeScore);

// 🔥 Updated Route
router.post('/promote-users', verifyToken, verifyAdmin, promoteUsersByRanking);

module.exports = router;