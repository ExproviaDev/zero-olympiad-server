const express = require("express");
const router = express.Router();
const { verifyAdmin } = require("../middleware/authMiddleware");
const { getAllUsers, updateUserStatus, deleteUser } = require("../controller/userController");

router.get("/all-users", verifyAdmin, getAllUsers);
router.put("/update-user/:id", verifyAdmin, updateUserStatus);
router.delete("/delete-user/:id", verifyAdmin, deleteUser);

module.exports = router;