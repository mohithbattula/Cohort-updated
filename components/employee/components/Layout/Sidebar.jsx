import React, { useState } from 'react';
import {
    LayoutDashboard,
    BarChart2,
    Users,
    ListTodo,
    CalendarOff,
    Receipt,
    FileText,
    Network,
    Settings,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    LogOut,
    UserCheck,
    Megaphone,
    MessageCircle,
    Building2,
    FolderKanban,
    Check,
    ClipboardCheck,
    TrendingUp,
    Ticket,
    Star
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext';
import { useMessages } from '../../../shared/context/MessageContext';
import { useUser } from '../../context/UserContext';

const Sidebar = ({ isCollapsed, toggleSidebar, onMouseEnter, onMouseLeave }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentProject, setCurrentProject, userProjects, projectRole, loading: projectLoading } = useProject();
    const { unreadCount } = useMessages();
    const { orgName, loading: userLoading } = useUser();

    const [expandedMenus, setExpandedMenus] = useState({
        organization: true,
        project: true
    });
    const [showProjectPicker, setShowProjectPicker] = useState(false);

    const toggleMenu = (label) => {
        if (isCollapsed) return;
        setExpandedMenus(prev => ({
            ...prev,
            [label]: !prev[label]
        }));
    };

    // Organization-level menu items (same for all roles)
    const orgMenuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/student-dashboard/dashboard' },
        { icon: UserCheck, label: 'My Attendance', path: '/student-dashboard/team-status' },
        { icon: CalendarOff, label: 'Leaves', path: '/student-dashboard/leaves' },
        { icon: Receipt, label: 'Payslip', path: '/student-dashboard/payslips' },
        { icon: FileText, label: 'Policies', path: '/student-dashboard/policies' },
        { icon: Megaphone, label: 'Announcements', path: '/student-dashboard/announcements' },
        { icon: MessageCircle, label: 'Messages', path: '/student-dashboard/messages' },
        { icon: Network, label: 'Org Hierarchy', path: '/student-dashboard/org-hierarchy' },
        { icon: Ticket, label: 'Raise a Ticket', path: '/student-dashboard/raise-ticket' },
    ];

    // Role-based project menu configurations
    const projectMenusByRole = {
        consultant: [
            { icon: FileText, label: 'Project Documents', path: '/student-dashboard/documents' },
            { icon: Users, label: 'Team Members', path: '/student-dashboard/team-members' },
            { icon: ListTodo, label: 'My Tasks', path: '/student-dashboard/my-tasks' },
            { icon: BarChart2, label: 'Analytics', path: '/student-dashboard/analytics' },
            { icon: Network, label: 'Hierarchy', path: '/student-dashboard/project-hierarchy' },
            { icon: Star, label: 'My Review', path: '/student-dashboard/my-review' },
        ],
        employee: [
            { icon: FileText, label: 'Project Documents', path: '/student-dashboard/documents' },
            { icon: Users, label: 'Team Members', path: '/student-dashboard/team-members' },
            { icon: ListTodo, label: 'My Tasks', path: '/student-dashboard/my-tasks' },
            { icon: BarChart2, label: 'Analytics', path: '/student-dashboard/analytics' },
            { icon: Network, label: 'Hierarchy', path: '/student-dashboard/project-hierarchy' },
            { icon: Star, label: 'My Review', path: '/student-dashboard/my-review' },
        ],
        team_lead: [
            { icon: FileText, label: 'Project Documents', path: '/student-dashboard/documents' },
            { icon: Users, label: 'Team Members', path: '/student-dashboard/team-members' },
            { icon: ClipboardCheck, label: 'My Tasks', path: '/student-dashboard/my-tasks' },
            { icon: ListTodo, label: 'Team Tasks', path: '/student-dashboard/team-tasks' },
            { icon: TrendingUp, label: 'Performance', path: '/student-dashboard/performance' },
            { icon: BarChart2, label: 'Analytics', path: '/student-dashboard/analytics' },
            { icon: Network, label: 'Hierarchy', path: '/student-dashboard/project-hierarchy' },
            { icon: Star, label: 'My Review', path: '/student-dashboard/my-review' },
        ],
        manager: [
            { icon: FileText, label: 'Project Documents', path: '/student-dashboard/documents' },
            { icon: Users, label: 'Team Members', path: '/student-dashboard/team-members' },
            { icon: ClipboardCheck, label: 'My Tasks', path: '/student-dashboard/my-tasks' },
            { icon: ListTodo, label: 'Team Tasks', path: '/student-dashboard/team-tasks' },
            { icon: TrendingUp, label: 'Performance', path: '/student-dashboard/performance' },
            { icon: BarChart2, label: 'Analytics', path: '/student-dashboard/analytics' },
            { icon: Network, label: 'Hierarchy', path: '/student-dashboard/project-hierarchy' },
            { icon: Star, label: 'My Review', path: '/student-dashboard/my-review' },
        ]
    };

    // Get menu items based on current project role
    const projectMenuItems = projectMenusByRole[projectRole] || projectMenusByRole.consultant;

    // Filter for Cohort Organization
    let finalOrgMenuItems = orgMenuItems;
    let finalProjectMenuItems = projectMenuItems;

    if (orgName?.trim() === 'Cohort') {
        const excluded = ['Leaves', 'Payslip', 'Policies', 'My Attendance', 'Raise a Ticket'];
        finalOrgMenuItems = orgMenuItems.filter(item => !excluded.includes(item.label));
        // Project items for Employee match the request, so no filtering needed, 
        // but we'll assign it to ensure consistency if we wanted to filter later.
        finalProjectMenuItems = projectMenuItems;
    }

    // Role badge colors
    const getRoleBadge = (role) => {
        switch (role) {
            case 'manager': return { color: '#ef4444', label: 'Manager' };
            case 'team_lead': return { color: '#eab308', label: 'Team Lead' };
            default: return { color: '#22c55e', label: 'Consultant' };
        }
    };

    // Menu item renderer
    const renderMenuItem = (item, index, keyPrefix) => {
        const isActive = location.pathname === item.path;

        // Debug: Log unreadCount for Messages
        if (item.label === 'Messages') {
            console.log('🔴 Sidebar Messages - unreadCount:', unreadCount);
        }

        return (
            <button
                key={`${keyPrefix}-${index}`}
                onClick={() => navigate(item.path)}
                title={isCollapsed ? item.label : ''}
                style={{
                    position: 'relative', // Required for absolute positioned dot
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: isActive ? '#7C3AED' : 'transparent',
                    color: isActive ? 'white' : 'rgba(255,255,255,0.7)',
                    transition: 'all 0.2s ease',
                    width: '100%',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                }}
                onMouseEnter={(e) => {
                    if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                        e.currentTarget.style.color = 'white';
                    }
                }}
                onMouseLeave={(e) => {
                    if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                    }
                }}
            >
                <item.icon size={18} style={{ flexShrink: 0 }} />
                {!isCollapsed && <span>{item.label}</span>}
                {/* Expanded: Show badge with count */}
                {!isCollapsed && item.label === 'Messages' && unreadCount > 0 && (
                    <div style={{
                        marginLeft: 'auto',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '9999px',
                        minWidth: '18px',
                        textAlign: 'center'
                    }}>
                        {unreadCount}
                    </div>
                )}
                {/* Collapsed: Show small red dot */}
                {isCollapsed && item.label === 'Messages' && unreadCount > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        backgroundColor: '#ef4444',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%'
                    }} />
                )}
            </button>
        );
    };

    // Section header (collapsible)
    const renderSectionHeader = (icon, label, sectionKey) => (
        <button
            onClick={() => toggleMenu(sectionKey)}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'space-between',
                width: '100%',
                padding: '8px 12px',
                marginBottom: '4px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'rgba(255,255,255,0.9)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {React.createElement(icon, { size: 14 })}
                {!isCollapsed && <span>{label}</span>}
            </div>
            {!isCollapsed && (
                <ChevronDown
                    size={14}
                    style={{
                        transform: expandedMenus[sectionKey] ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 0.2s'
                    }}
                />
            )}
        </button>
    );

    return (
        <aside
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{
                width: isCollapsed ? '80px' : '280px',
                backgroundColor: '#1a1a2e',
                color: 'white',
                height: '100vh',
                position: 'fixed',
                left: 0,
                top: 0,
                display: 'flex',
                flexDirection: 'column',
                padding: '16px',
                zIndex: 1000,
                transition: 'width 0.3s ease'
            }}>
            {(userLoading || projectLoading) ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', opacity: 0.6 }}>
                    <div className="sidebar-loader" style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'white', borderRadius: '50%', animation: 'sidebar-spin 1s linear infinite' }} />
                    {!isCollapsed && <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Loading...</span>}
                </div>
            ) : (
                <>
                    <style>
                        {`
                    .no-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    .no-scrollbar {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                    @keyframes sidebar-spin {
                        to { transform: rotate(360deg); }
                    }
                `}
                    </style>
                    {/* Logo */}
                    <div style={{
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'space-between',
                        height: '40px'
                    }}>
                        {!isCollapsed && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h1 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Talent Ops</h1>
                            </div>
                        )}
                        <button
                            onClick={toggleSidebar}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer',
                                padding: '6px',
                                borderRadius: '6px',
                                display: 'flex'
                            }}
                        >
                            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                        </button>
                    </div>

                    {/* Scrollable Nav */}
                    <nav style={{
                        maxHeight: 'calc(100vh - 180px)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        paddingRight: '4px',
                        marginBottom: 'auto'
                    }} className="no-scrollbar">
                        {/* Organization Section */}
                        {renderSectionHeader(Building2, orgName === 'Cohort' ? 'Cohort' : 'Organization', 'organization')}
                        {expandedMenus.organization && !isCollapsed && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                                {finalOrgMenuItems.map((item, idx) => renderMenuItem(item, idx, 'org'))}
                            </div>
                        )}
                        {isCollapsed && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                                {finalOrgMenuItems.map((item, idx) => renderMenuItem(item, idx, 'org'))}
                            </div>
                        )}

                        {/* Project Section */}
                        {userProjects.length > 0 && (
                            <>
                                {/* Project Switcher Card */}
                                {!isCollapsed && (
                                    <div style={{
                                        marginBottom: '12px',
                                        position: 'relative'
                                    }}>
                                        <div style={{
                                            fontSize: '0.7rem',
                                            color: '#94a3b8',
                                            marginBottom: '8px',
                                            fontWeight: 600,
                                            paddingLeft: '4px'
                                        }}>
                                            CURRENT PROJECT
                                        </div>
                                        <button
                                            onClick={() => setShowProjectPicker(!showProjectPicker)}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px',
                                                padding: '10px 12px',
                                                color: 'white',
                                                cursor: 'pointer',
                                                fontSize: '0.9rem',
                                                fontWeight: 500,
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    background: getRoleBadge(projectRole).color
                                                }} />
                                                <span>{currentProject?.name || 'Select...'}</span>
                                            </div>
                                            <ChevronDown size={16} style={{ transform: showProjectPicker ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                        </button>

                                        {/* Dropdown */}
                                        {showProjectPicker && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                right: 0,
                                                background: '#2a2a4a',
                                                borderRadius: '8px',
                                                marginTop: '4px',
                                                boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                                                zIndex: 100,
                                                overflow: 'hidden'
                                            }}>
                                                {userProjects.map((project) => (
                                                    <button
                                                        key={project.id}
                                                        onClick={() => {
                                                            setCurrentProject(project.id);
                                                            setShowProjectPicker(false);
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '12px 14px',
                                                            border: 'none',
                                                            background: currentProject?.id === project.id ? 'rgba(139,92,246,0.3)' : 'transparent',
                                                            color: 'white',
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            borderBottom: '1px solid rgba(255,255,255,0.1)'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = currentProject?.id === project.id ? 'rgba(139,92,246,0.3)' : 'transparent'}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <span style={{
                                                                width: '10px',
                                                                height: '10px',
                                                                borderRadius: '50%',
                                                                background: getRoleBadge(project.role).color,
                                                                flexShrink: 0
                                                            }} />
                                                            <div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{project.name}</div>
                                                                <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>{getRoleBadge(project.role).label}</div>
                                                            </div>
                                                        </div>
                                                        {currentProject?.id === project.id && <Check size={16} style={{ color: '#8b5cf6' }} />}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Project Menu Items */}
                                {renderSectionHeader(FolderKanban, currentProject?.name || 'Project', 'project')}
                                {expandedMenus.project && !isCollapsed && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {finalProjectMenuItems.map((item, idx) => renderMenuItem(item, idx, 'proj'))}
                                    </div>
                                )}
                                {isCollapsed && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {finalProjectMenuItems.map((item, idx) => renderMenuItem(item, idx, 'proj'))}
                                    </div>
                                )}
                            </>
                        )}
                    </nav>

                    {/* Logout */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px', marginTop: '12px' }}>
                        <button
                            onClick={() => navigate('/student-dashboard/settings')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                gap: '10px',
                                padding: '12px',
                                borderRadius: '8px',
                                width: '100%',
                                border: 'none',
                                cursor: 'pointer',
                                background: location.pathname === '/student-dashboard/settings' ? '#7C3AED' : 'transparent',
                                color: location.pathname === '/student-dashboard/settings' ? 'white' : 'rgba(255,255,255,0.7)',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                marginBottom: '8px'
                            }}
                            onMouseEnter={(e) => {
                                if (location.pathname !== '/student-dashboard/settings') {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                    e.currentTarget.style.color = 'white';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (location.pathname !== '/student-dashboard/settings') {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                                }
                            }}
                        >
                            <Settings size={18} />
                            {!isCollapsed && <span>Profile</span>}
                        </button>

                        <button
                            onClick={async () => {
                                try {
                                    sessionStorage.setItem('manual_logout', 'true');
                                    await supabase.auth.signOut();
                                } catch (error) {
                                    console.error('Logout error:', error);
                                } finally {
                                    window.location.href = '/login';
                                }
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                gap: '10px',
                                padding: '12px',
                                borderRadius: '8px',
                                width: '100%',
                                border: 'none',
                                cursor: 'pointer',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                                fontWeight: 600,
                                fontSize: '0.9rem'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; e.currentTarget.style.color = '#f87171'; }}
                        >
                            <LogOut size={18} />
                            {!isCollapsed && <span>Logout</span>}
                        </button>
                    </div>
                </>
            )}
        </aside>
    );
};

export default Sidebar;
