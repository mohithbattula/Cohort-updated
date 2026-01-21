import React, { useState, useEffect, useRef } from 'react';
import { ClipboardList, Star, TrendingUp, Award, ChevronRight, Loader2 } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { supabase } from '@/lib/supabaseClient';
import { getStudentTasksWithReviews } from '@/services/reviews/studentTaskReviews';
import { Confetti, type ConfettiRef } from '@/registry/magicui/confetti';

const SOFT_SKILL_TRAITS = [
    "Accountability", "Learnability", "Abstract Thinking", "Curiosity", "Second-Order Thinking",
    "Compliance", "Ambitious", "Communication", "English", "First-Principle Thinking"
];

import SoftSkillsSection from '../components/SoftSkillsSection';

const MyReviewPage = () => {
    const { userId } = useUser();
    const [selectedTab, setSelectedTab] = useState('Score');
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            if (!userId) return;
            setLoading(true);
            try {
                const tasksData = await getStudentTasksWithReviews(userId);
                setTasks(tasksData || []);
            } catch (error) {
                console.error('Error fetching review data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [userId, refreshTrigger]);

    // REAL-TIME SUBSCRIPTION
    useEffect(() => {
        const channel = supabase
            .channel('student-review-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'student_task_reviews' }, (payload) => {
                console.log('Realtime Review Update:', payload);
                setRefreshTrigger(prev => prev + 1);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

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
            const taskReviews = tasks.flatMap(t => t.student_task_reviews || []);

            const traitSums: Record<string, number> = {};
            const traitCounts: Record<string, number> = {};

            SOFT_SKILL_TRAITS.forEach(trait => {
                traitSums[trait] = 0;
                traitCounts[trait] = 0;
            });

            taskReviews.forEach((review: any) => {
                const traits = review.soft_skill_traits || {};
                Object.entries(traits).forEach(([trait, score]) => {
                    if (typeof score === 'number') {
                        traitSums[trait] = (traitSums[trait] || 0) + score;
                        traitCounts[trait] = (traitCounts[trait] || 0) + 1;
                    }
                });
            });

            const calculatedTraits = SOFT_SKILL_TRAITS.map(trait => ({
                name: trait,
                score: traitCounts[trait] > 0 ? traitSums[trait] / traitCounts[trait] : 0
            }));

            const totalSum = calculatedTraits.reduce((sum, t) => sum + t.score, 0);
            const overallScore = calculatedTraits.length > 0 ? totalSum / calculatedTraits.length : 0;

            return (
                <SoftSkillsSection
                    softSkillsAverageScore={overallScore}
                    softSkillsTraits={calculatedTraits}
                />
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
                                givenBy = review.reviewer_role === 'executive' ? 'Tutor' : 'Mentor';
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
                                                backgroundColor: givenBy === 'Tutor' ? '#f3e8ff' : '#e0f2fe',
                                                color: givenBy === 'Tutor' ? '#7e22ce' : '#0369a1',
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
