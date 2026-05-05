const express = require('express');
const router = express.Router();
const bkashController = require('../controller/bkashController');

router.post('/create', bkashController.createPayment);
router.get('/callback', bkashController.bkashCallback);

// নতুন রাউটগুলো যোগ করা হলো
router.get('/query/:paymentID', bkashController.queryPayment);
router.get('/search/:trxID', bkashController.searchTransaction);
router.post('/refund', bkashController.refundTransaction);

module.exports = router;