import { supabase } from '../../lib/supabaseClient';

export interface TaskReview {
    id: string;
    student_id: string;
    task_id: number;
    score: number;
    soft_skills_score?: number;
    review: string;
    improvements: string;
    reviewer_id: string;
    reviewer_role: 'executive' | 'manager';
    created_at: string;
    updated_at: string;
}

export type TaskReviewPayload = Omit<TaskReview, 'id' | 'created_at' | 'updated_at'>;

/**
 * Fetch review for a specific task
 */
export const getTaskReview = async (taskId: number) => {
    const { data, error } = await supabase
        .from('student_task_reviews')
        .select('*')
        .eq('task_id', taskId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching task review:', error);
        return null;
    }
    return data as TaskReview | null;
};

/**
 * Upsert review for a student's task
 */
export const upsertTaskReview = async (payload: TaskReviewPayload) => {
    const { data, error } = await supabase
        .from('student_task_reviews')
        .upsert(payload, { onConflict: 'student_id,task_id' })
        .select()
        .single();

    if (error) {
        console.error('Error upserting task review:', error);
        throw error;
    }
    return data as TaskReview;
};

/**
 * Fetch all tasks for a student including their reviews
 */
export const getStudentTasksWithReviews = async (studentId: string) => {
    const { data, error } = await supabase
        .from('tasks')
        .select(`
      *,
      student_task_reviews!left(*)
    `)
        .eq('assigned_to', studentId);

    if (error) {
        console.error('Error fetching student tasks with reviews:', error);
        throw error;
    }
    return data;
};
