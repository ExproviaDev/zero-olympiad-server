-- Run once against your Postgres / Supabase database (SQL editor or psql).
-- Speeds quiz list + attempt checks + nested questions reads.

CREATE INDEX IF NOT EXISTS idx_questions_quiz_set_id ON public.questions (quiz_set_id);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_user_quiz
  ON public.quiz_submissions (user_id, quiz_set_id);

CREATE INDEX IF NOT EXISTS idx_quiz_sets_published_category_created_at
  ON public.quiz_sets (category, created_at DESC)
  WHERE status = 'published';

CREATE OR REPLACE FUNCTION public.get_quiz_entrance_bundle(
  p_category text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH base AS (
  SELECT
    qs.id,
    qs.title,
    qs.category,
    qs.time_limit,
    qs.start_at,
    qs.ends_at,
    qs.created_at,
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
        FROM public.questions q
        WHERE q.quiz_set_id = qs.id
      ),
      '[]'::json
    ) AS questions
  FROM public.quiz_sets qs
  WHERE qs.status = 'published'
    AND (
      p_category IS NULL
      OR TRIM(p_category) = ''
      OR qs.category = p_category
    )
),
first_row AS (
  SELECT id FROM base ORDER BY created_at DESC LIMIT 1
),
attempt_flag AS (
  SELECT EXISTS (
    SELECT 1
    FROM public.quiz_submissions s
    WHERE s.user_id = p_user_id
      AND s.quiz_set_id = (SELECT id FROM first_row)
  ) AS has_attempted
)
SELECT jsonb_build_object(
  'data',
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', b.id,
          'title', b.title,
          'category', b.category,
          'time_limit', b.time_limit,
          'start_at', b.start_at,
          'ends_at', b.ends_at,
          'questions', b.questions
        )
        ORDER BY b.created_at DESC
      )
      FROM base b
    ),
    '[]'::json
  ),
  'has_attempted_first', COALESCE((SELECT has_attempted FROM attempt_flag), false)
);
$$;

COMMENT ON FUNCTION public.get_quiz_entrance_bundle(text, uuid) IS
  'Single round-trip for published quizzes (with questions JSON) plus first-quiz submission flag';
