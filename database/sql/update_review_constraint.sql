-- Drop the existing unique constraint that allows only one review per task regardless of reviewer
ALTER TABLE public.student_task_reviews
DROP CONSTRAINT IF EXISTS student_task_reviews_student_id_task_id_key;

-- Also try dropping by index name if constraint name differs (common default name)
DROP INDEX IF EXISTS student_task_reviews_student_id_task_id_key;

-- Add a new unique constraint that includes the reviewer_id
-- This allows one review per reviewer for each task (e.g., one from Manager, one from Executive)
ALTER TABLE public.student_task_reviews
ADD CONSTRAINT student_task_reviews_student_task_reviewer_key UNIQUE (student_id, task_id, reviewer_id);
