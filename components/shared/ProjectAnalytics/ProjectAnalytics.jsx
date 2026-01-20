import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
    ArrowLeft,
    TrendingUp,
    TrendingDown,
    Users,
    Calendar,
    DollarSign,
    AlertTriangle,
    Plus,
    Filter,
    Search,
    X
} from 'lucide-react';

// ================================
// PROJECT ANALYTICS - Main Component
// ================================
const ProjectAnalytics = ({ userRole = 'manager', dashboardPrefix = '/manager-dashboard' }) => {
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('financials');
    const [showFinancialModal, setShowFinancialModal] = useState(false);
    const [savingFinancial, setSavingFinancial] = useState(false);
    const [financialForm, setFinancialForm] = useState({
        period_label: '',
        period_start: '',
        period_end: '',
        revenue: '',
        salary_cost: '',
        other_costs: ''
    });

    const isExecutive = userRole.toLowerCase() === 'executive';

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            setLoading(true);

            // Try fetching with all analytics columns first
            let { data, error } = await supabase
                .from('projects')
                .select(`
                    id,
                    name,
                    description,
                    status,
                    start_date,
                    end_date,
                    total_budget,
                    total_revenue,
                    total_cost,
                    owner_id
                `)
                .order('name');

            // If error (likely missing columns), fallback to basic query
            if (error) {
                console.warn('Full query failed, trying basic query:', error.message);
                const basicResult = await supabase
                    .from('projects')
                    .select('id, name')
                    .order('name');

                data = basicResult.data;
                error = basicResult.error;

                if (error) throw error;
            }

            // Fetch member counts and owner names for each project
            const projectsWithMembers = await Promise.all(
                (data || []).map(async (project) => {
                    // Get member count from project_members table (members are linked via project_id)
                    const { count } = await supabase
                        .from('project_members')
                        .select('*', { count: 'exact', head: true })
                        .eq('project_id', project.id);

                    // Get owner name if owner_id exists
                    let managerName = 'Unassigned';
                    if (project.owner_id) {
                        const { data: ownerData } = await supabase
                            .from('profiles')
                            .select('full_name')
                            .eq('id', project.owner_id)
                            .single();
                        managerName = ownerData?.full_name || 'Unassigned';
                    }

                    return {
                        ...project,
                        name: project.name,
                        description: project.description || '',
                        status: project.status || 'active',
                        start_date: project.start_date || null,
                        end_date: project.end_date || null,
                        total_budget: project.total_budget || 0,
                        total_revenue: project.total_revenue || 0,
                        total_cost: project.total_cost || 0,
                        manager_name: managerName,
                        member_count: count || 0,
                        net_profit: (project.total_revenue || 0) - (project.total_cost || 0)
                    };
                })
            );

            setProjects(projectsWithMembers);
            setError(null);
        } catch (err) {
            console.error('Error fetching projects:', err);
            setError(err.message || 'Failed to load projects');
            setProjects([]);
        } finally {
            setLoading(false);
        }
    };

    const filteredProjects = projects.filter(project => {
        const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
        const matchesSearch = project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            project.description?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'active': return { bg: '#dcfce7', text: '#16a34a' };
            case 'completed': return { bg: '#dbeafe', text: '#2563eb' };
            case 'on_hold': return { bg: '#fef3c7', text: '#d97706' };
            case 'cancelled': return { bg: '#fee2e2', text: '#dc2626' };
            default: return { bg: '#f1f5f9', text: '#64748b' };
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    // Save financial entry
    const saveFinancialEntry = async () => {
        if (!selectedProject || !financialForm.period_start || !financialForm.period_end) {
            alert('Please fill in required fields (dates)');
            return;
        }

        setSavingFinancial(true);
        try {
            const { error } = await supabase
                .from('team_financials')
                .insert({
                    team_id: selectedProject.id,
                    period_type: 'monthly',
                    period_label: financialForm.period_label || null,
                    period_start: financialForm.period_start,
                    period_end: financialForm.period_end,
                    revenue: parseFloat(financialForm.revenue) || 0,
                    salary_cost: parseFloat(financialForm.salary_cost) || 0,
                    other_costs: parseFloat(financialForm.other_costs) || 0
                });

            if (error) throw error;

            // Update team totals
            const newRevenue = parseFloat(financialForm.revenue) || 0;
            const newCost = parseFloat(financialForm.salary_cost) + parseFloat(financialForm.other_costs) || 0;

            await supabase
                .from('projects')
                .update({
                    total_revenue: (selectedProject.total_revenue || 0) + newRevenue,
                    total_cost: (selectedProject.total_cost || 0) + newCost,
                    updated_at: new Date().toISOString()
                })
                .eq('id', selectedProject.id);

            // Reset form and close modal
            setFinancialForm({
                period_label: '',
                period_start: '',
                period_end: '',
                revenue: '',
                salary_cost: '',
                other_costs: ''
            });
            setShowFinancialModal(false);

            // Refresh data
            fetchProjects();
            // Trigger detail refresh by resetting selected project
            const updatedProject = {
                ...selectedProject,
                total_revenue: (selectedProject.total_revenue || 0) + newRevenue,
                total_cost: (selectedProject.total_cost || 0) + newCost
            };
            setSelectedProject(updatedProject);
        } catch (error) {
            console.error('Error saving financial entry:', error);
            alert('Error saving financial entry: ' + error.message);
        } finally {
            setSavingFinancial(false);
        }
    };

    // ================================
    // Project List View
    // ================================
    const ProjectListView = () => (
        <div>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px'
            }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                        Project Analytics
                    </h1>
                    <p style={{ color: '#64748b', marginTop: '4px' }}>
                        Financial performance and resource allocation overview
                    </p>
                </div>
                {isExecutive && (
                    <button style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}>
                        <Plus size={18} />
                        Add Project
                    </button>
                )}
            </div>

            {/* Filters */}
            <div style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '24px',
                flexWrap: 'wrap'
            }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search size={18} style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#94a3b8'
                    }} />
                    <input
                        type="text"
                        placeholder="Search projects..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 10px 10px 40px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '0.9rem'
                        }}
                    />
                </div>

                {/* Status Filter */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    {['all', 'active', 'completed', 'on_hold'].map(status => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '20px',
                                border: 'none',
                                backgroundColor: statusFilter === status ? '#2563eb' : '#f1f5f9',
                                color: statusFilter === status ? 'white' : '#64748b',
                                fontWeight: 500,
                                cursor: 'pointer',
                                textTransform: 'capitalize'
                            }}
                        >
                            {status === 'all' ? 'All' : status.replace('_', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Project Cards Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    Loading projects...
                </div>
            ) : filteredProjects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    No projects found
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '20px'
                }}>
                    {filteredProjects.map(project => {
                        const statusStyle = getStatusColor(project.status);
                        const isProfitable = project.net_profit >= 0;

                        return (
                            <div
                                key={project.id}
                                onClick={() => setSelectedProject(project)}
                                style={{
                                    backgroundColor: 'white',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    border: '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#2563eb';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.15)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                                }}
                            >
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                                            {project.name}
                                        </h3>
                                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                                            {project.manager_name}
                                        </p>
                                    </div>
                                    <span style={{
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        backgroundColor: statusStyle.bg,
                                        color: statusStyle.text,
                                        textTransform: 'capitalize'
                                    }}>
                                        {(project.status || 'active').replace('_', ' ')}
                                    </span>
                                </div>

                                {/* Duration */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#64748b', fontSize: '0.85rem' }}>
                                    <Calendar size={14} />
                                    <span>
                                        {project.start_date
                                            ? new Date(project.start_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                                            : 'Not set'
                                        }
                                        {project.end_date && ` → ${new Date(project.end_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`}
                                    </span>
                                </div>

                                {/* Financial Summary */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '12px',
                                    padding: '12px',
                                    backgroundColor: '#f8fafc',
                                    borderRadius: '8px',
                                    marginBottom: '12px'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Revenue</div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#16a34a' }}>
                                            {formatCurrency(project.total_revenue)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Cost</div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#dc2626' }}>
                                            {formatCurrency(project.total_cost)}
                                        </div>
                                    </div>
                                </div>

                                {/* Profit/Loss & Team */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {isProfitable ? <TrendingUp size={16} color="#16a34a" /> : <TrendingDown size={16} color="#dc2626" />}
                                        <span style={{ fontWeight: 'bold', color: isProfitable ? '#16a34a' : '#dc2626' }}>
                                            {formatCurrency(Math.abs(project.net_profit))}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            {isProfitable ? 'profit' : 'loss'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
                                        <Users size={14} />
                                        <span style={{ fontSize: '0.85rem' }}>{project.member_count} members</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    // ================================
    // Project Detail View
    // ================================
    const ProjectDetailView = () => {
        const [teamMembers, setTeamMembers] = useState([]);
        const [financials, setFinancials] = useState([]);
        const [loadingDetails, setLoadingDetails] = useState(true);

        useEffect(() => {
            if (selectedProject) {
                fetchProjectDetails();
            }
        }, [selectedProject]);

        const fetchProjectDetails = async () => {
            setLoadingDetails(true);
            try {
                // Fetch project members from project_members table joined with profiles
                const { data: memberAssignments, error: memberError } = await supabase
                    .from('project_members')
                    .select(`
                        id,
                        user_id,
                        role,
                        joined_at,
                        profiles:user_id(id, full_name, email, role)
                    `)
                    .eq('project_id', selectedProject.id);

                // Debug: Log query results
                console.log('Project members query result:', { memberAssignments, memberError });

                if (memberError) {
                    console.error('Error fetching project members:', memberError);
                }

                // Map assignments to expected member format
                const members = (memberAssignments || []).map(assignment => ({
                    id: assignment.id,
                    profile_id: assignment.user_id,
                    assignment_start: assignment.joined_at || selectedProject.start_date || new Date().toISOString().split('T')[0],
                    assignment_end: null, // Ongoing
                    role_in_project: assignment.role?.toLowerCase() || 'other',
                    profiles: assignment.profiles
                }));

                console.log('Mapped members:', members);
                setTeamMembers(members);

                // Fetch financials (may not exist if SQL hasn't been run)
                try {
                    const { data: fins, error: finsError } = await supabase
                        .from('team_financials')
                        .select('*')
                        .eq('team_id', selectedProject.id)
                        .order('period_start');

                    if (!finsError) {
                        setFinancials(fins || []);
                    } else {
                        console.warn('team_financials table not found:', finsError.message);
                        setFinancials([]);
                    }
                } catch (e) {
                    console.warn('Could not fetch financials:', e);
                    setFinancials([]);
                }
            } catch (error) {
                console.error('Error fetching project details:', error);
            } finally {
                setLoadingDetails(false);
            }
        };

        const statusStyle = getStatusColor(selectedProject?.status);

        return (
            <div>
                {/* Header */}
                <div style={{ marginBottom: '24px' }}>
                    <button
                        onClick={() => setSelectedProject(null)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            marginBottom: '12px',
                            fontSize: '0.9rem'
                        }}
                    >
                        <ArrowLeft size={16} />
                        Back to Projects
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                                {selectedProject?.name}
                            </h1>
                            <p style={{ color: '#64748b', marginTop: '4px' }}>
                                Mentored by {selectedProject?.manager_name}
                            </p>
                        </div>
                        <span style={{
                            padding: '6px 14px',
                            borderRadius: '16px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.text,
                            textTransform: 'capitalize'
                        }}>
                            {(selectedProject?.status || 'active').replace('_', ' ')}
                        </span>
                    </div>
                </div>

                {/* Summary Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                    marginBottom: '24px'
                }}>
                    {[
                        { label: 'Total Revenue', value: formatCurrency(selectedProject?.total_revenue), color: '#16a34a', icon: DollarSign },
                        { label: 'Total Cost', value: formatCurrency(selectedProject?.total_cost), color: '#dc2626', icon: DollarSign },
                        { label: 'Net Profit', value: formatCurrency(selectedProject?.net_profit), color: selectedProject?.net_profit >= 0 ? '#16a34a' : '#dc2626', icon: selectedProject?.net_profit >= 0 ? TrendingUp : TrendingDown },
                        { label: 'Team Members', value: teamMembers.length, color: '#2563eb', icon: Users }
                    ].map((stat, i) => (
                        <div key={i} style={{
                            backgroundColor: 'white',
                            padding: '20px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <stat.icon size={18} color={stat.color} />
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{stat.label}</span>
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stat.color }}>
                                {stat.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
                    {[
                        { id: 'financials', label: 'Financials' },
                        { id: 'team', label: 'Team & Resources' },
                        { id: 'timeline', label: 'Timeline' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '12px 24px',
                                border: 'none',
                                background: 'none',
                                fontSize: '0.95rem',
                                fontWeight: activeTab === tab.id ? 600 : 400,
                                color: activeTab === tab.id ? '#2563eb' : '#64748b',
                                borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                                marginBottom: '-2px',
                                cursor: 'pointer'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {loadingDetails ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        Loading details...
                    </div>
                ) : (
                    <>
                        {activeTab === 'financials' && <FinancialsTab financials={financials} />}
                        {activeTab === 'team' && <TeamTab members={teamMembers} isExecutive={isExecutive} />}
                        {activeTab === 'timeline' && <TimelineTab project={selectedProject} members={teamMembers} />}
                    </>
                )}
            </div>
        );
    };

    // ================================
    // Financials Tab
    // ================================
    const FinancialsTab = ({ financials }) => {
        if (financials.length === 0) {
            return (
                <div style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '12px',
                    color: '#64748b'
                }}>
                    <DollarSign size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p style={{ margin: 0 }}>No financial data recorded yet</p>
                    {isExecutive && (
                        <button
                            onClick={() => setShowFinancialModal(true)}
                            style={{
                                marginTop: '16px',
                                padding: '10px 20px',
                                backgroundColor: '#2563eb',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            Add Financial Entry
                        </button>
                    )}
                </div>
            );
        }

        return (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f8fafc' }}>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>Period</th>
                            <th style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>Revenue</th>
                            <th style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>Salary Cost</th>
                            <th style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>Other Costs</th>
                            <th style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>Net Profit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {financials.map((fin, i) => (
                            <tr key={fin.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                                    {fin.period_label || new Date(fin.period_start).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                </td>
                                <td style={{ padding: '14px 16px', textAlign: 'right', color: '#16a34a' }}>
                                    {formatCurrency(fin.revenue)}
                                </td>
                                <td style={{ padding: '14px 16px', textAlign: 'right', color: '#dc2626' }}>
                                    {formatCurrency(fin.salary_cost)}
                                </td>
                                <td style={{ padding: '14px 16px', textAlign: 'right', color: '#d97706' }}>
                                    {formatCurrency(fin.other_costs)}
                                </td>
                                <td style={{
                                    padding: '14px 16px',
                                    textAlign: 'right',
                                    fontWeight: 600,
                                    color: fin.net_profit >= 0 ? '#16a34a' : '#dc2626'
                                }}>
                                    {formatCurrency(fin.net_profit)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // ================================
    // Team Tab
    // ================================
    const TeamTab = ({ members, isExecutive }) => {
        const hasAtRiskMembers = members.some(m => m.profiles?.employment_status === 'notice_period');

        return (
            <div>
                {hasAtRiskMembers && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '16px',
                        backgroundColor: '#fef2f2',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        border: '1px solid #fecaca'
                    }}>
                        <AlertTriangle size={20} color="#dc2626" />
                        <span style={{ color: '#dc2626', fontWeight: 500 }}>
                            Some team members are on notice period - resource gaps may occur
                        </span>
                    </div>
                )}

                <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc' }}>
                                <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>Name</th>
                                <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>Role</th>
                                <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>Assignment Period</th>
                                <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.length === 0 ? (
                                <tr>
                                    <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        No team members assigned
                                    </td>
                                </tr>
                            ) : (
                                members.map((member) => {
                                    const isOnNotice = member.profiles?.employment_status === 'notice_period';
                                    return (
                                        <tr key={member.id} style={{
                                            borderTop: '1px solid #e2e8f0',
                                            backgroundColor: isOnNotice ? '#fef2f2' : 'transparent'
                                        }}>
                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ fontWeight: 500 }}>{member.profiles?.full_name}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{member.profiles?.email}</div>
                                            </td>
                                            <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>
                                                {(member.role_in_project || 'other').replace('_', ' ')}
                                            </td>
                                            <td style={{ padding: '14px 16px', fontSize: '0.9rem', color: '#64748b' }}>
                                                {new Date(member.assignment_start).toLocaleDateString('en-IN', {
                                                    day: 'numeric', month: 'short', year: 'numeric'
                                                })}
                                                {member.assignment_end && ` → ${new Date(member.assignment_end).toLocaleDateString('en-IN', {
                                                    day: 'numeric', month: 'short', year: 'numeric'
                                                })}`}
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                {isOnNotice ? (
                                                    <div>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '4px 10px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            backgroundColor: '#dc2626',
                                                            color: 'white'
                                                        }}>
                                                            <AlertTriangle size={12} />
                                                            Notice Period
                                                        </span>
                                                        {member.profiles?.last_working_day && (
                                                            <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px' }}>
                                                                Last day: {new Date(member.profiles.last_working_day).toLocaleDateString('en-IN')}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        backgroundColor: '#dcfce7',
                                                        color: '#16a34a'
                                                    }}>
                                                        Active
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // ================================
    // Timeline Tab (Gantt-style)
    // ================================
    const TimelineTab = ({ project, members }) => {
        // Group members by role
        const roleGroups = members.reduce((acc, member) => {
            const role = member.role_in_project || 'other';
            if (!acc[role]) acc[role] = [];
            acc[role].push(member);
            return acc;
        }, {});

        const projectStart = project?.start_date ? new Date(project.start_date) : new Date();
        // Always show exactly 6 months from current date for timeline
        const now = new Date();
        const timelineStart = new Date(now.getFullYear(), now.getMonth(), 1); // Start of current month
        const timelineEnd = new Date(now.getFullYear(), now.getMonth() + 6, 0); // End of 6th month

        // Generate exactly 6 months array
        const months = [];
        let current = new Date(timelineStart);
        for (let i = 0; i < 6; i++) {
            months.push(new Date(current));
            current.setMonth(current.getMonth() + 1);
        }

        // Use timeline end for project calculations
        const projectEnd = timelineEnd;

        const getBarStyle = (member, monthStart, monthEnd) => {
            const assignStart = new Date(member.assignment_start);
            const lastWorkingDay = member.profiles?.last_working_day
                ? new Date(member.profiles.last_working_day)
                : null;
            const assignEnd = member.assignment_end
                ? new Date(member.assignment_end)
                : projectEnd;

            const isOnNotice = member.profiles?.employment_status === 'notice_period';
            const effectiveEnd = isOnNotice && lastWorkingDay ? lastWorkingDay : assignEnd;

            // Check if this month is within assignment
            if (monthEnd < assignStart || monthStart > effectiveEnd) {
                // Check if this is a gap period (after last working day but before original assignment end)
                if (isOnNotice && lastWorkingDay && monthStart > lastWorkingDay && monthStart <= assignEnd) {
                    return { type: 'gap', color: '#ef4444' }; // Red for gap
                }
                return { type: 'empty' };
            }

            return { type: 'allocated', color: '#10b981' }; // Green for allocated
        };

        if (members.length === 0) {
            return (
                <div style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '12px',
                    color: '#64748b'
                }}>
                    <Calendar size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p style={{ margin: 0 }}>No team members to display timeline</p>
                </div>
            );
        }

        return (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
                {/* Legend */}
                <div style={{
                    display: 'flex',
                    gap: '24px',
                    padding: '16px',
                    borderBottom: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '16px', height: '16px', backgroundColor: '#10b981', borderRadius: '4px' }}></div>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Allocated</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '16px', height: '16px', backgroundColor: '#ef4444', borderRadius: '4px' }}></div>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Resource Gap</span>
                    </div>
                </div>

                <div style={{ minWidth: `${150 + months.length * 80}px`, padding: '20px' }}>
                    {/* Header - Months */}
                    <div style={{ display: 'flex', marginBottom: '8px' }}>
                        <div style={{ width: '150px', flexShrink: 0 }}></div>
                        {months.map((month, i) => (
                            <div key={i} style={{
                                width: '80px',
                                textAlign: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#64748b'
                            }}>
                                {month.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                            </div>
                        ))}
                    </div>

                    {/* Rows by Role */}
                    {Object.entries(roleGroups).map(([role, roleMembers]) => (
                        <div key={role}>
                            {/* Role Header */}
                            <div style={{
                                backgroundColor: '#f1f5f9',
                                padding: '8px 12px',
                                marginTop: '12px',
                                marginBottom: '4px',
                                borderRadius: '4px',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                textTransform: 'capitalize',
                                color: '#475569'
                            }}>
                                {role.replace('_', ' ')}
                            </div>

                            {/* Member Rows */}
                            {roleMembers.map(member => (
                                <div key={member.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{
                                        width: '150px',
                                        flexShrink: 0,
                                        fontSize: '0.85rem',
                                        padding: '8px 0',
                                        paddingLeft: '12px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {member.profiles?.full_name}
                                    </div>
                                    {months.map((month, i) => {
                                        const monthStart = new Date(month);
                                        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
                                        const barStyle = getBarStyle(member, monthStart, monthEnd);

                                        return (
                                            <div key={i} style={{
                                                width: '80px',
                                                height: '32px',
                                                padding: '4px 2px'
                                            }}>
                                                {barStyle.type !== 'empty' && (
                                                    <div style={{
                                                        height: '100%',
                                                        backgroundColor: barStyle.color,
                                                        borderRadius: '4px',
                                                        opacity: barStyle.type === 'gap' ? 0.7 : 1,
                                                        backgroundImage: barStyle.type === 'gap'
                                                            ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.3) 4px, rgba(255,255,255,0.3) 8px)'
                                                            : 'none'
                                                    }}></div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // ================================
    // Main Render
    // ================================

    // Show error state if there's an error
    if (error && !loading) {
        return (
            <div style={{ padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
                <div style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '12px',
                    padding: '24px',
                    textAlign: 'center',
                    maxWidth: '600px',
                    margin: '40px auto'
                }}>
                    <h2 style={{ color: '#dc2626', marginBottom: '12px' }}>Unable to Load Projects</h2>
                    <p style={{ color: '#991b1b', marginBottom: '16px' }}>{error}</p>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '20px' }}>
                        If you haven't run the database migration yet, please execute the SQL in
                        <code style={{ backgroundColor: '#fee2e2', padding: '2px 6px', borderRadius: '4px' }}>
                            database/project_analytics_setup.sql
                        </code> in your Supabase SQL Editor.
                    </p>
                    <button
                        onClick={() => { setError(null); setLoading(true); fetchProjects(); }}
                        style={{
                            padding: '10px 24px',
                            backgroundColor: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
            {selectedProject ? <ProjectDetailView /> : <ProjectListView />}

            {/* Add Financial Entry Modal */}
            {showFinancialModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        width: '100%',
                        maxWidth: '500px',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.2)'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '20px',
                            borderBottom: '1px solid #e2e8f0'
                        }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>
                                Add Financial Entry
                            </h2>
                            <button
                                onClick={() => setShowFinancialModal(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#64748b'
                                }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '20px' }}>
                            <p style={{ color: '#64748b', marginBottom: '20px' }}>
                                Project: <strong>{selectedProject?.name}</strong>
                            </p>

                            {/* Period Label */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.9rem' }}>
                                    Period Label (optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g., January 2025, Q1 2025"
                                    value={financialForm.period_label}
                                    onChange={(e) => setFinancialForm({ ...financialForm, period_label: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>

                            {/* Date Range */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.9rem' }}>
                                        Period Start *
                                    </label>
                                    <input
                                        type="date"
                                        value={financialForm.period_start}
                                        onChange={(e) => setFinancialForm({ ...financialForm, period_start: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            fontSize: '0.9rem'
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.9rem' }}>
                                        Period End *
                                    </label>
                                    <input
                                        type="date"
                                        value={financialForm.period_end}
                                        onChange={(e) => setFinancialForm({ ...financialForm, period_end: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            fontSize: '0.9rem'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Revenue */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.9rem' }}>
                                    Revenue (₹)
                                </label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={financialForm.revenue}
                                    onChange={(e) => setFinancialForm({ ...financialForm, revenue: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>

                            {/* Costs */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.9rem' }}>
                                        Salary Cost (₹)
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={financialForm.salary_cost}
                                        onChange={(e) => setFinancialForm({ ...financialForm, salary_cost: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            fontSize: '0.9rem'
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.9rem' }}>
                                        Other Costs (₹)
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={financialForm.other_costs}
                                        onChange={(e) => setFinancialForm({ ...financialForm, other_costs: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            fontSize: '0.9rem'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Net Preview */}
                            <div style={{
                                padding: '12px',
                                backgroundColor: '#f8fafc',
                                borderRadius: '8px',
                                marginBottom: '20px',
                                textAlign: 'center'
                            }}>
                                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Net Profit: </span>
                                <span style={{
                                    fontWeight: 'bold',
                                    color: (parseFloat(financialForm.revenue) || 0) - ((parseFloat(financialForm.salary_cost) || 0) + (parseFloat(financialForm.other_costs) || 0)) >= 0 ? '#16a34a' : '#dc2626'
                                }}>
                                    {formatCurrency((parseFloat(financialForm.revenue) || 0) - ((parseFloat(financialForm.salary_cost) || 0) + (parseFloat(financialForm.other_costs) || 0)))}
                                </span>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => setShowFinancialModal(false)}
                                    style={{
                                        padding: '10px 20px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        backgroundColor: 'white',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveFinancialEntry}
                                    disabled={savingFinancial}
                                    style={{
                                        padding: '10px 20px',
                                        backgroundColor: savingFinancial ? '#94a3b8' : '#2563eb',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: savingFinancial ? 'not-allowed' : 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    {savingFinancial ? 'Saving...' : 'Save Entry'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectAnalytics;
