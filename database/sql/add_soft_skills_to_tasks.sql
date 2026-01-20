-- Add soft_skills_score to student_task_reviews table
ALTER TABLE public.student_task_reviews 
ADD COLUMN IF NOT EXISTS soft_skills_score numeric check (soft_skills_score >= 0 and soft_skills_score <= 10);
