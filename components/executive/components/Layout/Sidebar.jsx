import React, { useState } from 'react';
import {
    LayoutDashboard,
    BarChart2,
    Users,
    ListTodo,
    CalendarOff,
    Receipt,
    DollarSign,
    FileText,
    FileCheck,
    Briefcase,
    Network,
    Settings,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    LogOut,
    UserCheck,
    Megaphone,
    MessageCircle,
    FolderOpen,
    TrendingUp,
    Building2,
    FolderKanban,
    Ticket,
    ClipboardList
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMessages } from '../../../shared/context/MessageContext';
import { useUser } from '../../context/UserContext';

const Sidebar = ({ isCollapsed, toggleSidebar, onMouseEnter, onMouseLeave }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { unreadCount } = useMessages();
    const { orgName, loading } = useUser();

    const [expandedMenus, setExpandedMenus] = useState({
        organization: true,
        project: true
    });

    const toggleMenu = (label) => {
        if (isCollapsed) return;
        setExpandedMenus(prev => ({
            ...prev,
            [label]: !prev[label]
        }));
    };

    // Organization-level menu items (Org Manager stuff)
    const orgMenuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/executive-dashboard/dashboard' },
        { icon: Users, label: 'Students', path: '/executive-dashboard/students' },
        { icon: UserCheck, label: 'Student Status', path: '/executive-dashboard/student-status' },
        { icon: CalendarOff, label: 'Leave Requests', path: '/executive-dashboard/leaves' },
        { icon: DollarSign, label: 'Payroll', path: '/executive-dashboard/payroll' },
        { icon: Receipt, label: 'Payslips', path: '/executive-dashboard/payslips' },
        { icon: FileText, label: 'Invoice', path: '/executive-dashboard/invoice' },
        { icon: Briefcase, label: 'Hiring Portal', path: '/executive-dashboard/hiring' },
        { icon: Network, label: 'Org Hierarchy', path: '/executive-dashboard/hierarchy' },
        { icon: Megaphone, label: 'Announcements', path: '/executive-dashboard/announcements' },
        { icon: MessageCircle, label: 'Messages', path: '/executive-dashboard/messages' },
        { icon: FileCheck, label: 'Policies', path: '/executive-dashboard/policies' },
        { icon: Ticket, label: 'Raise a Ticket', path: '/executive-dashboard/raise-ticket' },
        { icon: ClipboardList, label: 'Student Review', path: '/executive-dashboard/student-review' },
    ];

    const projectMenuItems = [
        { icon: FolderOpen, label: 'Projects', path: '/executive-dashboard/projects' },
        { icon: ListTodo, label: 'Tasks', path: '/executive-dashboard/tasks' },
        { icon: BarChart2, label: 'Analytics', path: '/executive-dashboard/analytics' },
        { icon: TrendingUp, label: 'Project Analytics', path: '/executive-dashboard/project-analytics' },
        { icon: Network, label: 'Project Hierarchy', path: '/executive-dashboard/project-hierarchy' },
        { icon: FileText, label: 'Project Documents', path: '/executive-dashboard/documents' },
    ];

    // Filter for Cohort Organization
    let finalOrgMenuItems = orgMenuItems;
    let finalProjectMenuItems = projectMenuItems;

    if (orgName?.trim() === 'Cohort') {
        const allowedOrg = ['Dashboard', 'Announcements', 'Org Hierarchy', 'Messages', 'Students', 'Student Review'];
        finalOrgMenuItems = orgMenuItems.filter(item => allowedOrg.includes(item.label));

        // Rename 'Students' to 'All Members' explicitly for this view
        finalOrgMenuItems = finalOrgMenuItems.map(item =>
            item.label === 'Students' ? { ...item, label: 'All Members' } : item
        );

        // For Project Section in Cohort: Projects, Tasks, Analytics, Proj Hierarchy
        // Removed 'Employees'/'All Teams & Members' from here as per user request
        finalProjectMenuItems = [
            projectMenuItems.find(i => i.label === 'Projects'),
            projectMenuItems.find(i => i.label === 'Tasks'), // All Team Tasks
            projectMenuItems.find(i => i.label === 'Analytics'), // All Team Analytics
            projectMenuItems.find(i => i.label === 'Project Hierarchy'),
            projectMenuItems.find(i => i.label === 'Project Documents')
        ].filter(Boolean);
    }

    // Menu item renderer
    const renderMenuItem = (item, index, keyPrefix) => {
        const isActive = location.pathname === item.path;
        return (
            <button
                key={`${keyPrefix}-${index}`}
                onClick={() => navigate(item.path)}
                title={isCollapsed ? item.label : ''}
                style={{
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
                {item.label === 'Messages' && unreadCount > 0 && (
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
            {loading ? (
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
                        {renderSectionHeader(FolderKanban, 'Project', 'project')}
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
                    </nav>

                    {/* Logout */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px', marginTop: '12px' }}>
                        <button
                            onClick={() => navigate('/executive-dashboard/settings')}
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
                                background: location.pathname === '/executive-dashboard/settings' ? '#7C3AED' : 'transparent',
                                color: location.pathname === '/executive-dashboard/settings' ? 'white' : 'rgba(255,255,255,0.7)',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                marginBottom: '8px'
                            }}
                            onMouseEnter={(e) => {
                                if (location.pathname !== '/executive-dashboard/settings') {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                    e.currentTarget.style.color = 'white';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (location.pathname !== '/executive-dashboard/settings') {
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
        </aside >
    );
};

export default Sidebar;
