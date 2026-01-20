import React, { useState, useEffect } from 'react';
import { ClipboardList, Star, TrendingUp, Award, ChevronRight, Loader2 } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { getStudentTasksWithReviews } from '@/services/reviews/studentTaskReviews';
import { getStudentSoftSkills } from '@/services/reviews/studentSoftSkillsReviews';

const SOFT_SKILL_TRAITS = [
    "Accountability", "Learnability", "Abstract Thinking", "Curiosity", "Second-Order Thinking",
    "Compliance", "Ambitious", "Communication", "English", "First-Principle Thinking"
];

const MyReviewPage = () => {
    const { userId } = useUser();
    const [selectedTab, setSelectedTab] = useState('Score');
    const [tasks, setTasks] = useState<any[]>([]);
    const [softSkills, setSoftSkills] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!userId) return;
            setLoading(true);
            try {
                const tasksData = await getStudentTasksWithReviews(userId);
                setTasks(tasksData || []);

                const softSkillsData = await getStudentSoftSkills(userId);
                setSoftSkills(softSkillsData);
            } catch (error) {
                console.error('Error fetching review data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [userId]);

    const tabs = [
        { id: 'Score', icon: <Star size={24} />, color: '#f59e0b', label: 'Score' },
        { id: 'Review', icon: <ClipboardList size={24} />, color: '#3b82f6', label: 'Review' },
        { id: 'Improvements', icon: <TrendingUp size={24} />, color: '#10b981', label: 'Improvements' },
        { id: 'Soft Skills', icon: <Award size={24} />, color: '#8b5cf6', label: 'Soft Skills' }
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px]">
                <Loader2 className="animate-spin text-gray-400" size={48} />
            </div>
        );
    }

    const renderContent = () => {
        if (selectedTab === 'Soft Skills') {
            const reviews = Array.isArray(softSkills) ? softSkills : (softSkills ? [softSkills] : []);

            if (reviews.length === 0) {
                return (
                    <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '40px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div className="text-gray-400 italic">No soft skills assessment available yet.</div>
                    </div>
                );
            }

            return (
                <div className="flex flex-col gap-8">
                    {reviews.map((review: any, idx: number) => (
                        <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '32px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <div className="flex flex-col md:flex-row gap-12 mb-8">
                                <div className="text-center min-w-[200px]">
                                    <div style={{ width: '120px', height: '120px', borderRadius: '50%', border: '8px solid #8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                        <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>
                                            {review.score ?? 'N/A'}<span style={{ fontSize: '1rem', color: '#94a3b8' }}>/10</span>
                                        </span>
                                    </div>
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1e293b' }}>Overall Soft Skills</h3>
                                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Average of all traits</p>

                                    <div className="mt-4 inline-block">
                                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1e293b', padding: '6px 16px', backgroundColor: '#f3e8ff', borderRadius: '20px', color: '#7e22ce' }}>
                                            By {review.reviewer_role === 'executive' ? 'Executive' : 'Manager'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '12px' }}>Overall Performance Notes</h4>
                                    <div style={{ color: '#475569', lineHeight: '1.6', fontSize: '1.1rem', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9', whiteSpace: 'pre-wrap', minHeight: '100px' }}>
                                        {review.notes || 'No notes provided yet.'}
                                    </div>
                                </div>
                            </div>

                            {/* Traits Grid */}
                            <div>
                                <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>Trait Breakdown</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                    {SOFT_SKILL_TRAITS.map(trait => (
                                        <div key={trait} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '12px 16px', borderRadius: '12px', border: '1px solid #f1f5f9', backgroundColor: '#fff'
                                        }}>
                                            <span style={{ fontWeight: '500', color: '#475569' }}>{trait}</span>
                                            <span style={{ fontWeight: 'bold', color: (review.trait_scores?.[trait] || 0) >= 8 ? '#10b981' : (review.trait_scores?.[trait] || 0) >= 6 ? '#f59e0b' : '#ef4444' }}>
                                                {review.trait_scores?.[trait] !== undefined ? review.trait_scores[trait] : '-'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        // Updated: 'Soft Skills' now uses the table view like other tabs to show per-task scores
        return (
            <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '32px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                {/* Header Row */}
                <div style={{ display: 'flex', borderBottom: '2px solid #f1f5f9', paddingBottom: '16px', marginBottom: '8px' }}>
                    <div style={{ width: '40px', fontWeight: 'bold', color: '#64748b' }}>#</div>
                    <div style={{ flex: 1, fontWeight: 'bold', color: '#1e293b', fontSize: '1rem' }}>Task</div>
                    <div style={{ width: '120px', fontWeight: 'bold', color: '#64748b', fontSize: '1rem', textAlign: 'center' }}>Given By</div>
                    <div style={{ width: '150px', textAlign: 'right', fontWeight: 'bold', color: '#1e293b', fontSize: '1rem' }}>
                        {selectedTab}
                    </div>
                </div>

                {/* Task List */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {tasks.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No tasks assigned yet.</div>
                    ) : (
                        tasks.map((task, index) => {
                            const reviews = task.student_task_reviews || [];
                            // In single-review model, we display the primary review. 
                            // Prioritize Executive if multiple exist (cleanup safety), else first.
                            const review = reviews.find((r: any) => r.reviewer_role === 'executive') || reviews[0];

                            let displayValue: any = '--';

                            // Determine reviewer label
                            let givenBy = '--';
                            if (review?.reviewer_role) {
                                givenBy = review.reviewer_role === 'executive' ? 'Executive' : 'Manager';
                            }

                            // Calculate display value based on tab
                            if (review) {
                                if (selectedTab === 'Score') displayValue = <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{review.score}/10</span>;
                                else if (selectedTab === 'Review') displayValue = <span style={{ fontSize: '0.9rem', color: '#475569' }}>{review.review || '--'}</span>;
                                else if (selectedTab === 'Improvements') displayValue = <span style={{ fontSize: '0.9rem', color: '#475569' }}>{review.improvements || '--'}</span>;
                            }

                            return (
                                <div key={task.id} style={{ display: 'flex', padding: '16px 0', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}>
                                    <div style={{ width: '40px', color: '#94a3b8', fontWeight: '500' }}>{index + 1}</div>
                                    <div style={{ flex: 1, fontWeight: '500', color: '#1e293b' }}>{task.title}</div>

                                    {/* Given By Column */}
                                    <div style={{ width: '120px', textAlign: 'center' }}>
                                        {givenBy !== '--' ? (
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '4px 12px',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold',
                                                backgroundColor: givenBy === 'Executive' ? '#f3e8ff' : '#e0f2fe',
                                                color: givenBy === 'Executive' ? '#7e22ce' : '#0369a1',
                                                textTransform: 'capitalize'
                                            }}>
                                                {givenBy}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#cbd5e1' }}>--</span>
                                        )}
                                    </div>

                                    <div style={{ width: '150px', textAlign: 'right' }}>
                                        {displayValue}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    };



    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1200px', margin: '0 auto' }}>
            <div>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b' }}>My Review</h1>
                <p style={{ color: '#64748b' }}>Track your performance across tasks and soft skills</p>
            </div>

            {/* 4 Cards/Icons */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        onClick={() => setSelectedTab(tab.id)}
                        style={{
                            backgroundColor: selectedTab === tab.id ? tab.color : '#fff',
                            color: selectedTab === tab.id ? '#fff' : '#1e293b',
                            padding: '24px',
                            borderRadius: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            border: '1px solid #e2e8f0',
                            boxShadow: selectedTab === tab.id ? `0 10px 15px -3px ${tab.color}40` : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                            transform: selectedTab === tab.id ? 'translateY(-4px)' : 'none'
                        }}
                    >
                        <div style={{
                            backgroundColor: selectedTab === tab.id ? 'rgba(255,255,255,0.2)' : `${tab.color}15`,
                            color: selectedTab === tab.id ? '#fff' : tab.color,
                            padding: '12px',
                            borderRadius: '16px'
                        }}>
                            {tab.icon}
                        </div>
                        <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{tab.label}</span>
                    </div>
                ))}
            </div>

            {/* Main Content */}
            <div className="mt-4">
                {renderContent()}
            </div>
        </div>
    );
};

export default MyReviewPage;
