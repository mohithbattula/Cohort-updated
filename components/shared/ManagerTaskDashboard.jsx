import React, { useState, useEffect } from 'react';
import { Search, Filter, CheckCircle, XCircle, Clock, User, ChevronRight, Eye, History, X, Send, AlertTriangle, Inbox, Users, ArrowRight, BarChart3, Paperclip, FileText, ExternalLink, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

// Lifecycle phases
const LIFECYCLE_PHASES = [
    { key: 'requirement_refiner', label: 'Requirements', short: 'REQ', color: '#8b5cf6' },
    { key: 'design_guidance', label: 'Design', short: 'DES', color: '#06b6d4' },
    { key: 'build_guidance', label: 'Build', short: 'BLD', color: '#f59e0b' },
    { key: 'acceptance_criteria', label: 'Acceptance', short: 'ACC', color: '#10b981' },
    { key: 'deployment', label: 'Deployment', short: 'DEP', color: '#3b82f6' },
    { key: 'closed', label: 'Closed', short: 'DONE', color: '#6b7280' }
];

const getPhaseInfo = (phase) => LIFECYCLE_PHASES.find(p => p.key === phase) || LIFECYCLE_PHASES[0];
const getPhaseIndex = (phase) => LIFECYCLE_PHASES.findIndex(p => p.key === phase);

// Helper to get next lifecycle phase
const getNextPhase = (currentPhase) => {
    const phases = ['requirement_refiner', 'design_guidance', 'build_guidance', 'acceptance_criteria', 'deployment', 'closed'];
    const idx = phases.indexOf(currentPhase);
    return idx >= 0 && idx < phases.length - 1 ? phases[idx + 1] : 'closed';
};

const ManagerTaskDashboard = ({ userRole = 'manager', userId, addToast }) => {
    const [activeTab, setActiveTab] = useState('validation');
    const [validationQueue, setValidationQueue] = useState([]);
    const [allTasks, setAllTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterPhase, setFilterPhase] = useState('all');
    const [selectedTask, setSelectedTask] = useState(null);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [taskHistory, setTaskHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [taskToReject, setTaskToReject] = useState(null);
    const [stats, setStats] = useState({ pending: 0, approved: 0, total: 0, byPhase: {} });

    // Proof preview modal state
    const [showProofPreview, setShowProofPreview] = useState(false);
    const [proofPreviewUrl, setProofPreviewUrl] = useState('');

    // Issue resolution state
    const [showIssueModal, setShowIssueModal] = useState(false);
    const [taskWithIssue, setTaskWithIssue] = useState(null);
    const [resolvingIssue, setResolvingIssue] = useState(false);

    // Extension requests state
    const [extensionRequests, setExtensionRequests] = useState([]);
    const [processingExtension, setProcessingExtension] = useState(null);

    useEffect(() => {
        fetchAllData();
    }, [userId]);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchValidationQueue(), fetchAllTasks(), fetchExtensionRequests()]);
        } finally {
            setLoading(false);
        }
    };

    const fetchExtensionRequests = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', user.id)
                .single();

            const { data, error } = await supabase
                .from('extension_requests')
                .select(`
                    *,
                    tasks(id, title, allocated_hours, assigned_to, lifecycle_state),
                    profiles:requested_by(full_name, email)
                `)
                .eq('status', 'pending')
                .eq('org_id', profile?.org_id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setExtensionRequests(data || []);
        } catch (err) {
            console.error('Error fetching extension requests:', err);
        }
    };

    const handleApproveExtension = async (request) => {
        setProcessingExtension(request.id);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data, error } = await supabase.rpc('approve_extension_request', {
                p_request_id: request.id,
                p_approver_id: user.id
            });

            if (error) throw error;
            if (data?.success) {
                addToast?.('Extension approved! Task unlocked.', 'success');
                fetchAllData();
            } else {
                addToast?.(data?.message || 'Failed to approve extension', 'error');
            }
        } catch (err) {
            console.error('Error approving extension:', err);
            addToast?.('Failed to approve: ' + err.message, 'error');
        } finally {
            setProcessingExtension(null);
        }
    };

    const handleRejectExtension = async (request) => {
        setProcessingExtension(request.id);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data, error } = await supabase.rpc('reject_extension_request', {
                p_request_id: request.id,
                p_approver_id: user.id
            });

            if (error) throw error;
            if (data?.success) {
                addToast?.('Extension request rejected.', 'info');
                fetchAllData();
            } else {
                addToast?.(data?.message || 'Failed to reject extension', 'error');
            }
        } catch (err) {
            console.error('Error rejecting extension:', err);
            addToast?.('Failed to reject: ' + err.message, 'error');
        } finally {
            setProcessingExtension(null);
        }
    };

    const fetchValidationQueue = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Try RPC first
            const { data, error } = await supabase.rpc('get_validation_queue', { p_manager_id: user.id });

            if (!error && data && data.length > 0) {
                setValidationQueue(data);
                return;
            }

            // Fallback: Direct query for pending validation tasks
            console.log('RPC returned empty or errored, using fallback query');
            const { data: tasksData, error: tasksError } = await supabase
                .from('tasks')
                .select('*')
                .eq('sub_state', 'pending_validation');

            if (tasksError) throw tasksError;

            if (tasksData && tasksData.length > 0) {
                // Fetch assignee names
                const assigneeIds = [...new Set(tasksData.map(t => t.assigned_to).filter(Boolean))];
                let namesMap = {};
                if (assigneeIds.length > 0) {
                    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', assigneeIds);
                    if (profiles) profiles.forEach(p => namesMap[p.id] = p.full_name);
                }

                const formatted = tasksData.map(t => ({
                    task_id: t.id,
                    title: t.title,
                    lifecycle_state: t.lifecycle_state || 'requirement_refiner',
                    requested_next_state: getNextPhase(t.lifecycle_state || 'requirement_refiner'),
                    assigned_to_name: namesMap[t.assigned_to] || 'Unknown',
                    sub_state: t.sub_state,
                    proof_url: t.proof_url
                }));

                setValidationQueue(formatted);
            }
        } catch (error) {
            console.error('Error fetching validation queue:', error);
        }
    };

    const fetchAllTasks = async () => {
        try {
            const { data: tasksData, error } = await supabase
                .from('tasks')
                .select('*')
                .neq('lifecycle_state', 'closed');

            if (error) throw error;

            if (tasksData) {
                // Fetch names
                const assigneeIds = [...new Set(tasksData.map(t => t.assigned_to).filter(Boolean))];
                let namesMap = {};
                if (assigneeIds.length > 0) {
                    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', assigneeIds);
                    if (profiles) profiles.forEach(p => namesMap[p.id] = p.full_name);
                }

                const formatted = tasksData.map(t => ({
                    ...t,
                    assignee_name: namesMap[t.assigned_to] || 'Unknown',
                    lifecycle_state: t.lifecycle_state || 'requirement_refiner',
                    sub_state: t.sub_state || 'in_progress'
                }));

                setAllTasks(formatted);

                // Calculate stats
                const pending = formatted.filter(t => t.sub_state === 'pending_validation').length;
                const approved = formatted.filter(t => t.sub_state === 'approved').length;
                const byPhase = {};
                LIFECYCLE_PHASES.forEach(p => {
                    byPhase[p.key] = formatted.filter(t => t.lifecycle_state === p.key).length;
                });
                setStats({ pending, approved, total: formatted.length, byPhase });
            }
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    };

    const fetchTaskHistory = async (taskId) => {
        setHistoryLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_task_history', { p_task_id: taskId });
            if (error) throw error;
            setTaskHistory(data || []);
        } catch (error) {
            setTaskHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const approveTask = async (task) => {
        setActionLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data, error } = await supabase.rpc('approve_task', {
                p_task_id: task.task_id || task.id,
                p_manager_id: user.id,
                p_comment: null
            });

            if (error) throw error;
            if (data?.success) {
                addToast?.(`Task approved! Advanced to ${data.new_lifecycle_state?.replace('_', ' ')}`, 'success');
                fetchAllData();
            } else {
                addToast?.(data?.message || 'Failed to approve task', 'error');
            }
        } catch (error) {
            addToast?.('Failed to approve task', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const rejectTask = async () => {
        if (!rejectReason.trim()) {
            addToast?.('Please provide a reason for rejection', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data, error } = await supabase.rpc('reject_task', {
                p_task_id: taskToReject.task_id || taskToReject.id,
                p_manager_id: user.id,
                p_reason: rejectReason
            });

            if (error) throw error;
            if (data?.success) {
                addToast?.('Task rejected with feedback', 'success');
                setShowRejectModal(false);
                setRejectReason('');
                setTaskToReject(null);
                fetchAllData();
            }
        } catch (error) {
            addToast?.('Failed to reject task', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const openIssueModal = (task) => {
        setTaskWithIssue(task);
        setShowIssueModal(true);
    };

    const resolveIssue = async () => {
        if (!taskWithIssue) return;

        setResolvingIssue(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', user.id)
                .single();

            const userName = profile?.full_name || profile?.email || 'Mentor';
            const timestamp = new Date().toISOString();

            const resolutionEntry = `\n\n[${new Date(timestamp).toLocaleString()}] RESOLVED by ${userName}`;
            const updatedIssues = (taskWithIssue.issues || '') + resolutionEntry;

            const { error } = await supabase
                .from('tasks')
                .update({
                    issues: updatedIssues,
                    updated_at: timestamp
                })
                .eq('id', taskWithIssue.task_id || taskWithIssue.id);

            if (error) throw error;

            addToast?.('Issue marked as resolved!', 'success');
            setShowIssueModal(false);
            setTaskWithIssue(null);
            fetchAllData();
        } catch (error) {
            console.error('Error resolving issue:', error);
            addToast?.('Failed to resolve issue: ' + error.message, 'error');
        } finally {
            setResolvingIssue(false);
        }
    };

    const openRejectModal = (task) => {
        setTaskToReject(task);
        setRejectReason('');
        setShowRejectModal(true);
    };

    const getSubStateStyle = (subState) => {
        const styles = {
            'in_progress': { bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', text: '#fff' },
            'pending_validation': { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', text: '#fff' },
            'approved': { bg: 'linear-gradient(135deg, #10b981, #059669)', text: '#fff' },
            'rejected': { bg: 'linear-gradient(135deg, #ef4444, #dc2626)', text: '#fff' }
        };
        return styles[subState] || styles['in_progress'];
    };

    // Filter tasks
    const filteredTasks = allTasks.filter(task => {
        const matchesSearch = task.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            task.assignee_name?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesPhase = filterPhase === 'all' || task.lifecycle_state === filterPhase;
        return matchesSearch && matchesPhase;
    });

    // Group tasks by employee
    const tasksByEmployee = filteredTasks.reduce((acc, task) => {
        const name = task.assignee_name || 'Unassigned';
        if (!acc[name]) acc[name] = [];
        acc[name].push(task);
        return acc;
    }, {});

    const LifecycleProgressMini = ({ phase }) => {
        const currentIndex = getPhaseIndex(phase);
        return (
            <div style={{ display: 'flex', gap: '2px' }}>
                {LIFECYCLE_PHASES.slice(0, -1).map((p, idx) => (
                    <div key={p.key} style={{
                        width: '20px',
                        height: '4px',
                        borderRadius: '2px',
                        backgroundColor: idx <= currentIndex ? p.color : '#e5e7eb',
                        transition: 'all 0.3s'
                    }} title={p.label} />
                ))}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '0' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        Task Lifecycle Management
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Review, approve, and track task progression across your team
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    borderRadius: '16px',
                    padding: '20px',
                    color: 'white',
                    boxShadow: '0 10px 40px rgba(245, 158, 11, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '12px', padding: '10px' }}>
                            <Inbox size={24} />
                        </div>
                        <div>
                            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{validationQueue.length}</div>
                            <div style={{ opacity: 0.9, fontSize: '0.9rem' }}>Pending Validation</div>
                        </div>
                    </div>
                </div>

                <div style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    borderRadius: '16px',
                    padding: '20px',
                    color: 'white',
                    boxShadow: '0 10px 40px rgba(59, 130, 246, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '12px', padding: '10px' }}>
                            <BarChart3 size={24} />
                        </div>
                        <div>
                            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.total}</div>
                            <div style={{ opacity: 0.9, fontSize: '0.9rem' }}>Active Tasks</div>
                        </div>
                    </div>
                </div>

                <div style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    borderRadius: '16px',
                    padding: '20px',
                    color: 'white',
                    boxShadow: '0 10px 40px rgba(16, 185, 129, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '12px', padding: '10px' }}>
                            <CheckCircle size={24} />
                        </div>
                        <div>
                            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.approved}</div>
                            <div style={{ opacity: 0.9, fontSize: '0.9rem' }}>Approved Today</div>
                        </div>
                    </div>
                </div>

                <div style={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                    borderRadius: '16px',
                    padding: '20px',
                    color: 'white',
                    boxShadow: '0 10px 40px rgba(139, 92, 246, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '12px', padding: '10px' }}>
                            <Users size={24} />
                        </div>
                        <div>
                            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{Object.keys(tasksByEmployee).length}</div>
                            <div style={{ opacity: 0.9, fontSize: '0.9rem' }}>Team Members</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={{
                display: 'flex',
                gap: '8px',
                backgroundColor: 'var(--surface)',
                padding: '6px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                width: 'fit-content'
            }}>
                {[
                    { id: 'validation', label: 'Validation Queue', icon: Inbox, count: validationQueue.length },
                    { id: 'all', label: 'All Tasks', icon: BarChart3, count: stats.total },
                    { id: 'byEmployee', label: 'By Employee', icon: Users, count: Object.keys(tasksByEmployee).length },
                    { id: 'extensions', label: 'Extension Requests', icon: Clock, count: extensionRequests.length }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: activeTab === tab.id ? 'var(--text-primary)' : 'transparent',
                            color: activeTab === tab.id ? 'var(--surface)' : 'var(--text-secondary)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                        {tab.count > 0 && (
                            <span style={{
                                backgroundColor: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '0.75rem'
                            }}>{tab.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Validation Queue Tab */}
            {activeTab === 'validation' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {validationQueue.length === 0 ? (
                        <div style={{
                            backgroundColor: 'var(--surface)',
                            borderRadius: '16px',
                            padding: '48px',
                            textAlign: 'center',
                            border: '1px solid var(--border)'
                        }}>
                            <CheckCircle size={48} color="#10b981" style={{ marginBottom: '16px' }} />
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>All Caught Up!</h3>
                            <p style={{ color: 'var(--text-secondary)' }}>No tasks are pending your validation right now.</p>
                        </div>
                    ) : (
                        validationQueue.map((task, idx) => (
                            <div key={task.task_id || idx} style={{
                                backgroundColor: 'var(--surface)',
                                borderRadius: '16px',
                                padding: '20px',
                                border: '2px solid #f59e0b',
                                boxShadow: '0 4px 20px rgba(245, 158, 11, 0.1)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '20px',
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <span style={{
                                            background: getSubStateStyle('pending_validation').bg,
                                            color: '#fff',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase'
                                        }}>Awaiting Approval</span>
                                    </div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {task.title}
                                    </h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <User size={14} /> {task.assigned_to_name || 'Unknown'}
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <ArrowRight size={14} /> {getPhaseInfo(task.lifecycle_state).label} → {getPhaseInfo(task.requested_next_state).label}
                                        </span>
                                        {task.proof_url && (
                                            <button onClick={() => { setProofPreviewUrl(task.proof_url); setShowProofPreview(true); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 600, backgroundColor: '#f0fdf4', padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
                                                <FileText size={14} /> View Proof <Eye size={12} />
                                            </button>
                                        )}
                                        {task.issues && !task.issues.includes('RESOLVED') && (
                                            <button onClick={(e) => { e.stopPropagation(); openIssueModal(task); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: 600, backgroundColor: '#fef2f2', padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
                                                <AlertTriangle size={14} /> View Issues
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        onClick={() => approveTask(task)}
                                        disabled={actionLoading}
                                        style={{
                                            padding: '12px 24px',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                            color: 'white',
                                            border: 'none',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                                            transition: 'transform 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                        <CheckCircle size={18} /> Approve
                                    </button>
                                    <button
                                        onClick={() => openRejectModal(task)}
                                        disabled={actionLoading}
                                        style={{
                                            padding: '12px 24px',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                            color: 'white',
                                            border: 'none',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
                                            transition: 'transform 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                        <XCircle size={18} /> Reject
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* All Tasks Tab */}
            {activeTab === 'all' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Filters */}
                    <div style={{
                        display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
                        backgroundColor: 'var(--surface)', padding: '16px', borderRadius: '12px',
                        border: '1px solid var(--border)'
                    }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                                type="text"
                                placeholder="Search tasks or employees..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px',
                                    border: '1px solid var(--border)', outline: 'none', fontSize: '0.9rem'
                                }}
                            />
                        </div>
                        <select
                            value={filterPhase}
                            onChange={(e) => setFilterPhase(e.target.value)}
                            style={{
                                padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                                outline: 'none', cursor: 'pointer', backgroundColor: 'var(--background)', fontWeight: 500
                            }}
                        >
                            <option value="all">All Phases</option>
                            {LIFECYCLE_PHASES.slice(0, -1).map(p => (
                                <option key={p.key} value={p.key}>{p.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tasks Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                        {filteredTasks.map(task => {
                            const phaseInfo = getPhaseInfo(task.lifecycle_state);
                            const subStateStyle = getSubStateStyle(task.sub_state);
                            return (
                                <div key={task.id} style={{
                                    backgroundColor: 'var(--surface)',
                                    borderRadius: '16px',
                                    padding: '20px',
                                    border: '1px solid var(--border)',
                                    transition: 'all 0.2s',
                                    cursor: 'pointer'
                                }}
                                    onClick={() => { setSelectedTask(task); setShowTaskModal(true); fetchTaskHistory(task.id); }}
                                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <span style={{
                                            background: subStateStyle.bg,
                                            color: subStateStyle.text,
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase'
                                        }}>
                                            {task.sub_state?.replace('_', ' ')}
                                        </span>
                                        <span style={{
                                            backgroundColor: phaseInfo.color + '20',
                                            color: phaseInfo.color,
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            fontSize: '0.7rem',
                                            fontWeight: 600
                                        }}>
                                            {phaseInfo.short}
                                        </span>
                                    </div>
                                    <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{task.title}</h4>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                                        <User size={14} />
                                        {task.assignee_name}
                                    </div>
                                    <LifecycleProgressMini phase={task.lifecycle_state} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* By Employee Tab */}
            {activeTab === 'byEmployee' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {Object.entries(tasksByEmployee).map(([employee, tasks]) => (
                        <div key={employee} style={{
                            backgroundColor: 'var(--surface)',
                            borderRadius: '16px',
                            border: '1px solid var(--border)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '16px 20px',
                                backgroundColor: 'var(--background)',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontWeight: 600,
                                        fontSize: '1rem'
                                    }}>
                                        {employee.charAt(0)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{employee}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{tasks.length} active task{tasks.length !== 1 ? 's' : ''}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {tasks.filter(t => t.sub_state === 'pending_validation').length > 0 && (
                                        <span style={{
                                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                            color: 'white',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                        }}>
                                            {tasks.filter(t => t.sub_state === 'pending_validation').length} pending
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {tasks.map(task => {
                                    const phaseInfo = getPhaseInfo(task.lifecycle_state);
                                    return (
                                        <div key={task.id} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '12px 16px',
                                            backgroundColor: 'var(--background)',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                            onClick={() => { setSelectedTask(task); setShowTaskModal(true); fetchTaskHistory(task.id); }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border)'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--background)'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    backgroundColor: phaseInfo.color
                                                }} />
                                                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{task.title}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <LifecycleProgressMini phase={task.lifecycle_state} />
                                                <ChevronRight size={16} color="var(--text-secondary)" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Extension Requests Tab */}
            {activeTab === 'extensions' && (
                <div style={{
                    backgroundColor: 'var(--surface)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    overflow: 'hidden'
                }}>
                    {extensionRequests.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center' }}>
                            <Clock size={48} color="#94a3b8" style={{ marginBottom: '16px' }} />
                            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No pending extension requests</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {extensionRequests.map(request => (
                                <div key={request.id} style={{
                                    padding: '20px',
                                    borderBottom: '1px solid var(--border)',
                                    backgroundColor: '#fef2f2'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <span style={{ fontWeight: 600, color: '#991b1b' }}>🔒 {request.tasks?.title || 'Unknown Task'}</span>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#fef3c7', color: '#92400e' }}>
                                                    +{request.additional_hours} hrs requested
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                Requested by: {request.profiles?.full_name || request.profiles?.email || 'Unknown'}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                                {new Date(request.created_at).toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => handleApproveExtension(request)}
                                                disabled={processingExtension === request.id}
                                                style={{
                                                    padding: '8px 16px',
                                                    borderRadius: '8px',
                                                    backgroundColor: '#10b981',
                                                    color: 'white',
                                                    border: 'none',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    opacity: processingExtension === request.id ? 0.6 : 1
                                                }}
                                            >
                                                <CheckCircle size={16} /> Approve
                                            </button>
                                            <button
                                                onClick={() => handleRejectExtension(request)}
                                                disabled={processingExtension === request.id}
                                                style={{
                                                    padding: '8px 16px',
                                                    borderRadius: '8px',
                                                    backgroundColor: '#ef4444',
                                                    color: 'white',
                                                    border: 'none',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    opacity: processingExtension === request.id ? 0.6 : 1
                                                }}
                                            >
                                                <XCircle size={16} /> Reject
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{
                                        padding: '12px',
                                        backgroundColor: 'white',
                                        borderRadius: '8px',
                                        border: '1px solid #fecaca'
                                    }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b', marginBottom: '4px' }}>
                                            Reason:
                                        </div>
                                        <p style={{ fontSize: '0.9rem', color: '#1e293b', margin: 0, whiteSpace: 'pre-wrap' }}>
                                            {request.reason}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Task Details Modal */}
            {showTaskModal && selectedTask && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        backgroundColor: 'var(--surface)', padding: '32px', borderRadius: '20px',
                        width: '600px', maxWidth: '90%', maxHeight: '85vh', overflowY: 'auto',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Task Details</h3>
                            <button onClick={() => setShowTaskModal(false)} style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: 'var(--background)', borderRadius: '16px' }}>
                            <h4 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>{selectedTask.title}</h4>
                            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{selectedTask.description || 'No description'}</p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ padding: '16px', backgroundColor: 'var(--background)', borderRadius: '12px' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Assigned To</div>
                                <div style={{ fontWeight: 600 }}>{selectedTask.assignee_name}</div>
                            </div>
                            <div style={{ padding: '16px', backgroundColor: 'var(--background)', borderRadius: '12px' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Current Phase</div>
                                <div style={{ fontWeight: 600 }}>{getPhaseInfo(selectedTask.lifecycle_state).label}</div>
                            </div>
                        </div>

                        {/* Manager Guidance Section */}
                        {(() => {
                            let parsedValidations = selectedTask.phase_validations;
                            if (typeof selectedTask.phase_validations === 'string') {
                                try {
                                    parsedValidations = JSON.parse(selectedTask.phase_validations);
                                } catch (e) { }
                            }
                            const currentPhaseKey = selectedTask.lifecycle_state || parsedValidations?.active_phases?.[0] || 'requirement_refiner';
                            const guidance = parsedValidations?.guidance?.[currentPhaseKey];
                            const currentPhaseLabel = LIFECYCLE_PHASES.find(p => p.key === currentPhaseKey)?.label || 'Current Phase';

                            if (!guidance) return null;

                            return (
                                <div style={{
                                    padding: '16px',
                                    backgroundColor: '#eff6ff',
                                    borderRadius: '12px',
                                    border: '1px solid #bfdbfe',
                                    marginBottom: '24px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                        <FileText size={16} style={{ color: '#2563eb' }} />
                                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e40af' }}>
                                            Manager Guidance for {currentPhaseLabel}
                                        </span>
                                    </div>
                                    <p style={{
                                        fontSize: '0.9rem',
                                        color: '#1e3a5f',
                                        lineHeight: '1.6',
                                        margin: 0,
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {guidance}
                                    </p>
                                </div>
                            );
                        })()}

                        {/* History */}
                        <div style={{ marginBottom: '24px' }}>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <History size={16} /> State History
                            </h4>
                            {historyLoading ? (
                                <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
                            ) : taskHistory.length === 0 ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No transitions yet.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                    {taskHistory.map((entry, idx) => (
                                        <div key={idx} style={{ padding: '12px', backgroundColor: 'var(--background)', borderRadius: '8px', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontWeight: 600 }}>
                                                    {entry.action === 'approve' && '✅ Approved'}
                                                    {entry.action === 'reject' && '❌ Rejected'}
                                                    {entry.action === 'request_validation' && '📤 Requested'}
                                                </span>
                                                <span style={{ color: 'var(--text-secondary)' }}>{entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}</span>
                                            </div>
                                            <div style={{ color: 'var(--text-secondary)' }}>by {entry.actor_name}</div>
                                            {entry.comment && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>"{entry.comment}"</div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowTaskModal(false)} style={{
                                padding: '12px 24px', borderRadius: '10px', fontWeight: 600,
                                backgroundColor: 'var(--background)', border: '1px solid var(--border)', cursor: 'pointer'
                            }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {showRejectModal && taskToReject && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{ backgroundColor: 'var(--surface)', padding: '32px', borderRadius: '20px', width: '480px', maxWidth: '90%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                            <div style={{ backgroundColor: '#fef2f2', borderRadius: '12px', padding: '12px' }}>
                                <AlertTriangle size={24} color="#ef4444" />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#991b1b' }}>Reject Task</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{taskToReject.title}</p>
                            </div>
                        </div>
                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Provide feedback for the employee (required)..."
                            style={{
                                width: '100%', minHeight: '120px', padding: '14px', borderRadius: '12px',
                                border: '2px solid var(--border)', marginBottom: '20px', resize: 'vertical',
                                fontSize: '0.95rem', outline: 'none'
                            }}
                            onFocus={e => e.target.style.borderColor = '#ef4444'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => { setShowRejectModal(false); setTaskToReject(null); }} style={{
                                padding: '12px 24px', borderRadius: '10px', backgroundColor: 'var(--background)',
                                border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600
                            }}>Cancel</button>
                            <button onClick={rejectTask} disabled={actionLoading || !rejectReason.trim()} style={{
                                padding: '12px 24px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer',
                                opacity: !rejectReason.trim() ? 0.5 : 1,
                                boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)'
                            }}>Reject with Feedback</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Proof Preview Modal */}
            {showProofPreview && proofPreviewUrl && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        backgroundColor: 'var(--surface)', borderRadius: '20px',
                        width: '90%', height: '90%', maxWidth: '1200px',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <FileText size={24} color="#16a34a" />
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Proof Document</h3>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Submitted by employee</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <a href={proofPreviewUrl} target="_blank" rel="noopener noreferrer"
                                    style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#3b82f6', color: 'white', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
                                    Download
                                </a>
                                <button onClick={() => { setShowProofPreview(false); setProofPreviewUrl(''); }}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--background)', cursor: 'pointer' }}>
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
                            {proofPreviewUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                <img src={proofPreviewUrl} alt="Proof" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : proofPreviewUrl.match(/\.pdf$/i) ? (
                                <iframe src={proofPreviewUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
                            ) : (
                                <iframe
                                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(proofPreviewUrl)}&embedded=true`}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                    title="Document Preview"
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Issue Resolution Modal */}
            {showIssueModal && taskWithIssue && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002, backdropFilter: 'blur(4px)' }}>
                    <div style={{ backgroundColor: 'var(--surface)', padding: '32px', borderRadius: '20px', width: '600px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                            <div style={{ backgroundColor: '#fef2f2', borderRadius: '12px', padding: '12px' }}>
                                <AlertTriangle size={24} color="#f59e0b" />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Task Issue Details</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{taskWithIssue.title}</p>
                            </div>
                        </div>

                        <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '2px solid #fecaca' }}>
                            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#991b1b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertCircle size={18} /> Issue Log
                            </h4>
                            <div style={{ fontSize: '0.9rem', color: '#7f1d1d', whiteSpace: 'pre-wrap', lineHeight: '1.8', maxHeight: '300px', overflowY: 'auto' }}>
                                {taskWithIssue.issues || 'No issues reported'}
                            </div>
                        </div>

                        <div style={{ padding: '16px', backgroundColor: '#fef3c7', borderRadius: '12px', marginBottom: '24px', border: '1px solid #fde047' }}>
                            <p style={{ fontSize: '0.9rem', color: '#92400e', lineHeight: '1.6' }}>
                                <strong>Note:</strong> Clicking "Mark as Resolved" will add a resolution timestamp to this issue log.
                                The employee will be able to see that the issue has been acknowledged and resolved.
                            </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                onClick={() => { setShowIssueModal(false); setTaskWithIssue(null); }}
                                disabled={resolvingIssue}
                                style={{ padding: '12px 24px', borderRadius: '10px', backgroundColor: 'var(--background)', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Close
                            </button>
                            <button
                                onClick={resolveIssue}
                                disabled={resolvingIssue}
                                style={{
                                    padding: '12px 24px',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
                                }}
                            >
                                <CheckCircle size={16} />
                                {resolvingIssue ? 'Resolving...' : 'Mark as Resolved'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManagerTaskDashboard;
