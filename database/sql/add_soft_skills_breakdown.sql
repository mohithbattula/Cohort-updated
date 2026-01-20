-- 1. Add 'trait_scores' column to store the breakdown
ALTER TABLE public.student_softskills_reviews 
ADD COLUMN IF NOT EXISTS trait_scores jsonb DEFAULT '{}'::jsonb;

-- 2. Ensure reviewer identification columns exist
ALTER TABLE public.student_softskills_reviews 
ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES auth.users(id);

ALTER TABLE public.student_softskills_reviews 
ADD COLUMN IF NOT EXISTS reviewer_role text CHECK (reviewer_role IN ('executive', 'manager'));

-- 3. Update Unique Constraint to allow separate reviews per reviewer
-- Drop old constraint (likely on student_id only)
ALTER TABLE public.student_softskills_reviews
DROP CONSTRAINT IF EXISTS student_softskills_reviews_student_id_key;

DROP INDEX IF EXISTS student_softskills_reviews_student_id_key;

-- Add new constraint
ALTER TABLE public.student_softskills_reviews
ADD CONSTRAINT student_softskills_reviews_student_reviewer_key UNIQUE (student_id, reviewer_id);

-- 4. Enable RLS
ALTER TABLE public.student_softskills_reviews ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable insert for managers and executives ssk') THEN
        CREATE POLICY "Enable insert for managers and executives ssk" ON public.student_softskills_reviews
        FOR INSERT
        WITH CHECK (
          auth.uid() IN (
            SELECT id FROM profiles WHERE role IN ('manager', 'executive', 'admin')
          )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable update for own reviews ssk') THEN
        CREATE POLICY "Enable update for own reviews ssk" ON public.student_softskills_reviews
        FOR UPDATE
        USING (auth.uid() = reviewer_id)
        WITH CHECK (auth.uid() = reviewer_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable read access for all authenticated users ssk') THEN
        CREATE POLICY "Enable read access for all authenticated users ssk" ON public.student_softskills_reviews
        FOR SELECT
        USING (auth.role() = 'authenticated');
    END IF;
END $$;
