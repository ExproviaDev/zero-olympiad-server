const supabase = require('../config/db');



const createFullQuiz = async (req, res) => {
    const { title, category, start_at, time_limit, questions } = req.body;

    try {
        const { data: quizSet, error: setEror } = await supabase
            .from('quiz_sets')
            .insert([{ title, category, start_at, time_limit }])
            .select()
            .single();

        if (setEror) throw setEror;
        const questionsToInsert = questions.map(q => ({
            quiz_set_id: quizSet.id,
            question_text: q.question_text,
            options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD },
            correct_answer: q.correct_answer
        }));
        const { error: qError } = await supabase.from('questions').insert(questionsToInsert);
        if (qError) throw qError;

        res.status(201).json({ success: true, message: "Quiz Set Created Successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getAllQuizzes = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('quiz_sets')
            .select('*, questions(count)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteQuiz = async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('quiz_sets')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.status(200).json({ success: true, message: "Quiz deleted successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


const updateQuiz = async (req, res) => {
    const { id } = req.params;
    const { title, category, start_at, time_limit, questions } = req.body;

    try {
        const { error: updateSetError } = await supabase
            .from('quiz_sets')
            .update({ title, category, start_at, time_limit })
            .eq('id', id);

        if (updateSetError) throw updateSetError;
        const { error: deleteOldQError } = await supabase
            .from('questions')
            .delete()
            .eq('quiz_set_id', id);

        if (deleteOldQError) throw deleteOldQError;
        const questionsToInsert = questions.map(q => ({
            quiz_set_id: id,
            question_text: q.question_text,
            options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD },
            correct_answer: q.correct_answer
        }));

        const { error: insertNewQError } = await supabase
            .from('questions')
            .insert(questionsToInsert);

        if (insertNewQError) throw insertNewQError;

        res.status(200).json({ success: true, message: "Quiz updated successfully!" });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


const getSingleQuiz = async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('quiz_sets')
            .select(`
                *,
                questions (*)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, message: "Quiz not found" });

        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


const getQuizzesForUsers = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('quiz_sets')
            .select(`
                id, 
                title, 
                category, 
                time_limit, 
                start_at,
                questions (
                    id, 
                    question_text, 
                    options 
                )
            `);

        if (error) throw error;

        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getSingleQuizForUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('quiz_sets')
            .select(`
                id, 
                title, 
                category, 
                time_limit, 
                start_at,
                questions (
                    id, 
                    question_text, 
                    options
                )
            `)
            .eq('id', id)
            .single();

        if (error) throw error;

        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
module.exports = { createFullQuiz, getAllQuizzes, deleteQuiz, updateQuiz, getSingleQuiz, getQuizzesForUsers, getSingleQuizForUser };