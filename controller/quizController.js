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
        const filteredForSet = filterAnswersForQuestionSet(
            userAnswers,
            correctQuestions,
        );
        const answerMap = buildAnswerLookupMap(filteredForSet);

        correctQuestions.forEach((q) => {
            const userPick = getLetterFromMap(answerMap, q.id);
            if (answersMatchQuizScoring(userPick, q.correct_answer)) {
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

        // ৩. Participation certificate guarantee — score নির্বিশেষে quiz submit করলেই
        //    is_participated = true হওয়া উচিত। RPC সেটা না করলেও এখানে explicitly set করা হচ্ছে।
        if (sql) {
            await sql`
                UPDATE user_profiles
                SET is_participated = true
                WHERE user_id = ${user_id}
                  AND (is_participated IS NULL OR is_participated = false)
            `;
        } else {
            await supabase
                .from('user_profiles')
                .update({ is_participated: true })
                .eq('user_id', user_id)
                .in('is_participated', [null, false]);
        }

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

const quizDetailKey = (id) => (id == null ? '' : String(id).trim());

/**
 * One row per quiz attempt — latest by time (avoids random overwrites when multiple submits exist).
 */
const pickLatestSubmissionRow = (rows) => {
    const byQuiz = new Map();
    for (const r of rows || []) {
        const k = quizDetailKey(r.quiz_set_id);
        if (!k) continue;
        const prev = byQuiz.get(k);
        if (!prev) {
            byQuiz.set(k, r);
            continue;
        }
        const tNew = Date.parse(
            r.completed_at || r.submitted_at || r.updated_at || r.created_at || 0,
        );
        const tOld = Date.parse(
            prev.completed_at ||
                prev.submitted_at ||
                prev.updated_at ||
                prev.created_at ||
                0,
        );
        const a = Number.isFinite(tNew) ? tNew : 0;
        const b = Number.isFinite(tOld) ? tOld : 0;
        if (a >= b) byQuiz.set(k, r);
    }
    return byQuiz;
};

/**
 * Normalize per-quiz keys and merge with round_performances.
 * Leaderboard reads round_performances — when it has a score, prefer it for display parity.
 */
const mergeAttemptDetailsWithRoundPerformances = (details, rpRows) => {
    const sub = {};
    for (const [k, v] of Object.entries(details || {})) {
        const key = quizDetailKey(k);
        if (key) sub[key] = v;
    }

    const rpByQuiz = new Map();
    for (const r of rpRows || []) {
        const k = quizDetailKey(r.quiz_set_id);
        if (k) rpByQuiz.set(k, r);
    }

    const allKeys = new Set([...Object.keys(sub), ...rpByQuiz.keys()]);
    const out = {};

    for (const k of allKeys) {
        const cur = sub[k] || {};
        const rp = rpByQuiz.get(k);
        const rpScore = rp ? (rp.quiz_score ?? rp.score) : null;
        const subScore = cur.score;
        const score =
            rpScore != null && rpScore !== ''
                ? rpScore
                : subScore != null && subScore !== ''
                  ? subScore
                  : null;
        const time_taken =
            cur.time_taken != null && cur.time_taken !== ''
                ? cur.time_taken
                : rp && rp.time_taken != null
                  ? rp.time_taken
                  : null;
        out[k] = { score, time_taken };
    }

    return out;
};

const getUserAttempts = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ success: false, error: 'Missing user id' });
        }
        if (userId !== req.user?.sub) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        if (sql) {
            let baseRows = [];
            try {
                baseRows = await sql`
                    SELECT DISTINCT quiz_set_id
                    FROM quiz_submissions
                    WHERE user_id = ${userId}::uuid
                `;
            } catch (e) {
                console.warn('[getUserAttempts] quiz_submissions ids', e.message);
            }

            let details = {};
            try {
                const scoreRows = await sql`
                    SELECT DISTINCT ON (quiz_set_id)
                        quiz_set_id, score, time_taken
                    FROM quiz_submissions
                    WHERE user_id = ${userId}::uuid
                    ORDER BY
                        quiz_set_id,
                        completed_at DESC NULLS LAST,
                        updated_at DESC NULLS LAST,
                        id DESC
                `;
                scoreRows.forEach((r) => {
                    details[quizDetailKey(r.quiz_set_id)] = {
                        score: r.score ?? null,
                        time_taken: r.time_taken ?? null,
                    };
                });
            } catch {
                try {
                    const scoreRows2 = await sql`
                        SELECT DISTINCT ON (quiz_set_id)
                            quiz_set_id,
                            quiz_score AS score,
                            time_taken
                        FROM quiz_submissions
                        WHERE user_id = ${userId}::uuid
                        ORDER BY
                            quiz_set_id,
                            completed_at DESC NULLS LAST,
                            updated_at DESC NULLS LAST,
                            id DESC
                    `;
                    scoreRows2.forEach((r) => {
                        details[quizDetailKey(r.quiz_set_id)] = {
                            score: r.score ?? null,
                            time_taken: r.time_taken ?? null,
                        };
                    });
                } catch (e) {
                    console.warn('[getUserAttempts] submission score columns', e.message);
                }
            }

            let rpRows = [];
            try {
                rpRows = await sql`
                    SELECT quiz_set_id, quiz_score, time_taken
                    FROM round_performances
                    WHERE user_id = ${userId}::uuid
                `;
            } catch (e) {
                console.warn('[getUserAttempts] round_performances', e.message);
            }

            details = mergeAttemptDetailsWithRoundPerformances(details, rpRows);

            const attemptSet = new Set(baseRows.map((a) => quizDetailKey(a.quiz_set_id)));
            rpRows.forEach((r) => {
                if (r.quiz_set_id) attemptSet.add(quizDetailKey(r.quiz_set_id));
            });

            await enrichUserAttemptDetails(details, userId);

            return res.status(200).json({
                attempts: Array.from(attemptSet),
                details,
            });
        }

        // Supabase JS path
        const { data: baseAttempts, error: baseError } = await supabase
            .from('quiz_submissions')
            .select('quiz_set_id')
            .eq('user_id', userId);

        if (baseError) throw baseError;

        let details = {};

        const fillFromSubmissions = async () => {
            let scoreData = null;
            let err = null;
            const try1 = await supabase
                .from('quiz_submissions')
                .select(
                    'quiz_set_id, score, time_taken, completed_at, updated_at, created_at',
                )
                .eq('user_id', userId);
            if (!try1.error) scoreData = try1.data;
            else err = try1.error;

            if (!scoreData) {
                const try2 = await supabase
                    .from('quiz_submissions')
                    .select(
                        'quiz_set_id, quiz_score, time_taken, completed_at, updated_at, created_at',
                    )
                    .eq('user_id', userId);
                if (!try2.error && try2.data) {
                    scoreData = try2.data.map((row) => ({
                        quiz_set_id: row.quiz_set_id,
                        score: row.quiz_score ?? null,
                        time_taken: row.time_taken ?? null,
                        completed_at: row.completed_at,
                        updated_at: row.updated_at,
                        created_at: row.created_at,
                    }));
                } else if (try2.error) err = try2.error;
            }

            if (scoreData) {
                const latest = pickLatestSubmissionRow(scoreData);
                latest.forEach((row, qid) => {
                    details[qid] = {
                        score: row.score ?? null,
                        time_taken: row.time_taken ?? null,
                    };
                });
            } else if (err) {
                console.warn('[getUserAttempts] supabase submissions columns', err.message);
            }
        };

        await fillFromSubmissions();

        let rpRows = [];
        const { data: rpData, error: rpErr } = await supabase
            .from('round_performances')
            .select('quiz_set_id, quiz_score, time_taken')
            .eq('user_id', userId);

        if (!rpErr && rpData) rpRows = rpData;
        else if (rpErr) console.warn('[getUserAttempts] round_performances', rpErr.message);

        details = mergeAttemptDetailsWithRoundPerformances(details, rpRows);

        const attemptSet = new Set(
            (baseAttempts || []).map((a) => quizDetailKey(a.quiz_set_id)),
        );
        rpRows.forEach((r) => {
            if (r.quiz_set_id) attemptSet.add(quizDetailKey(r.quiz_set_id));
        });

        await enrichUserAttemptDetails(details, userId);

        res.status(200).json({
            attempts: Array.from(attemptSet),
            details,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const normalizeUuidKey = (id) => {
    if (id == null) return '';
    return String(id).replace(/-/g, '').toLowerCase();
};

const coerceAnswersToObject = (raw) => {
    if (raw == null) return {};
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
        try {
            return coerceAnswersToObject(JSON.parse(raw.toString('utf8')));
        } catch {
            return {};
        }
    }
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return typeof p === 'object' && p !== null && !Array.isArray(p) ? p : {};
        } catch {
            return {};
        }
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
    return {};
};

/** Fast lookup: normalized uuid hex (no dashes) -> option letter */
const buildAnswerLookupMap = (answersRaw) => {
    const o = coerceAnswersToObject(answersRaw);
    const m = new Map();
    for (const [k, v] of Object.entries(o)) {
        if (v === undefined || v === null || v === '') continue;
        const nk = normalizeUuidKey(k);
        if (nk) m.set(nk, v);
        m.set(String(k).trim(), v);
    }
    return m;
};

const getLetterFromMap = (map, questionId) => {
    if (questionId == null) return null;
    const idStr = String(questionId).trim();
    const nk = normalizeUuidKey(idStr);
    if (map.has(idStr)) return map.get(idStr);
    if (nk && map.has(nk)) return map.get(nk);
    return null;
};

/**
 * Use only answer entries whose keys are question ids in this quiz (`questionRows`).
 * Drops stray UUIDs from other quizzes if they appear in the same JSON.
 */
const filterAnswersForQuestionSet = (answersRaw, questionRows) => {
    const allowed = new Set();
    for (const q of questionRows || []) {
        if (q?.id == null) continue;
        const sid = String(q.id).trim();
        allowed.add(sid);
        const nk = normalizeUuidKey(sid);
        if (nk) allowed.add(nk);
    }
    const o = coerceAnswersToObject(answersRaw);
    const out = {};
    for (const [k, v] of Object.entries(o)) {
        if (v === undefined || v === null || v === '') continue;
        const kTrim = String(k).trim();
        const nk = normalizeUuidKey(k);
        if (allowed.has(kTrim) || (nk && allowed.has(nk))) {
            out[k] = v;
        }
    }
    return out;
};

/**
 * Same rule for submitQuiz + review. MCQ option letters are compared case-insensitively
 * (DB/user may use "a" vs "A"). Non-letter / long text stays strict trim match.
 */
const answersMatchQuizScoring = (userPick, correctAnswer) => {
    if (userPick === undefined || userPick === null) return false;
    const p = String(userPick).trim();
    if (p === '') return false;
    if (correctAnswer === undefined || correctAnswer === null) return false;
    const c = String(correctAnswer).trim();
    if (p.length === 1 && c.length === 1 && /[A-Za-z]/.test(p) && /[A-Za-z]/.test(c)) {
        return p.toUpperCase() === c.toUpperCase();
    }
    return p === c;
};

const pickSubmissionFields = (row) => {
    if (!row || typeof row !== 'object') {
        return { answers: {}, score: null, time_taken: null, completed_at: null };
    }
    let answers =
        row.answers ??
        row.user_answers ??
        row.submitted_answers ??
        row.response ??
        row.p_answers ??
        null;
    if (answers == null && row.metadata != null) {
        if (typeof row.metadata === 'string') {
            try {
                const m = JSON.parse(row.metadata);
                answers = m?.answers ?? m?.p_answers;
            } catch {
                /* ignore */
            }
        } else if (typeof row.metadata === 'object') {
            answers = row.metadata.answers ?? row.metadata.p_answers;
        }
    }
    if (answers == null && row.payload != null) {
        if (typeof row.payload === 'string') {
            try {
                const p = JSON.parse(row.payload);
                answers = p?.answers ?? p;
            } catch {
                answers = null;
            }
        } else if (typeof row.payload === 'object') {
            answers = row.payload.answers ?? row.payload;
        }
    }
    return {
        answers,
        score: row.score ?? row.quiz_score ?? null,
        time_taken: row.time_taken ?? null,
        completed_at: row.completed_at ?? row.created_at ?? null,
    };
};

const optionText = (options, letter) => {
    if (letter == null || letter === '') return null;
    let opts = options;
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(opts)) {
        try {
            const p = JSON.parse(opts.toString('utf8'));
            opts = typeof p === 'object' && p !== null ? p : null;
        } catch {
            return null;
        }
    }
    if (typeof options === 'string') {
        try {
            const p = JSON.parse(options);
            opts = typeof p === 'object' && p !== null ? p : null;
        } catch {
            return null;
        }
    }
    if (!opts || typeof opts !== 'object' || Array.isArray(opts)) return null;
    const L = String(letter).trim();
    const upper = L.toUpperCase();
    const lower = L.toLowerCase();
    const v =
        opts[L] ??
        opts[upper] ??
        opts[lower] ??
        opts[String(letter)];
    return v != null ? String(v) : null;
};

/**
 * Build per-question review rows: same answer lookup + equality as {@link submitQuiz}.
 * Only questions belonging to expectedQuizSetId are scored (see `questionRows` from DB filter).
 */
const computeQuizReviewItems = (questionRows, picked, expectedQuizSetId) => {
    const filteredAnswers = filterAnswersForQuestionSet(
        picked.answers,
        questionRows,
    );
    const keyCount = Object.keys(filteredAnswers).length;

    let rows = questionRows || [];
    if (expectedQuizSetId != null) {
        rows = rows.filter((q) => {
            if (q?.quiz_set_id == null) return true;
            return (
                quizDetailKey(String(q.quiz_set_id)) ===
                quizDetailKey(String(expectedQuizSetId))
            );
        });
    }

    const pushItem = (arr, counts, q, userPick) => {
        const pickedStr =
            userPick != null && String(userPick).trim() !== ''
                ? String(userPick).trim()
                : null;
        const correctAns = q.correct_answer;
        const isUnanswered = pickedStr == null || pickedStr === '';
        const isCorrect =
            !isUnanswered && answersMatchQuizScoring(userPick, correctAns);
        arr.push({
            question_id: q.id,
            question_text: q.question_text,
            options: q.options,
            user_answer: pickedStr,
            correct_answer: correctAns,
            is_correct: !!isCorrect,
            is_unanswered: isUnanswered,
            user_answer_label: pickedStr,
            correct_answer_label: correctAns != null ? String(correctAns) : null,
            user_answer_text: optionText(q.options, pickedStr),
            correct_answer_text: optionText(q.options, correctAns),
        });
        if (isUnanswered) counts.unanswered += 1;
        else if (isCorrect) counts.correct += 1;
        else counts.wrong += 1;
    };

    const map = buildAnswerLookupMap(filteredAnswers);
    const items = [];
    const counts = { correct: 0, wrong: 0, unanswered: 0 };
    for (const q of rows) {
        const qid = q.id != null ? String(q.id) : '';
        const userPick = getLetterFromMap(map, qid);
        pushItem(items, counts, q, userPick);
    }

    return {
        items,
        correctCount: counts.correct,
        wrongCount: counts.wrong,
        unansweredCount: counts.unanswered,
        answerKeyCount: keyCount,
        matchMode: 'uuid_map_strict',
    };
};

/**
 * Add total_questions for dashboard cards; keep score from DB/merge (leaderboard source).
 */
async function enrichUserAttemptDetails(details, userId) {
    if (!details || typeof details !== 'object') return;
    const ids = Object.keys(details);
    for (const quizSetId of ids) {
        try {
            let submission;
            let questionRows;

            if (sql) {
                const subRows = await sql`
                    SELECT *
                    FROM quiz_submissions
                    WHERE user_id = ${userId}::uuid AND quiz_set_id = ${quizSetId}::uuid
                    ORDER BY completed_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC
                    LIMIT 1
                `;
                if (!subRows[0]) continue;
                submission = subRows[0];
                questionRows = await sql`
                    SELECT id, quiz_set_id, question_text, options, correct_answer
                    FROM questions
                    WHERE quiz_set_id = ${quizSetId}::uuid
                    ORDER BY id ASC
                `;
            } else {
                const { data: subRows, error: se } = await supabase
                    .from('quiz_submissions')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('quiz_set_id', quizSetId)
                    .order('completed_at', { ascending: false })
                    .limit(1);
                if (se || !subRows?.[0]) continue;
                submission = subRows[0];
                const { data: qs, error: qe } = await supabase
                    .from('questions')
                    .select('id, quiz_set_id, question_text, options, correct_answer')
                    .eq('quiz_set_id', quizSetId)
                    .order('id', { ascending: true });
                if (qe) continue;
                questionRows = qs || [];
            }

            if (!questionRows?.length) continue;

            const picked = pickSubmissionFields(submission);
            const review = computeQuizReviewItems(questionRows, picked, quizSetId);

            details[quizSetId] = {
                ...details[quizSetId],
                total_questions: review.items.length,
                time_taken:
                    details[quizSetId]?.time_taken ?? picked.time_taken ?? null,
            };
        } catch (e) {
            console.warn('[enrichUserAttemptDetails]', quizSetId, e.message);
        }
    }
}

/**
 * Authenticated user's own submission vs questions — for post-quiz review (right/wrong per question).
 */
const getMyQuizReview = async (req, res) => {
    const userId = req.user?.sub;
    const { quizSetId } = req.params;

    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!quizSetId) {
        return res.status(400).json({ success: false, error: 'Missing quiz id' });
    }

    try {
        let submission;
        let quizMeta;
        let questionRows;

        if (sql) {
            const subRows = await sql`
                SELECT *
                FROM quiz_submissions
                WHERE user_id = ${userId}::uuid AND quiz_set_id = ${quizSetId}::uuid
                ORDER BY completed_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC
                LIMIT 1
            `;
            if (!subRows[0]) {
                return res.status(404).json({
                    success: false,
                    error: 'No submission found for this quiz.',
                });
            }
            submission = subRows[0];
            const subQuiz = submission.quiz_set_id;
            if (
                subQuiz != null &&
                quizDetailKey(String(subQuiz)) !== quizDetailKey(String(quizSetId))
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Submission does not belong to this quiz set.',
                });
            }

            const metaRows = await sql`
                SELECT id, title, category, time_limit
                FROM quiz_sets
                WHERE id = ${quizSetId}
                LIMIT 1
            `;
            quizMeta = metaRows[0] || { id: quizSetId, title: 'Quiz', category: null, time_limit: null };

            questionRows = await sql`
                SELECT id, quiz_set_id, question_text, options, correct_answer
                FROM questions
                WHERE quiz_set_id = ${quizSetId}
                ORDER BY id ASC
            `;
        } else {
            const { data: subRows, error: subErr } = await supabase
                .from('quiz_submissions')
                .select('*')
                .eq('user_id', userId)
                .eq('quiz_set_id', quizSetId)
                .order('completed_at', { ascending: false })
                .limit(1);

            if (subErr) throw subErr;
            const sub = subRows?.[0] ?? null;
            if (!sub) {
                return res.status(404).json({
                    success: false,
                    error: 'No submission found for this quiz.',
                });
            }
            submission = sub;
            if (
                sub.quiz_set_id != null &&
                quizDetailKey(String(sub.quiz_set_id)) !==
                    quizDetailKey(String(quizSetId))
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Submission does not belong to this quiz set.',
                });
            }

            const { data: meta, error: metaErr } = await supabase
                .from('quiz_sets')
                .select('id, title, category, time_limit')
                .eq('id', quizSetId)
                .maybeSingle();
            if (metaErr) throw metaErr;
            quizMeta = meta || { id: quizSetId, title: 'Quiz', category: null, time_limit: null };

            const { data: qs, error: qErr } = await supabase
                .from('questions')
                .select('id, quiz_set_id, question_text, options, correct_answer')
                .eq('quiz_set_id', quizSetId)
                .order('id', { ascending: true });
            if (qErr) throw qErr;
            questionRows = qs || [];
        }

        let rpScoreVal = null;
        if (sql) {
            try {
                const rpr = await sql`
                    SELECT quiz_score
                    FROM round_performances
                    WHERE user_id = ${userId}::uuid
                      AND quiz_set_id = ${quizSetId}::uuid
                    LIMIT 1
                `;
                if (rpr[0]) {
                    rpScoreVal = rpr[0].quiz_score ?? null;
                }
            } catch {
                /* optional row */
            }
        } else {
            try {
                const { data: rpr } = await supabase
                    .from('round_performances')
                    .select('quiz_score')
                    .eq('user_id', userId)
                    .eq('quiz_set_id', quizSetId)
                    .maybeSingle();
                if (rpr) rpScoreVal = rpr.quiz_score ?? null;
            } catch {
                /* optional row */
            }
        }

        const picked = pickSubmissionFields(submission);

        const review = computeQuizReviewItems(questionRows, picked, quizSetId);

        const storedScore =
            picked.score != null && picked.score !== ''
                ? Number(picked.score)
                : null;
        const rpNum =
            rpScoreVal != null && rpScoreVal !== ''
                ? Number(rpScoreVal)
                : null;

        const officialCorrect = Number.isFinite(rpNum)
            ? rpNum
            : Number.isFinite(storedScore)
              ? storedScore
              : review.correctCount;

        const scoreSource = Number.isFinite(rpNum)
            ? 'round_performances'
            : Number.isFinite(storedScore)
              ? 'quiz_submissions'
              : 'recount';

        const breakdownMatchesOfficial =
            !Number.isFinite(rpNum) && !Number.isFinite(storedScore)
                ? true
                : review.correctCount === officialCorrect;

        return res.status(200).json({
            success: true,
            data: {
                quiz_set_id: quizSetId,
                quiz: quizMeta,
                submission: {
                    score: officialCorrect,
                    time_taken: picked.time_taken ?? null,
                    completed_at: picked.completed_at ?? null,
                },
                items: review.items,
                summary: {
                    total: review.items.length,
                    correct: officialCorrect,
                    wrong: review.wrongCount,
                    unanswered: review.unansweredCount,
                    answer_keys_saved: review.answerKeyCount,
                    match_mode: review.matchMode,
                    /** True when headline matches saved row in quiz_submissions */
                    uses_stored_score:
                        Number.isFinite(storedScore) &&
                        officialCorrect === storedScore,
                    score_source: scoreSource,
                    /** Strict re-check vs current question rows */
                    line_matched_correct: review.correctCount,
                    breakdown_matches_official: breakdownMatchesOfficial,
                },
            },
        });
    } catch (error) {
        console.error('[getMyQuizReview]', error?.message);
        return res.status(500).json({
            success: false,
            error:
                process.env.NODE_ENV === 'production'
                    ? 'Server error'
                    : error.message,
        });
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
    getMyQuizReview,
};