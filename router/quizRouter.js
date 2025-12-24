const express = require('express');
const router = express.Router();
const {
    createFullQuiz, 
    getAllQuizzes,
    deleteQuiz,
    updateQuiz,
    getSingleQuiz,
    getQuizzesForUsers,
    getSingleQuizForUser,
    submitQuiz,    
 } = require('../controller/quizController');
const { verifyAdmin } = require('../middleware/authMiddleware');



router.get('/all-quizzes', verifyAdmin, getAllQuizzes);
router.get('/quiz/:id', verifyAdmin, getSingleQuiz);
router.put('/update-quiz/:id', verifyAdmin, updateQuiz);
router.post('/add-quiz', verifyAdmin, createFullQuiz);
router.delete('/delete-quiz/:id', verifyAdmin, deleteQuiz);


router.get('/public-quizzes', getQuizzesForUsers);
router.get('/public-quiz/:id', getSingleQuizForUser);
router.post('/submit-quiz', submitQuiz);

module.exports = router;