-- 1. Add missing columns safely
ALTER TABLE public.student_task_reviews 
ADD COLUMN IF NOT EXISTS soft_skills_score numeric CHECK (soft_skills_score >= 0 AND soft_skills_score <= 10);

ALTER TABLE public.student_task_reviews 
ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES auth.users(id);

ALTER TABLE public.student_task_reviews 
ADD COLUMN IF NOT EXISTS reviewer_role text CHECK (reviewer_role IN ('executive', 'manager'));

-- 2. Drop the OLD unique constraint (one review per task)
ALTER TABLE public.student_task_reviews
DROP CONSTRAINT IF EXISTS student_task_reviews_student_id_task_id_key;

DROP INDEX IF EXISTS student_task_reviews_student_id_task_id_key;

-- 3. Add the NEW unique constraint (one review per reviewer per task)
-- Important: If you have existing duplicates that violate this, this step might fail.
-- You might need to delete duplicates first.
ALTER TABLE public.student_task_reviews
ADD CONSTRAINT student_task_reviews_student_task_reviewer_key UNIQUE (student_id, task_id, reviewer_id);

-- 4. Enable RLS and Policies
ALTER TABLE public.student_task_reviews ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable insert for managers and executives') THEN
        CREATE POLICY "Enable insert for managers and executives" ON public.student_task_reviews
        FOR INSERT
        WITH CHECK (
          auth.uid() IN (
            SELECT id FROM profiles WHERE role IN ('manager', 'executive', 'admin')
          )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable update for own reviews') THEN
        CREATE POLICY "Enable update for own reviews" ON public.student_task_reviews
        FOR UPDATE
        USING (auth.uid() = reviewer_id)
        WITH CHECK (auth.uid() = reviewer_id);
    END IF;

     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable read access for all authenticated users') THEN
        CREATE POLICY "Enable read access for all authenticated users" ON public.student_task_reviews
        FOR SELECT
        USING (auth.role() = 'authenticated');
    END IF;
END $$;
