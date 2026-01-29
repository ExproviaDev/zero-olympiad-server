const express = require('express');
const router = express.Router();
const bkashController = require('../controller/bkashController');

router.post('/create', bkashController.createPayment);
router.get('/callback', bkashController.bkashCallback);

module.exports = router;