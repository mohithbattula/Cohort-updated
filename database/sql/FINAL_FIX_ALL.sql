-- FINAL CONSOLIDATED FIX
-- Run this script to ensure everything is correct: Constraints + RLS Policies

BEGIN;

-- 1. CLEANUP DUPLICATES (Just in case)
DELETE FROM public.student_task_reviews
WHERE id NOT IN (
    SELECT DISTINCT ON (student_id, task_id) id
    FROM public.student_task_reviews
    ORDER BY 
        student_id, 
        task_id, 
        (CASE WHEN reviewer_role = 'executive' THEN 0 ELSE 1 END) ASC, 
        updated_at DESC
);

-- 2. ENSURE CONSTRAINT EXISTS (Single Review Per Task)
-- We drop it first to avoid "already exists" error, then re-add it.
ALTER TABLE public.student_task_reviews
DROP CONSTRAINT IF EXISTS student_task_reviews_student_id_task_id_key;

DROP INDEX IF EXISTS student_task_reviews_student_id_task_id_key;

-- Drop the old "separate reviews" constraint if it lingers
ALTER TABLE public.student_task_reviews
DROP CONSTRAINT IF EXISTS student_task_reviews_student_task_reviewer_key;
DROP INDEX IF EXISTS student_task_reviews_student_task_reviewer_key;

-- Re-add the proper single-review constraint
ALTER TABLE public.student_task_reviews
ADD CONSTRAINT student_task_reviews_student_id_task_id_key UNIQUE (student_id, task_id);


-- 3. FIX RLS POLICIES (Allow Executives to Override)
ALTER TABLE public.student_task_reviews ENABLE ROW LEVEL SECURITY;

-- Drop potential conflicting policies
DROP POLICY IF EXISTS "Enable update for own reviews" ON public.student_task_reviews;
DROP POLICY IF EXISTS "Enable update for users based on id" ON public.student_task_reviews;
DROP POLICY IF EXISTS "Update all for executive" ON public.student_task_reviews;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.student_task_reviews;
DROP POLICY IF EXISTS "Enable insert for managers and executives" ON public.student_task_reviews;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.student_task_reviews;
DROP POLICY IF EXISTS "Enable smart update for task reviews" ON public.student_task_reviews;

-- Create Policies
-- Read: All authenticated
CREATE POLICY "Enable read access for all authenticated users" ON public.student_task_reviews
FOR SELECT
USING (auth.role() = 'authenticated');

-- Insert: Managers/Execs
CREATE POLICY "Enable insert for managers and executives" ON public.student_task_reviews
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('manager', 'executive', 'admin')
  )
);

-- Update: Managers (Own only), Execs (ANY)
CREATE POLICY "Enable smart update for task reviews" ON public.student_task_reviews
FOR UPDATE
USING (
  auth.uid() = reviewer_id 
  OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'executive'
  )
)
WITH CHECK (
  auth.uid() = reviewer_id 
  OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'executive'
  )
);

COMMIT;
