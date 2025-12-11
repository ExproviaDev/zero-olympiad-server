const express = require('express');
const Quiz = require('../models/quiz');
const router = express.Router();  // express.Router() ব্যবহার করা উচিত

router.use(express.json());

router.get('/quizzes', async (req, res) => {
    try {
        const quizzes = await Quiz.find();
        res.status(200).json(quizzes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.get('/quizzes/:id', async (req, res) => {
    try {
        const quizzes = await Quiz.findById(req.params.id);
        if (!quizzes) {
            return res.status(404).json({ message: "quiz not found!" });
        } else {
            res.status(200).json(quizzes);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/quizzes', async (req, res) => {
    try {
        const quizzes = await Quiz.create(req.body);
        res.status(201).json({ message: "quiz question added successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/quizzes/:id', async (req, res) => {
    try {
        const quizzes = await Quiz.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!quizzes) {
            return res.status(404).json({ message: "quiz not found to edit" });
        } else {
            res.status(200).json({ message: 'quiz updated successfully', quizzes });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/quizzes/:id', async (req, res) => {
    try {
        const quizzes = await Quiz.findByIdAndDelete(req.params.id);
        if (!quizzes) {
            return res.status(404).json({ message: "quiz not found to delete" });
        } else {
            res.status(200).json({ message: 'quiz deleted successfully', quizzes });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
