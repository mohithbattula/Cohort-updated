-- Fix profiles role check constraint to include 'student'
-- This is necessary to support the 'Student' role in the Cohort organization
-- Run this in the Supabase SQL Editor

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('executive', 'manager', 'team_lead', 'employee', 'student'));
