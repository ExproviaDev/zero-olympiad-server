// router/invoiceRouter.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware'); // আপনার অথ মিডলওয়্যার পাথ ঠিক রাখুন
const { getUserInvoice } = require('../controller/invoiceController');

router.get('/my-invoice', verifyToken, getUserInvoice);

module.exports = router;