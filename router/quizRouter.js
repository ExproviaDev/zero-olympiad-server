const express = require('express');
const router = express.Router();
const { createFullQuiz, getAllQuizzes, deleteQuiz, updateQuiz } = require('../controller/quizController');





router.get('/all-quizzes', getAllQuizzes);
router.put('/update-quiz/:id', updateQuiz);
router.post('/add-quiz', createFullQuiz);
router.delete('/delete-quiz/:id', deleteQuiz);
module.exports = router;