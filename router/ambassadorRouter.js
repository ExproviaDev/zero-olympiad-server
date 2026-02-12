const express = require('express');
const router = express.Router();
// আপনার মিডলওয়্যার ফাইলের পাথ অনুযায়ী এগুলো ইমপোর্ট করুন
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { getAllAmbassadors, getReferralList, getAmbassadorSelfStats } = require('../controller/ambassadorController');

router.get('/all', verifyToken, verifyAdmin, getAllAmbassadors);


router.get('/referrals/:promoCode', verifyToken, getReferralList);

router.get('/my-stats', verifyToken, getAmbassadorSelfStats);

module.exports = router;