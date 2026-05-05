const express = require("express");
const router = express.Router();
const { verifyAdmin, verifyToken, verifyStaff } = require("../middleware/authMiddleware");
const { getAllUsers, updateUserStatus, deleteUser, addMember } = require("../controller/userController");

const { 
    getCompetitionSettings, 
    updateCompetitionSettings, 
    getRound2Submissions, 
    submitJuryScore,
    getDashboardStats,
    getMarketingUsers, getMarketingStats
} = require("../controller/adminController");
router.post("/add-member", verifyToken, verifyAdmin, addMember); //
router.get("/all-users", verifyAdmin, getAllUsers);
router.put("/update-user/:id", verifyAdmin, updateUserStatus);
router.delete("/delete-user/:id", verifyAdmin, deleteUser);
router.put("/update-settings", verifyAdmin, updateCompetitionSettings);
router.get('/marketing-users',verifyAdmin,  getMarketingUsers);
router.get('/marketing-stats',verifyAdmin,  getMarketingStats);

// --- ২. STAFF ACCESS (Admin + Jury/Manager) ---
router.get("/settings",verifyToken,  getCompetitionSettings);
router.get("/round2-submissions", verifyToken, verifyStaff, getRound2Submissions);
router.put("/submit-score", verifyToken, verifyStaff, submitJuryScore);
router.get("/dashboard-stats", verifyStaff, getDashboardStats);


module.exports = router;