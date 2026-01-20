-- Fix RLS Policies to allow Executives to override Manager reviews
-- Currently, RLS likely prevents Executives from updating a row "owned" by a Manager.

-- 1. Enable RLS (just in case)
ALTER TABLE public.student_task_reviews ENABLE ROW LEVEL SECURITY;

-- 2. Drop restrictive policies if they exist (guessing common names, harmless if missing)
DROP POLICY IF EXISTS "Enable update for own reviews" ON public.student_task_reviews;
DROP POLICY IF EXISTS "Enable update for users based on id" ON public.student_task_reviews;
DROP POLICY IF EXISTS "Update all for executive" ON public.student_task_reviews;

-- 3. Create comprehensive UPDATE policy
-- Managers can update their Own reviews.
-- Executives can update ANY review.
CREATE POLICY "Enable smart update for task reviews" ON public.student_task_reviews
FOR UPDATE
USING (
  -- User is the original reviewer
  auth.uid() = reviewer_id 
  OR 
  -- OR User is an Executive (can update anyone's review)
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

-- 4. Ensure Insert is open to both (usually is, but good to verify)
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.student_task_reviews;
DROP POLICY IF EXISTS "Enable insert for managers and executives" ON public.student_task_reviews;
CREATE POLICY "Enable insert for managers and executives" ON public.student_task_reviews
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('manager', 'executive', 'admin')
  )
);

-- 5. Ensure Select is open
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.student_task_reviews;
CREATE POLICY "Enable read access for all authenticated users" ON public.student_task_reviews
FOR SELECT
USING (auth.role() = 'authenticated');
