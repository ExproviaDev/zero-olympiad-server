const express = require("express");
const router = express.Router();
const { verifyAdmin, verifyToken } = require("../middleware/authMiddleware");
const { getAllUsers, updateUserStatus, deleteUser } = require("../controller/userController");

// নতুন অ্যাডমিন কন্ট্রোলার থেকে ফাংশনগুলো ইম্পোর্ট করা হচ্ছে
const { 
    getCompetitionSettings, 
    updateCompetitionSettings, 
    getRound2Submissions, 
    submitJuryScore 
} = require("../controller/adminController");

router.get("/all-users", verifyAdmin, getAllUsers);
router.put("/update-user/:id", verifyAdmin, updateUserStatus);
router.delete("/delete-user/:id", verifyAdmin, deleteUser);

// --- কম্পিটিশন সেটিংস রাউটস ---
// রাউন্ড ২-এর কুইজ/ভিডিও সেটিংস দেখার জন্য
router.get("/settings", verifyAdmin, getCompetitionSettings);
// রাউন্ড বা কুইজ সেটিংস আপডেট করার জন্য
router.put("/update-settings", verifyAdmin, updateCompetitionSettings);

router.get("/round2-submissions", verifyToken, verifyAdmin, getRound2Submissions);
// জুরির মার্ক এবং কমেন্ট সেভ করা
router.put("/submit-score",verifyToken, verifyAdmin, submitJuryScore);

module.exports = router;