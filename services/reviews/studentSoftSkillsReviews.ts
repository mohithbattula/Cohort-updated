import { supabase } from '../../lib/supabaseClient';

export interface SoftSkillsReview {
    id: string;
    student_id: string;
    score: number;
    trait_scores?: Record<string, number>;
    notes: string;
    reviewer_id: string;
    reviewer_role: 'executive' | 'manager';
    created_at: string;
    updated_at: string;
}

export type SoftSkillsPayload = Omit<SoftSkillsReview, 'id' | 'created_at' | 'updated_at'>;

/**
 * Fetch soft skills review for a student
 */
export const getStudentSoftSkills = async (studentId: string) => {
    const { data, error } = await supabase
        .from('student_softskills_reviews')
        .select('*')
        .eq('student_id', studentId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching soft skills review:', error);
        return null;
    }
    return data as SoftSkillsReview | null;
};

/**
 * Upsert soft skills review for a student
 */
export const upsertSoftSkills = async (payload: SoftSkillsPayload) => {
    const { data, error } = await supabase
        .from('student_softskills_reviews')
        .upsert(payload, { onConflict: 'student_id,reviewer_id' })
        .select()
        .single();

    if (error) {
        console.error('Error upserting soft skills review:', error);
        throw error;
    }
    return data as SoftSkillsReview;
};
