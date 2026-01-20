import React, { useState, useEffect } from 'react';
import {
    Users, ClipboardList, Star, TrendingUp, Award,
    Save, Search, ChevronRight, Loader2, X
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { upsertTaskReview, getStudentTasksWithReviews } from '@/services/reviews/studentTaskReviews';
import { upsertSoftSkills, getStudentSoftSkills } from '@/services/reviews/studentSoftSkillsReviews';

const SOFT_SKILL_TRAITS = [
    "Accountability", "Learnability", "Abstract Thinking", "Curiosity", "Second-Order Thinking",
    "Compliance", "Ambitious", "Communication", "English", "First-Principle Thinking"
];

const StudentReviewPage = () => {
    const { userId, userRole, teamId } = useUser();
    const { addToast } = useToast();

    // State
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('Score'); // 'Score' | 'Review' | 'Improvements' | 'Soft Skills'

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [studentTasks, setStudentTasks] = useState<any[]>([]);
    const [studentSoftSkills, setStudentSoftSkills] = useState<any>(null);

    // Form State (for Modal)
    const [selectedTask, setSelectedTask] = useState<any>(null);
    const [taskScore, setTaskScore] = useState(0);
    const [taskReview, setTaskReview] = useState('');
    const [taskImprovements, setTaskImprovements] = useState('');
    const [taskSoftSkillsScore, setTaskSoftSkillsScore] = useState(0); // For per-task soft skills
    const [softSkillsScore, setSoftSkillsScore] = useState(0); // For global soft skills (existing tab)
    const [softSkillsTraits, setSoftSkillsTraits] = useState<Record<string, number>>({});
    const [softSkillsNotes, setSoftSkillsNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState(false);

    useEffect(() => {
        fetchStudents();
    }, [userId, userRole, teamId]);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('profiles')
                .select('*')
                .in('role', ['employee', 'manager']);

            if (userRole === 'manager' && teamId) {
                query = query.eq('team_id', teamId);
            }

            const { data, error } = await query;
            if (error) throw error;

            const sortedData = (data || []).sort((a: any, b: any) =>
                (a.full_name || '').localeCompare(b.full_name || '')
            );

            setStudents(sortedData);
        } catch (error) {
            console.error('Error fetching students:', error);
            addToast('Failed to fetch students', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleStudentClick = async (student: any) => {
        setSelectedStudent(student);
        setShowModal(true);
        setStudentTasks([]);
        setStudentSoftSkills(null);

        // Reset form states
        setSelectedTask(null);
        setTaskScore(0);
        setTaskReview('');
        setTaskReview('');
        setTaskImprovements('');
        setIsReadOnly(false);
        setSoftSkillsScore(0);
        setSoftSkillsNotes('');

        // Fetch tasks and soft skills
        try {
            const tasksData = await getStudentTasksWithReviews(student.id);
            setStudentTasks(tasksData || []);

            const softSkillsDataArray: any = await getStudentSoftSkills(student.id);
            // softSkillsDataArray is likely an array now due to service change, or null
            setStudentSoftSkills(softSkillsDataArray);

            const mySoftSkills = Array.isArray(softSkillsDataArray)
                ? softSkillsDataArray.find((r: any) => r.reviewer_id === userId)
                : null;

            if (mySoftSkills) {
                setSoftSkillsScore(mySoftSkills.score);
                setSoftSkillsNotes(mySoftSkills.notes || '');
                setSoftSkillsTraits(mySoftSkills.trait_scores || {});
            } else {
                // Initialize default traits
                const defaults: Record<string, number> = {};
                SOFT_SKILL_TRAITS.forEach(t => defaults[t] = 0);
                setSoftSkillsTraits(defaults);
                setSoftSkillsScore(0);
            }
        } catch (error) {
            console.error('Error fetching student details:', error);
            addToast('Failed to fetch student details', 'error');
        }
    };

    const handleTaskSelect = (task: any) => {
        setSelectedTask(task);
        // Single review per task model
        const review = task.student_task_reviews?.[0] || {};

        // Manager cannot edit Executive reviews
        const locked = userRole === 'manager' && review.reviewer_role === 'executive';
        setIsReadOnly(locked);

        setTaskScore(review.score || 0);
        setTaskSoftSkillsScore(review.soft_skills_score || 0);
        setTaskReview(review.review || '');
        setTaskImprovements(review.improvements || '');
    };

    const handleSaveTaskReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent || !selectedTask || !userId) return;

        setSaving(true);
        try {
            // Ensure payload exactly matches what the service expects
            await upsertTaskReview({
                student_id: selectedStudent.id,
                task_id: selectedTask.id,
                score: taskScore,
                soft_skills_score: taskSoftSkillsScore,
                review: taskReview,
                improvements: taskImprovements,
                reviewer_id: userId,
                reviewer_role: userRole as 'executive' | 'manager'
            });

            addToast('Review saved successfully', 'success');

            const updatedTasks = studentTasks.map(t => {
                if (t.id === selectedTask.id) {
                    const newReview = {
                        reviewer_id: userId,
                        reviewer_role: userRole,
                        score: taskScore,
                        soft_skills_score: taskSoftSkillsScore,
                        review: taskReview,
                        improvements: taskImprovements
                    };

                    return {
                        ...t,
                        student_task_reviews: [newReview] // Replace with single review
                    };
                }
                return t;
            });
            setStudentTasks(updatedTasks);

        } catch (error) {
            console.error('Error saving task review:', error);
            addToast('Failed to save review', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSoftSkills = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent || !userId) return;

        setSaving(true);
        try {
            // Calculate average just to be safe, though state should have it
            const values = Object.values(softSkillsTraits);
            const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            const finalScore = parseFloat(avg.toFixed(1));

            await upsertSoftSkills({
                student_id: selectedStudent.id,
                score: finalScore,
                trait_scores: softSkillsTraits,
                notes: softSkillsNotes,
                reviewer_id: userId,
                reviewer_role: userRole as 'executive' | 'manager'
            });

            addToast('Soft skills assessment saved', 'success');
            setShowModal(false);
        } catch (error) {
            console.error('Error saving soft skills:', error);
            addToast('Failed to save soft skills', 'error');
        } finally {
            setSaving(false);
        }
    };

    const filteredStudents = students.filter(s =>
        (s.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const tabs = [
        { id: 'Score', icon: <Star size={24} />, color: '#f59e0b', label: 'Score' },
        { id: 'Review', icon: <ClipboardList size={24} />, color: '#3b82f6', label: 'Review' },
        { id: 'Improvements', icon: <TrendingUp size={24} />, color: '#10b981', label: 'Improvements' },
        { id: 'Soft Skills', icon: <Award size={24} />, color: '#8b5cf6', label: 'Soft Skills' }
    ];

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] p-6 lg:p-8" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div className="mb-8">
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>Student Review</h1>
                <p style={{ color: '#64748b' }}>Track performance across tasks</p>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            backgroundColor: '#fff',
                            borderRadius: '20px',
                            padding: '24px',
                            border: activeTab === tab.id ? `2px solid ${tab.color}` : '1px solid #e2e8f0',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: activeTab === tab.id ? `0 10px 20px -5px ${tab.color}30` : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '16px',
                            backgroundColor: `${tab.color}15`,
                            color: tab.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            {tab.icon}
                        </div>
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: activeTab === tab.id ? tab.color : '#64748b' }}>
                            {tab.label}
                        </span>
                    </button>
                ))}
            </div>

            {/* Main Content: Student List */}
            {/* Removed the white container background and border to match request */}
            <div style={{ marginTop: '16px' }}>
                {activeTab !== 'Soft Skills' ? (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b' }}>
                                All Students <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 'normal' }}>({filteredStudents.length})</span>
                            </h2>
                            <div style={{ position: 'relative', width: '300px' }}>
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    type="text"
                                    placeholder="Search students..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 16px 10px 40px',
                                        borderRadius: '12px',
                                        border: '1px solid #e2e8f0',
                                        backgroundColor: '#fff',
                                        outline: 'none',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="animate-spin text-blue-500" size={32} />
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {filteredStudents.length === 0 ? (
                                    <div className="text-center py-12 text-gray-400">No students found matching your criteria</div>
                                ) : (
                                    filteredStudents.map((student, index) => (
                                        <div
                                            key={student.id}
                                            onClick={() => handleStudentClick(student)}
                                            style={{
                                                padding: '16px 24px',
                                                borderRadius: '16px',
                                                border: '1px solid #e2e8f0',
                                                backgroundColor: '#fff',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '24px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = '#3b82f6';
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.05)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = '#e2e8f0';
                                                e.currentTarget.style.transform = 'none';
                                                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                                            }}
                                        >
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '50%',
                                                backgroundColor: '#f1f5f9',
                                                color: '#64748b',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: 'bold',
                                                flexShrink: 0
                                            }}>
                                                {index + 1}
                                            </div>
                                            <div style={{
                                                width: '48px', height: '48px', borderRadius: '50%',
                                                backgroundColor: '#eff6ff', color: '#3b82f6',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 'bold', fontSize: '1.2rem',
                                                flexShrink: 0
                                            }}>
                                                {student.full_name?.charAt(0) || 'S'}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <h3 style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '1.1rem' }}>{student.full_name || 'Unnamed'}</h3>
                                                <p style={{ fontSize: '0.9rem', color: '#64748b' }}>{student.email}</p>
                                            </div>
                                            <div style={{
                                                padding: '4px 12px',
                                                borderRadius: '20px',
                                                backgroundColor: '#f1f5f9',
                                                color: '#64748b',
                                                fontSize: '0.85rem',
                                                fontWeight: '500'
                                            }}>
                                                {student.role}
                                            </div>
                                            <ChevronRight size={20} color="#cbd5e1" />
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50">
                        <Award size={64} className="mb-4 text-purple-300" />
                        <p className="text-gray-400 text-lg">Select 'Score' or 'Review' to see student list</p>
                    </div>
                )}
            </div>

            {/* Modal for Review */}
            {showModal && selectedStudent && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        backgroundColor: '#fff', borderRadius: '20px', width: '100%',
                        maxWidth: '700px', // Reduced width
                        maxHeight: '85vh', // Reduced height
                        display: 'flex', flexDirection: 'column',
                        overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                {/* Enforce visibility with specific styling */}
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#1e293b', lineHeight: '1.2' }}>
                                    {activeTab === 'Soft Skills' ? 'Soft Skills Assessment' : `Review: ${selectedStudent.full_name}`}
                                </h2>
                                <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
                                    {activeTab === 'Soft Skills' ? 'Overall performance' : 'Select a task to grade'}
                                </p>
                            </div>
                            <button onClick={() => setShowModal(false)} style={{ padding: '8px', borderRadius: '50%', border: 'none', cursor: 'pointer', backgroundColor: '#f1f5f9' }}>
                                <X size={24} color="#64748b" />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', gap: '24px', flexDirection: activeTab === 'Soft Skills' ? 'column' : 'row' }}>
                            {activeTab === 'Soft Skills' ? (
                                <form onSubmit={handleSaveSoftSkills} style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
                                    <div className="mb-6 p-6 bg-white rounded-2xl border border-[#e2e8f0]">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                                            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1e293b' }}>
                                                Soft Skills Assessment (0-10 each)
                                            </h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ color: '#64748b' }}>Average:</span>
                                                <div style={{
                                                    padding: '8px 16px', borderRadius: '12px',
                                                    backgroundColor: '#8b5cf6', color: 'white',
                                                    fontWeight: 'bold', fontSize: '1.2rem'
                                                }}>
                                                    {softSkillsScore}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                            {SOFT_SKILL_TRAITS.map(trait => (
                                                <div key={trait} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <label style={{ color: '#475569', fontWeight: '500' }}>{trait}</label>
                                                    <input
                                                        type="number"
                                                        min="0" max="10" step="0.5"
                                                        value={softSkillsTraits[trait] || 0}
                                                        onChange={(e) => {
                                                            let val = parseFloat(e.target.value);
                                                            if (isNaN(val)) val = 0;
                                                            if (val > 10) val = 10;
                                                            if (val < 0) val = 0;

                                                            const newTraits = { ...softSkillsTraits, [trait]: val };
                                                            setSoftSkillsTraits(newTraits);

                                                            // Recalc average
                                                            const values = Object.values(newTraits);
                                                            const avg = values.reduce((a, b) => a + b, 0) / values.length; // Divide by total traits count or current? 
                                                            // Usually divide by total count (10) or just active?
                                                            // Let's divide by TOTAL Traits defined to encourage filling all?
                                                            // No, user input might depend. But traits are fixed.
                                                            // The image shows filled boxes.
                                                            // Let's divide by SOFT_SKILL_TRAITS.length to be consistent.
                                                            const fixedAvg = parseFloat((values.reduce((a, b) => a + b, 0) / SOFT_SKILL_TRAITS.length).toFixed(1));
                                                            setSoftSkillsScore(fixedAvg);
                                                        }}
                                                        style={{
                                                            width: '80px', padding: '8px', borderRadius: '8px',
                                                            border: '1px solid #cbd5e1', textAlign: 'center'
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mb-8">
                                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>
                                            Overall Performance Notes
                                        </label>
                                        <textarea
                                            style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', minHeight: '100px', fontSize: '1rem' }}
                                            placeholder="Provide general feedback on soft skills..."
                                            value={softSkillsNotes}
                                            onChange={(e) => setSoftSkillsNotes(e.target.value)}
                                        />
                                    </div>
                                    <button type="submit" disabled={saving} style={{ width: '100%', padding: '14px', borderRadius: '12px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                                        {saving ? 'Saving...' : 'Save Assessment'}
                                    </button>
                                </form>
                            ) : (
                                <>
                                    {/* Task List - Slightly narrower */}
                                    <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '12px', borderRight: '1px solid #f1f5f9', paddingRight: '24px' }}>
                                        <h3 style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '0.95rem', color: '#64748b' }}>Select Task</h3>
                                        {studentTasks.length === 0 ? (
                                            <div className="text-gray-400 italic font-sm">No tasks assigned</div>
                                        ) : (
                                            studentTasks.map(task => (
                                                <div
                                                    key={task.id}
                                                    onClick={() => handleTaskSelect(task)}
                                                    style={{
                                                        padding: '12px 16px', borderRadius: '10px',
                                                        border: '1px solid',
                                                        borderColor: selectedTask?.id === task.id ? '#3b82f6' : '#e2e8f0',
                                                        backgroundColor: selectedTask?.id === task.id ? '#eff6ff' : '#fff',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '4px' }}>{task.title}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                        Score: <span style={{ fontWeight: 'bold', color: task.student_task_reviews?.[0]?.score ? '#1e293b' : '#94a3b8' }}>{task.student_task_reviews?.[0]?.score ?? '--'}</span>/10
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Grading Form */}
                                    <div style={{ flex: 1 }}>
                                        {selectedTask ? (
                                            <form onSubmit={handleSaveTaskReview}>
                                                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '20px' }}>
                                                    Reviewing: {selectedTask.title}
                                                    {isReadOnly && <span style={{ fontSize: '0.8rem', color: '#ef4444', marginLeft: '10px' }}>(Locked by Executive)</span>}
                                                </h3>

                                                <div className="mb-6">
                                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', fontSize: '0.9rem' }}>Task Score (0-10)</label>
                                                    <div className="flex items-center gap-4">
                                                        <input
                                                            type="range" min="0" max="10" step="0.5" style={{ flex: 1 }}
                                                            value={taskScore} onChange={(e) => setTaskScore(parseFloat(e.target.value))}
                                                            disabled={isReadOnly}
                                                        />
                                                        <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6', width: '50px', textAlign: 'right' }}>{taskScore}</span>
                                                    </div>
                                                </div>

                                                <div className="mb-6">
                                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', fontSize: '0.9rem' }}>Review / Feedback</label>
                                                    <textarea
                                                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', minHeight: '80px', fontSize: '0.9rem' }}
                                                        placeholder="Performance review..."
                                                        value={taskReview}
                                                        onChange={(e) => setTaskReview(e.target.value)}
                                                        disabled={isReadOnly}
                                                    />
                                                </div>

                                                <div className="mb-6">
                                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', fontSize: '0.9rem' }}>Improvements</label>
                                                    <textarea
                                                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', minHeight: '80px', fontSize: '0.9rem' }}
                                                        placeholder="Suggested improvements..."
                                                        value={taskImprovements}
                                                        onChange={(e) => setTaskImprovements(e.target.value)}
                                                        disabled={isReadOnly}
                                                    />
                                                </div>

                                                {!isReadOnly && (
                                                    <button type="submit" disabled={saving} style={{ padding: '10px 24px', backgroundColor: '#000', color: '#fff', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: 'pointer', width: '100%' }}>
                                                        {saving ? 'Saving...' : 'Save Review'}
                                                    </button>
                                                )}
                                            </form>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                                <ClipboardList size={48} className="mb-4 opacity-20" />
                                                <p>Select a task from the left list to review</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentReviewPage;
