const express = require('express');
const router = express.Router();
const announcementController = require('../controller/announcementController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
router.post('/create', verifyToken, verifyAdmin, announcementController.createAnnouncement);
router.get('/all', announcementController.getAllAnnouncements);
router.put('/update/:id', verifyToken, verifyAdmin, announcementController.updateAnnouncement);
router.delete('/delete/:id', verifyToken, verifyAdmin, announcementController.deleteAnnouncement);

module.exports = router;