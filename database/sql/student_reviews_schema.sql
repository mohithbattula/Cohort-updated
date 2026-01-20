-- Student Review System Schema
-- Run this in your Supabase SQL Editor

-- 1. Student Task Reviews
create table if not exists public.student_task_reviews (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.profiles(id) on delete cascade,
  task_id bigint references public.tasks(id) on delete cascade,
  score numeric check (score >= 0 and score <= 10),
  review text,
  improvements text,
  reviewer_id uuid references public.profiles(id),
  reviewer_role text check (reviewer_role in ('executive', 'manager')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, task_id)
);

-- 2. Student Soft Skills Reviews
create table if not exists public.student_softskills_reviews (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.profiles(id) on delete cascade,
  score numeric check (score >= 0 and score <= 10),
  notes text,
  reviewer_id uuid references public.profiles(id),
  reviewer_role text check (reviewer_role in ('executive', 'manager')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id)
);

-- Enable RLS
alter table public.student_task_reviews enable row level security;
alter table public.student_softskills_reviews enable row level security;

-- RLS Policies

-- Select policies
create policy "Users can view own task reviews" 
  on public.student_task_reviews for select 
  using (auth.uid() = student_id);

create policy "Users can view own softskills reviews" 
  on public.student_softskills_reviews for select 
  using (auth.uid() = student_id);

create policy "Managers and Executives can view all task reviews" 
  on public.student_task_reviews for select 
  using (exists (
    select 1 from profiles 
    where id = auth.uid() 
    and role in ('executive', 'manager')
  ));

create policy "Managers and Executives can view all softskills reviews" 
  on public.student_softskills_reviews for select 
  using (exists (
    select 1 from profiles 
    where id = auth.uid() 
    and role in ('executive', 'manager')
  ));

-- Insert/Update policies
create policy "Managers and Executives can insert/update task reviews" 
  on public.student_task_reviews for all 
  using (exists (
    select 1 from profiles 
    where id = auth.uid() 
    and role in ('executive', 'manager')
  ));

create policy "Managers and Executives can insert/update softskills reviews" 
  on public.student_softskills_reviews for all 
  using (exists (
    select 1 from profiles 
    where id = auth.uid() 
    and role in ('executive', 'manager')
  ));

-- Add triggers for updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_task_reviews
  before update on public.student_task_reviews
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_softskills_reviews
  before update on public.student_softskills_reviews
  for each row execute function public.handle_updated_at();
