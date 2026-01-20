-- 1. ROBUST Cleanup: Delete all duplicate reviews, keeping only the best one per task
-- Priority for keeping: 1. Executive Review, 2. Latest Updated Review
DELETE FROM public.student_task_reviews
WHERE id NOT IN (
    SELECT DISTINCT ON (student_id, task_id) id
    FROM public.student_task_reviews
    ORDER BY 
        student_id, 
        task_id, 
        (CASE WHEN reviewer_role = 'executive' THEN 0 ELSE 1 END) ASC, -- Executives (0) come before Managers (1)
        updated_at DESC -- Tie-breaker: Latest update
);

-- 2. Drop the "Separate Reviews" constraint (if it exists)
ALTER TABLE public.student_task_reviews
DROP CONSTRAINT IF EXISTS student_task_reviews_student_task_reviewer_key;

DROP INDEX IF EXISTS student_task_reviews_student_task_reviewer_key;

-- 3. Restore the "Single Review Per Task" constraint
-- Now this should succeed because duplicates are definitely removed
ALTER TABLE public.student_task_reviews
ADD CONSTRAINT student_task_reviews_student_id_task_id_key UNIQUE (student_id, task_id);
