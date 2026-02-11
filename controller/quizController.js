const supabase = require('../config/db');

const createFullQuiz = async (req, res) => {
    const { title, category, start_at, ends_at, time_limit, questions } = req.body;

    try {
        const { data: quizSet, error: setEror } = await supabase
            .from('quiz_sets')
            .insert([{ title, category, start_at, ends_at, time_limit, status: 'draft' }]) // status: draft যোগ করা হয়েছে
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

        res.status(201).json({ success: true, message: "Quiz Set Created Successfully as Draft!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ২. এডমিনের জন্য সব কুইজ (Draft + Published সব দেখা যাবে)
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

// ৩. কুইজ ডিলিট
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

// ৪. কুইজ ডাটা আপডেট (Edit screen থেকে)
const updateQuiz = async (req, res) => {
    const { id } = req.params;
    const { title, category, start_at, ends_at, time_limit, questions } = req.body;

    try {
        const { error: updateSetError } = await supabase
            .from('quiz_sets')
            .update({ title, category, start_at, ends_at, time_limit })
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

// ৫. এডমিনের জন্য একটি কুইজ ডিটেইলস দেখা
const getSingleQuiz = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('quiz_sets')
            .select(`*, questions (*)`)
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, message: "Quiz not found" });

        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ৬. ইউজারদের জন্য কুইজ লিস্ট (শুধুমাত্র Published কুইজ)
const getQuizzesForUsers = async (req, res) => {
    try {
        const { category } = req.query;

        let query = supabase
            .from('quiz_sets')
            .select(`
                id, 
                title, 
                category, 
                time_limit, 
                start_at,
                ends_at,
                questions (id, quiz_set_id, question_text, options)
            `)
            .eq('status', 'published'); // <--- Filter added

        if (category) {
            query = query.eq('category', category);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

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
                id, title, category, time_limit, start_at,
                questions (id, quiz_set_id, question_text, options)
            `)
            .eq('id', id)
            .eq('status', 'published')
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, message: "Quiz not found or not published" });
        }
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const submitQuiz = async (req, res) => {
    const { user_id, quiz_set_id, answers, time_taken, sdgCategory, roundNumber } = req.body;

    console.log(`Submitting quiz for User: ${user_id}, Category: ${sdgCategory}`);

    if (!user_id || !quiz_set_id) {
        return res.status(400).json({ success: false, error: "Missing user_id or quiz_set_id" });
    }

    try {
        const { data: correctQuestions, error: fetchError } = await supabase
            .from('questions')
            .select('id, correct_answer')
            .eq('quiz_set_id', quiz_set_id);

        if (fetchError) throw fetchError;

        let calculatedScore = 0;
        const userAnswers = answers || {};

        correctQuestions.forEach((q) => {
            if (userAnswers[q.id] && String(userAnswers[q.id]) === String(q.correct_answer)) {
                calculatedScore += 1;
            }
        });

        const finalTimeTaken = Number(time_taken) || 0;
        const { error: insertError } = await supabase
            .from('quiz_submissions')
            .insert([{
                user_id,
                quiz_set_id,
                answers: userAnswers,
                score: calculatedScore,
                time_taken: finalTimeTaken,
                completed_at: new Date().toISOString()
            }]);

        if (insertError) throw insertError;


        const { error: perfError } = await supabase
            .from('round_performances')
            .upsert({
                user_id: user_id,
                quiz_set_id: quiz_set_id,
                round_number: roundNumber || 1,
                quiz_score: calculatedScore,
                time_taken: finalTimeTaken,
                total_calculated_score: calculatedScore,
                sdg_category: sdgCategory || "SDG Activist",
                is_promoted: false
            }, { onConflict: 'user_id, round_number' });

        if (perfError) throw perfError;

        // 🔥 ৫. ইউজার প্রোফাইলে PARTICIPATION স্ট্যাটাস আপডেট করা
        // এই অপারেশনটিই ইউজারের জন্য সার্টিফিকেট আনলক করবে
        const { error: profileError } = await supabase
            .from('user_profiles')
            .update({ is_participated: true }) // স্ট্যাটাস TRUE করে দেওয়া হলো
            .eq('user_id', user_id);

        if (profileError) throw profileError;

        res.status(201).json({
            success: true,
            message: "Quiz submitted and synced with leaderboard!",
            score: calculatedScore,
            category: sdgCategory
        });

    } catch (error) {
        console.error("Critical Sync Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};
const updateQuizStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const { data, error } = await supabase
            .from('quiz_sets')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.status(200).json({ success: true, message: "Status updated successfully", data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const checkAttempt = async (req, res) => {
    try {
        const { userId, quizId } = req.params;
        const { data: existingSubmission, error } = await supabase
            .from('quiz_submissions')
            .select('id')
            .eq('user_id', userId)
            .eq('quiz_set_id', quizId)
            .maybeSingle();

        if (error) throw error;

        res.status(200).json({ hasAttempted: !!existingSubmission });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    createFullQuiz,
    getAllQuizzes,
    deleteQuiz,
    updateQuiz,
    getSingleQuiz,
    getQuizzesForUsers,
    getSingleQuizForUser,
    submitQuiz,
    updateQuizStatus,
    checkAttempt
};