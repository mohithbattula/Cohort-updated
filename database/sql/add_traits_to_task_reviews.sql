
-- Add soft_skill_traits column to student_task_reviews
ALTER TABLE public.student_task_reviews 
ADD COLUMN IF NOT EXISTS soft_skill_traits jsonb DEFAULT '{}'::jsonb;
