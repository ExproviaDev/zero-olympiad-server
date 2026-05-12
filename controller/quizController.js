const supabase = require('../config/db');
const sql = require('../config/pg');

const createFullQuiz = async (req, res) => {
    const { title, category, start_at, ends_at, time_limit, questions } = req.body;

    try {
        if (sql) {
            const inserted = await sql`
                INSERT INTO quiz_sets (title, category, start_at, ends_at, time_limit, status)
                VALUES (${title}, ${category}, ${start_at}, ${ends_at}, ${time_limit}, 'draft')
                RETURNING id
            `;
            const quizSetId = inserted[0].id;

            if (questions?.length) {
                const rows = questions.map((q) => ({
                    quiz_set_id: quizSetId,
                    question_text: q.question_text,
                    options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD },
                    correct_answer: q.correct_answer,
                }));
                await sql`INSERT INTO questions ${sql(rows, 'quiz_set_id', 'question_text', 'options', 'correct_answer')}`;
            }
            return res.status(201).json({ success: true, message: "Quiz Set Created Successfully as Draft!" });
        }

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
        if (sql) {
            const rows = await sql`
                SELECT
                    qs.*,
                    json_build_array(
                        json_build_object('count', (SELECT COUNT(*) FROM questions q WHERE q.quiz_set_id = qs.id))
                    ) AS questions
                FROM quiz_sets qs
                ORDER BY qs.created_at DESC
            `;
            return res.status(200).json({ success: true, data: rows });
        }

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
// round_performances.quiz_set_id এবং quiz_submissions.quiz_set_id এর FK
// এখন ON DELETE SET NULL — তাই সেগুলো manual delete করার দরকার নেই।
// Participant score/leaderboard data অক্ষুণ্ণ থাকবে।
// শুধু questions manually clear করা হচ্ছে (CASCADE না থাকলেও safe)।
const deleteQuiz = async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ success: false, error: "Missing quiz id" });
    }

    try {
        if (sql) {
            try { await sql`DELETE FROM questions WHERE quiz_set_id = ${id}`; }
            catch (e) { console.warn("[deleteQuiz] questions cleanup error", { quiz_set_id: id, error: e.message }); }

            await sql`DELETE FROM quiz_sets WHERE id = ${id}`;
            return res.status(200).json({ success: true, message: "Quiz deleted successfully!" });
        }

        const { error: qErr } = await supabase
            .from('questions')
            .delete()
            .eq('quiz_set_id', id);
        if (qErr) {
            console.warn("[deleteQuiz] questions cleanup error", { quiz_set_id: id, error: qErr.message });
        }

        // 2) quiz_sets row delete — round_performances/quiz_submissions FK এখন SET NULL
        //    তাই leaderboard/score data নষ্ট হবে না
        const { error: setErr } = await supabase
            .from('quiz_sets')
            .delete()
            .eq('id', id);
        if (setErr) throw setErr;

        return res.status(200).json({
            success: true,
            message: "Quiz deleted successfully!",
        });
    } catch (error) {
        console.error("[deleteQuiz] failed", { quiz_set_id: id, message: error?.message });
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ৪. কুইজ ডাটা আপডেট (Edit screen থেকে)
const updateQuiz = async (req, res) => {
    const { id } = req.params;
    const { title, category, start_at, ends_at, time_limit, questions } = req.body;

    try {
        if (sql) {
            await sql`
                UPDATE quiz_sets
                SET title = ${title}, category = ${category},
                    start_at = ${start_at}, ends_at = ${ends_at}, time_limit = ${time_limit}
                WHERE id = ${id}
            `;
            await sql`DELETE FROM questions WHERE quiz_set_id = ${id}`;

            if (questions?.length) {
                const rows = questions.map((q) => ({
                    quiz_set_id: id,
                    question_text: q.question_text,
                    options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD },
                    correct_answer: q.correct_answer,
                }));
                await sql`INSERT INTO questions ${sql(rows, 'quiz_set_id', 'question_text', 'options', 'correct_answer')}`;
            }
            return res.status(200).json({ success: true, message: "Quiz updated successfully!" });
        }

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
        if (sql) {
            const rows = await sql`
                SELECT
                    qs.*,
                    COALESCE(
                        (SELECT json_agg(q.* ORDER BY q.id) FROM questions q WHERE q.quiz_set_id = qs.id),
                        '[]'::json
                    ) AS questions
                FROM quiz_sets qs
                WHERE qs.id = ${id}
                LIMIT 1
            `;
            if (!rows[0]) return res.status(404).json({ success: false, message: "Quiz not found" });
            return res.status(200).json({ success: true, data: rows[0] });
        }

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

        if (sql) {
            // Nested questions are aggregated as JSON to match the Supabase JS
            // response shape exactly. COALESCE handles quizzes with zero questions.
            const rows = await sql`
                SELECT
                    qs.id,
                    qs.title,
                    qs.category,
                    qs.time_limit,
                    qs.start_at,
                    qs.ends_at,
                    COALESCE(
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'id', q.id,
                                    'quiz_set_id', q.quiz_set_id,
                                    'question_text', q.question_text,
                                    'options', q.options
                                )
                                ORDER BY q.id
                            )
                            FROM questions q
                            WHERE q.quiz_set_id = qs.id
                        ),
                        '[]'::json
                    ) AS questions
                FROM quiz_sets qs
                WHERE qs.status = 'published'
                  AND (${category ?? null}::text IS NULL OR qs.category = ${category ?? null})
                ORDER BY qs.created_at DESC
            `;
            return res.status(200).json({ success: true, data: rows });
        }

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
            .eq('status', 'published');

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

        if (sql) {
            const rows = await sql`
                SELECT
                    qs.id,
                    qs.title,
                    qs.category,
                    qs.time_limit,
                    qs.start_at,
                    COALESCE(
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'id', q.id,
                                    'quiz_set_id', q.quiz_set_id,
                                    'question_text', q.question_text,
                                    'options', q.options
                                )
                                ORDER BY q.id
                            )
                            FROM questions q
                            WHERE q.quiz_set_id = qs.id
                        ),
                        '[]'::json
                    ) AS questions
                FROM quiz_sets qs
                WHERE qs.id = ${id}
                  AND qs.status = 'published'
                LIMIT 1
            `;

            if (!rows[0]) {
                return res.status(404).json({ success: false, message: 'Quiz not found or not published' });
            }
            return res.status(200).json({ success: true, data: rows[0] });
        }

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

    if (!user_id || !quiz_set_id) {
        return res.status(400).json({ success: false, error: "Missing user_id or quiz_set_id" });
    }

    try {
        let correctQuestions;
        if (sql) {
            correctQuestions = await sql`
                SELECT id, correct_answer FROM questions WHERE quiz_set_id = ${quiz_set_id}
            `;
        } else {
            const { data, error: fetchError } = await supabase
                .from('questions')
                .select('id, correct_answer')
                .eq('quiz_set_id', quiz_set_id);
            if (fetchError) throw fetchError;
            correctQuestions = data;
        }

        let calculatedScore = 0;
        const userAnswers = answers || {};

        correctQuestions.forEach((q) => {
            if (userAnswers[q.id] && String(userAnswers[q.id]) === String(q.correct_answer)) {
                calculatedScore += 1;
            }
        });

        // ২. 🔥 সব ডাটা একসাথে RPC এর মাধ্যমে ডাটাবেসে পাঠানো
        const { error: rpcError } = await supabase.rpc('submit_quiz_optimized', {
            p_user_id: user_id,
            p_quiz_set_id: quiz_set_id,
            p_answers: userAnswers,
            p_score: calculatedScore,
            p_time_taken: Number(time_taken) || 0,
            p_sdg_category: sdgCategory || "SDG Activist",
            p_round_number: roundNumber || 1
        });

        if (rpcError) throw rpcError;

        res.status(201).json({
            success: true,
            message: "Quiz submitted successfully through RPC!",
            score: calculatedScore
        });

    } catch (error) {
        console.error("RPC Submission Error:", {
            user_id,
            quiz_set_id,
            errorCode: error.code,
            errorMessage: error.message,
            timestamp: new Date()
        });
        res.status(500).json({ 
            success: false,
            error: process.env.NODE_ENV === 'production' 
                ? 'Server error' 
                : error.message 
        });
    }
};


const updateQuizStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        if (sql) {
            const rows = await sql`
                UPDATE quiz_sets SET status = ${status} WHERE id = ${id} RETURNING *
            `;
            return res.status(200).json({ success: true, message: "Status updated successfully", data: rows[0] });
        }

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

        if (sql) {
            const rows = await sql`
                SELECT id
                FROM quiz_submissions
                WHERE user_id = ${userId} AND quiz_set_id = ${quizId}
                LIMIT 1
            `;
            return res.status(200).json({ hasAttempted: rows.length > 0 });
        }

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

/**
 * One DB round-trip (RPC) when migrate SQL is applied; otherwise same payloads via Supabase selects.
 */
const getQuizEntranceBundle = async (req, res) => {
    const userId = req.user?.sub;
    const raw = req.query.category;
    const category =
        typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;

    if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
        if (sql) {
            try {
                const rows = await sql`
                    SELECT public.get_quiz_entrance_bundle(${category}, ${userId}::uuid) AS bundle
                `;
                const bundle = rows[0]?.bundle;
                return res.status(200).json({
                    success: true,
                    data: bundle?.data ?? [],
                    has_attempted_first: !!bundle?.has_attempted_first,
                });
            } catch (e) {
                const msg = typeof e?.message === "string" ? e.message : "";
                const missingRpc =
                    /does not exist/i.test(msg) &&
                    /get_quiz_entrance_bundle/i.test(msg);
                if (!missingRpc) throw e;
                console.warn(
                    "[quiz-entrance] RPC missing — falling back:",
                    msg,
                );
            }
        }

        if (sql) {
            const rows = await sql`
                SELECT
                    qs.id,
                    qs.title,
                    qs.category,
                    qs.time_limit,
                    qs.start_at,
                    qs.ends_at,
                    COALESCE(
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'id', q.id,
                                    'quiz_set_id', q.quiz_set_id,
                                    'question_text', q.question_text,
                                    'options', q.options
                                )
                                ORDER BY q.id
                            )
                            FROM questions q
                            WHERE q.quiz_set_id = qs.id
                        ),
                        '[]'::json
                    ) AS questions
                FROM quiz_sets qs
                WHERE qs.status = 'published'
                  AND (${category ?? null}::text IS NULL OR qs.category = ${category ?? null})
                ORDER BY qs.created_at DESC
            `;
            let firstId = rows[0]?.id;
            let hasFirst = false;
            if (firstId) {
                const att = await sql`
                    SELECT 1 FROM quiz_submissions
                    WHERE user_id = ${userId} AND quiz_set_id = ${firstId}
                    LIMIT 1
                `;
                hasFirst = att.length > 0;
            }
            return res.status(200).json({
                success: true,
                data: rows,
                has_attempted_first: hasFirst,
            });
        }

        const { data: bundle, error: rpcError } = await supabase.rpc(
            "get_quiz_entrance_bundle",
            { p_category: category, p_user_id: userId },
        );
        if (!rpcError && bundle != null) {
            return res.status(200).json({
                success: true,
                data: bundle.data ?? [],
                has_attempted_first: !!bundle.has_attempted_first,
            });
        }
        if (rpcError) {
            console.warn(
                "[quiz-entrance] supabase rpc fallback:",
                rpcError.message,
            );
        }

        let query = supabase
            .from("quiz_sets")
            .select(
                `
                id,
                title,
                category,
                time_limit,
                start_at,
                ends_at,
                questions (id, quiz_set_id, question_text, options)
            `,
            )
            .eq("status", "published");
        if (category) query = query.eq("category", category);
        const { data: list, error: listError } = await query.order(
            "created_at",
            { ascending: false },
        );
        if (listError) throw listError;

        let hasFirst = false;
        if (list?.length) {
            const { data: sub } = await supabase
                .from("quiz_submissions")
                .select("id")
                .eq("user_id", userId)
                .eq("quiz_set_id", list[0].id)
                .maybeSingle();
            hasFirst = !!sub;
        }
        return res.status(200).json({
            success: true,
            data: list ?? [],
            has_attempted_first: hasFirst,
        });
    } catch (error) {
        console.error("[quiz-entrance]", error?.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getUserAttempts = async (req, res) => {
    try {
        const { userId } = req.params;

        if (sql) {
            const rows = await sql`
                SELECT quiz_set_id
                FROM quiz_submissions
                WHERE user_id = ${userId}
            `;
            return res.status(200).json({ attempts: rows.map((a) => a.quiz_set_id) });
        }

        const { data: attempts, error } = await supabase
            .from('quiz_submissions')
            .select('quiz_set_id')
            .eq('user_id', userId);

        if (error) throw error;

        res.status(200).json({ attempts: attempts.map(a => a.quiz_set_id) });
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
    checkAttempt,
    getUserAttempts,
    getQuizEntranceBundle,
};