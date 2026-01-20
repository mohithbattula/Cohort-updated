import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const HierarchyDemo = () => {
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [hierarchyData, setHierarchyData] = useState({
        executives: [],
        managers: [],
        teamLeads: [],
        employees: []
    });
    const [loading, setLoading] = useState(true);
    const [scale, setScale] = useState(0.8);

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.1, 2));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.25));
    const handleReset = () => setScale(1);

    useEffect(() => {
        fetchHierarchy();
    }, []);

    const fetchHierarchy = async () => {
        try {
            // Fetch all profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('*')
                .neq('is_hidden', true)
                .order('full_name');

            // Fetch project members to identify project-specific roles
            const { data: projectMembers } = await supabase
                .from('project_members')
                .select('user_id, role, project_id');

            if (profiles) {
                const getRole = (p) => p.role ? p.role.toLowerCase().trim() : '';

                // Create a map of users who have project-specific roles
                const projectRoleMap = {};
                if (projectMembers) {
                    projectMembers.forEach(pm => {
                        if (!projectRoleMap[pm.user_id]) {
                            projectRoleMap[pm.user_id] = [];
                        }
                        projectRoleMap[pm.user_id].push({
                            role: pm.role,
                            project_id: pm.project_id
                        });
                    });
                }

                // Filter based on ORGANIZATIONAL role only
                // Exclude users whose organizational role is 'employee' but who are assigned as 'manager' in projects
                const executives = profiles.filter(p => getRole(p) === 'executive');

                // For managers: only show those whose PRIMARY organizational role is 'manager'
                // NOT those who are project managers (employee role + manager in project_members)
                const managers = profiles.filter(p => {
                    const orgRole = getRole(p);
                    return orgRole === 'manager';
                });

                const teamLeads = profiles.filter(p => {
                    const orgRole = getRole(p);
                    return orgRole === 'team_lead' || orgRole === 'consultant';
                });

                // For employees: show those with employee role who are NOT acting as managers in projects
                // OR show all employees (depending on your preference)
                const employees = profiles.filter(p => {
                    const orgRole = getRole(p);
                    return orgRole === 'employee' || orgRole === 'student';
                });

                setHierarchyData({
                    executives,
                    managers,
                    teamLeads,
                    employees
                });
            }
        } catch (error) {
            console.error("Error fetching hierarchy:", error);
        } finally {
            setLoading(false);
        }
    };

    const EmployeeNode = ({ data, color }) => (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s'
            }}
            onClick={() => setSelectedEmployee(data)}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
            <div style={{
                padding: '16px 20px',
                backgroundColor: 'white',
                border: `2px solid ${color}`,
                borderRadius: '12px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                minWidth: '180px',
                textAlign: 'center'
            }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: color,
                    margin: '0 auto 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    color: 'white',
                    overflow: 'hidden'
                }}>
                    {data.avatar_url ? (
                        <img src={data.avatar_url} alt={data.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        data.full_name?.charAt(0) || '?'
                    )}
                </div>
                <p style={{ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '4px', color: '#1e293b' }}>
                    {data.full_name || 'Unknown'}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {data.role === 'employee' ? 'Student' : data.role === 'manager' ? 'Mentor' : data.role === 'executive' ? 'Tutor' : (data.role || 'N/A')}
                </p>
            </div>
        </div>
    );

    if (loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading organizational hierarchy...
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '70vh',
            width: '100%',
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: '#f8fafc'
        }}>
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflowX: 'auto',
                overflowY: 'auto',
                padding: '40px'
            }}>
                <div style={{
                    minWidth: 'max-content',
                    paddingBottom: '40px',
                    zoom: scale,
                    transition: 'zoom 0.2s ease-out'
                }}>
                    <div style={{ marginBottom: '48px', textAlign: 'center', position: 'sticky', left: 0, right: 0 }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>
                            Organizational Hierarchy
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '1rem' }}>
                            Extended hierarchical structure: Tutors → Mentors → Team Leads → Students
                        </p>
                    </div>

                    {/* Tree Structure */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '60px', minWidth: '100%' }}>

                        {/* Level 1: Executives */}
                        {hierarchyData.executives.length > 0 && (
                            <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', position: 'relative' }}>
                                {hierarchyData.executives.map((exec) => (
                                    <div key={exec.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '220px' }}>
                                        <EmployeeNode data={exec} color="#7c3aed" />
                                        {/* Down Line */}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: '-30px',
                                            left: '50%',
                                            width: '2px',
                                            height: '30px',
                                            backgroundColor: '#cbd5e1',
                                            transform: 'translateX(-1px)'
                                        }} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Level 2: Managers */}
                        {hierarchyData.managers.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                {/* Horizontal line connecting all managers */}
                                {hierarchyData.managers.length > 1 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-30px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        width: `${(hierarchyData.managers.length - 1) * (220 + 40)}px`,
                                        height: '2px',
                                        backgroundColor: '#cbd5e1'
                                    }} />
                                )}

                                {/* Vertical connection UP to Executives Horizontal/Vertical line */}
                                {/* If there is only 1 executive, their stick comes down to -30px.
                                    This horizontal bar is at -30px.
                                    If multiple managers, the bar is needed.
                                    The "Up Stick" from the middle of the managers bar to meet the executive stick?
                                    Wait, the executive stick is centered on the Executive container.
                                    The Managers container is also centered.
                                    So the Executive's down stick meets the Manager's horizontal bar (or single manager top stick) at the exact center.
                                */}

                                {/* Vertical lines to each manager */}
                                <div style={{
                                    display: 'flex',
                                    gap: '40px',
                                    justifyContent: 'center',
                                    position: 'relative'
                                }}>
                                    {hierarchyData.managers.map((manager, index) => (
                                        <div key={manager.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '220px' }}>
                                            {/* Up Line to Horizontal Bar */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '-30px',
                                                left: '50%',
                                                width: '2px',
                                                height: '30px',
                                                backgroundColor: '#cbd5e1',
                                                transform: 'translateX(-1px)'
                                            }} />

                                            <EmployeeNode data={manager} color="#2563eb" />

                                            {/* Down Line to Team Leads/Employees */}
                                            {(hierarchyData.teamLeads.length > 0 || hierarchyData.employees.length > 0) && (
                                                <div style={{
                                                    position: 'absolute',
                                                    bottom: '-30px',
                                                    left: '50%',
                                                    width: '2px',
                                                    height: '30px',
                                                    backgroundColor: '#cbd5e1',
                                                    transform: 'translateX(-1px)'
                                                }} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Level 3: Team Leads & Employees */}
                        {(hierarchyData.teamLeads.length > 0 || hierarchyData.employees.length > 0) && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                {/* Horizontal line connecting all items */}
                                {(() => {
                                    const totalItems = hierarchyData.teamLeads.length + hierarchyData.employees.length;
                                    return totalItems > 1 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '-30px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            width: `${(totalItems - 1) * (220 + 40)}px`,
                                            height: '2px',
                                            backgroundColor: '#cbd5e1'
                                        }} />
                                    );
                                })()}

                                {/* Flex row of Team Leads & Employees */}
                                <div style={{
                                    display: 'flex',
                                    gap: '40px',
                                    justifyContent: 'center',
                                    position: 'relative',
                                    flexWrap: 'nowrap'
                                }}>
                                    {[...hierarchyData.teamLeads, ...hierarchyData.employees].map((item, index) => (
                                        <div key={item.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '220px' }}>
                                            {/* Line UP to horizontal bar */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '-30px',
                                                left: '50%',
                                                width: '2px',
                                                height: '30px',
                                                backgroundColor: '#cbd5e1',
                                                transform: 'translateX(-1px)'
                                            }} />

                                            <EmployeeNode
                                                data={item}
                                                color={hierarchyData.teamLeads.includes(item) ? "#10b981" : "#10b981"}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty State */}
                        {hierarchyData.executives.length === 0 && hierarchyData.managers.length === 0 && hierarchyData.teamLeads.length === 0 && hierarchyData.employees.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '100px', backgroundColor: 'white', borderRadius: '24px', border: '2px dashed #e2e8f0', maxWidth: '600px', margin: '0 auto' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🌐</div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>No Hierarchy Data Found</h3>
                                <p style={{ color: '#64748b' }}>We couldn't find any employees with hierarchical roles (Tutors, Mentors, Team Leads, or Students). Please verify employee roles in the Team Members section.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Employee Details Modal */}
                {selectedEmployee && (
                    <div
                        style={{
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
                        }}
                        onClick={() => setSelectedEmployee(null)}
                    >
                        <div
                            style={{
                                backgroundColor: 'white',
                                borderRadius: '16px',
                                width: '500px',
                                maxWidth: '90%',
                                maxHeight: '90vh',
                                overflowY: 'auto',
                                position: 'relative',
                                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setSelectedEmployee(null)}
                                style={{
                                    position: 'absolute',
                                    top: '16px',
                                    right: '16px',
                                    padding: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: '#f1f5f9',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <X size={20} />
                            </button>

                            <div style={{ padding: '32px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{
                                    width: '96px',
                                    height: '96px',
                                    borderRadius: '50%',
                                    backgroundColor: '#7c3aed',
                                    margin: '0 auto 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '2.5rem',
                                    fontWeight: 'bold',
                                    color: 'white',
                                    border: '4px solid #f8fafc',
                                    overflow: 'hidden'
                                }}>
                                    {selectedEmployee.avatar_url ? (
                                        <img src={selectedEmployee.avatar_url} alt={selectedEmployee.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        selectedEmployee.full_name?.charAt(0) || '?'
                                    )}
                                </div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '4px', color: '#1e293b' }}>
                                    {selectedEmployee.full_name || 'Unknown'}
                                </h2>
                                <p style={{ color: '#7c3aed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.875rem' }}>
                                    {selectedEmployee.role || 'N/A'}
                                </p>
                            </div>

                            <div style={{ padding: '32px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '12px', display: 'block', fontWeight: 600 }}>
                                        Contact Information
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                            <Mail size={18} color="#64748b" />
                                            <span style={{ fontSize: '0.9rem', color: '#1e293b' }}>{selectedEmployee.email || 'N/A'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                            <Phone size={18} color="#64748b" />
                                            <span style={{ fontSize: '0.9rem', color: '#1e293b' }}>{selectedEmployee.phone || 'N/A'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                            <MapPin size={18} color="#64748b" />
                                            <span style={{ fontSize: '0.9rem', color: '#1e293b' }}>{selectedEmployee.location || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Zoom Controls */}
            <div style={{
                position: 'absolute',
                bottom: '32px',
                right: '32px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'white',
                padding: '8px',
                borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                zIndex: 50
            }}>
                <button
                    onClick={handleZoomOut}
                    style={{
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        color: '#64748b'
                    }}
                    title="Zoom Out"
                >
                    <div style={{ fontSize: '1.2rem', lineHeight: 1 }}>-</div>
                </button>
                <span style={{ minWidth: '40px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                    {Math.round(scale * 100)}%
                </span>
                <button
                    onClick={handleZoomIn}
                    style={{
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        color: '#64748b'
                    }}
                    title="Zoom In"
                >
                    <div style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</div>
                </button>
                <button
                    onClick={handleReset}
                    style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        cursor: 'pointer',
                        color: '#64748b',
                        fontSize: '0.8rem',
                        fontWeight: 600
                    }}
                    title="Reset Zoom"
                >
                    Reset
                </button>
            </div>
        </div>
    );
};

export default HierarchyDemo;
