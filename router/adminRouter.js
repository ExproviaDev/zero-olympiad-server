const express = require("express");
const router = express.Router();
const { verifyAdmin, verifyToken, verifyStaff } = require("../middleware/authMiddleware");
const { getAllUsers, updateUserStatus, deleteUser, addMember } = require("../controller/userController");

const { 
    getCompetitionSettings, 
    updateCompetitionSettings, 
    getRound2Submissions, 
    submitJuryScore,
    getDashboardStats
} = require("../controller/adminController");

// --- ১. STRICT ADMIN ACCESS (Only Admin) ---
// Eigulo Jury/Manager kono bhabei access korte parbe na
router.post("/add-member", verifyToken, verifyAdmin, addMember); //
router.get("/all-users", verifyAdmin, getAllUsers);
router.put("/update-user/:id", verifyAdmin, updateUserStatus);
router.delete("/delete-user/:id", verifyAdmin, deleteUser);
router.put("/update-settings", verifyAdmin, updateCompetitionSettings);

// --- ২. STAFF ACCESS (Admin + Jury/Manager) ---
// Admin ja dekhbe, Jury-o tai dekhbe. Eikhane verifyStaff thakbe.
router.get("/settings", verifyStaff, getCompetitionSettings);
router.get("/round2-submissions", verifyToken, verifyStaff, getRound2Submissions);
router.put("/submit-score", verifyToken, verifyStaff, submitJuryScore);
router.get("/dashboard-stats", verifyStaff, getDashboardStats);
// --- ৩. ADDITIONAL SHARED ROUTES ---
// Dashboard, Leaderboard ba Event routes thakle segulo verifyStaff-e hobe
// router.get("/dashboard-stats", verifyStaff, getStats);

module.exports = router;