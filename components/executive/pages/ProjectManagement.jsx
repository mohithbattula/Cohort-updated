import React, { useState, useEffect } from 'react';
import { Plus, Users, FolderOpen, UserPlus, X, Trash2, Search, Building2, ChevronDown, Check, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';

import { useUser } from '../context/UserContext';

const ProjectManagement = ({ addToast = () => { } }) => {
    const { orgId } = useUser();
    const [projects, setProjects] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedProject, setSelectedProject] = useState(null);
    const [projectMembers, setProjectMembers] = useState([]);
    const [showAddMember, setShowAddMember] = useState(false);
    const [showAddProject, setShowAddProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectManager, setNewProjectManager] = useState(''); // State for selected manager
    const [searchUser, setSearchUser] = useState('');
    const [selectedRole, setSelectedRole] = useState('student');

    // Wizard State
    const [wizardStep, setWizardStep] = useState(1);
    const [wizardData, setWizardData] = useState({
        name: '',
        status: 'active',
        managerId: '',
        members: [] // { id, full_name, email, role }
    });

    useEffect(() => {
        fetchProjects();
        fetchAllUsers();
    }, []);

    const fetchProjects = async () => {
        try {
            const { data, error } = await supabase.from('projects')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setProjects(data || []);
            if (data?.length > 0 && !selectedProject) {
                setSelectedProject(data[0]);
                fetchProjectMembers(data[0].id);
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAllUsers = async () => {
        try {
            const { data, error } = await supabase.from('profiles').select('id, full_name, email, role').eq('org_id', orgId).order('full_name');
            if (error) throw error;
            setAllUsers(data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    const fetchProjectMembers = async (projectId) => {
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('*, profiles:user_id(id, full_name, email)')
                .eq('project_id', projectId);
            if (error) throw error;
            setProjectMembers(data || []);
        } catch (error) {
            console.error('Error fetching members:', error);
        }
    };

    const createProject = async () => {
        if (!wizardData.name.trim()) return;

        try {
            // 1. Create Project
            const { data: project, error } = await supabase
                .from('projects')
                .insert({
                    name: wizardData.name.trim(),
                    status: wizardData.status,
                    org_id: orgId
                })
                .select()
                .single();

            if (error) throw error;

            console.log('Project created:', project);

            // 2. Assign Manager (if selected)
            if (wizardData.managerId) {
                await addMemberToProject(project.id, wizardData.managerId, 'manager');
            }

            // 3. Assign Members
            if (wizardData.members.length > 0) {
                for (const member of wizardData.members) {
                    await addMemberToProject(project.id, member.id, member.role);
                }
            }

            // Refresh & Reset
            await fetchProjects();
            setProjects(prev => [project, ...prev.filter(p => p.id !== project.id)]); // Optimistic update fallback

            // Reset Wizard
            setWizardData({ name: '', status: 'active', managerId: '', members: [] });
            setWizardStep(1);
            setShowAddProject(false);

            addToast?.('Project created successfully with team!', 'success');
        } catch (error) {
            console.error('Create project error:', error);
            addToast?.('Failed to create project', 'error');
        }
    };

    const addMemberToProject = async (projectId, userId, role) => {
        try {
            const { error: memberError } = await supabase
                .from('project_members')
                .insert({
                    project_id: projectId,
                    user_id: userId,
                    role: role,
                    org_id: orgId
                });

            if (memberError) {
                console.error(`Error adding ${role}:`, memberError);
            } else {
                // Sync with team_members
                const { error: teamError } = await supabase
                    .from('team_members')
                    .insert({
                        team_id: projectId,
                        profile_id: userId,
                        role_in_project: role,
                        org_id: orgId
                    });
                if (teamError) console.warn('Team member sync warning:', teamError);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const addMember = async (userId) => {
        if (!selectedProject) return;

        const insertData = {
            project_id: selectedProject.id,
            user_id: userId,
            role: selectedRole,
            org_id: orgId
        };
        console.log('🔍 Adding member with data:', insertData);

        try {
            // 1. Insert into project_members
            const { data, error } = await supabase.from('project_members').insert(insertData).select();

            if (error) {
                console.error('Project member insert failed:', error);
                throw error;
            }

            console.log('📝 Project member added:', data);

            // 2. Sync with team_members (best effort)
            const teamMemberData = {
                team_id: selectedProject.id,
                profile_id: userId,
                role_in_project: selectedRole,
                org_id: orgId
            };

            const { error: teamError } = await supabase.from('team_members').insert(teamMemberData);
            if (teamError) {
                console.warn('Team member sync warning (might already exist):', teamError);
            } else {
                console.log('Team member synced');
            }

            fetchProjectMembers(selectedProject.id);
            setShowAddMember(false);
            setSearchUser('');
            addToast?.('Member added successfully!', 'success');
        } catch (error) {
            console.error('❌ Full error object:', error);
            if (error.code === '23505') {
                addToast?.('User already in this project', 'error');
            } else {
                addToast?.('Failed to add member: ' + (error.message || 'Unknown error'), 'error');
            }
        }
    };

    const removeMember = async (memberId) => {
        try {
            const { error } = await supabase.from('project_members').delete().eq('id', memberId);
            if (error) throw error;
            setProjectMembers(projectMembers.filter(m => m.id !== memberId));
            addToast?.('Member removed', 'success');
        } catch (error) {
            addToast?.('Failed to remove member', 'error');
        }
    };

    const updateMemberRole = async (member, newRole) => {
        try {
            console.log(`Updating member ${member.id} role. UI Role: ${newRole}`);

            // Update project_members
            const { error: errorProject } = await supabase
                .from('project_members')
                .update({ role: newRole })
                .eq('id', member.id);

            if (errorProject) {
                console.error('Project member update failed:', errorProject);
                throw errorProject;
            }

            // Sync with team_members (best effort)
            // project_id maps to team_id, user_id maps to profile_id
            if (member.project_id && member.user_id) {
                const { error: errorTeam } = await supabase
                    .from('team_members')
                    .update({ role_in_project: newRole })
                    .eq('team_id', member.project_id)
                    .eq('profile_id', member.user_id);

                if (errorTeam) console.warn('Team member sync warning:', errorTeam);
            }

            console.log('Role update successful');

            // Update state locally
            setProjectMembers(prev => prev.map(m =>
                m.id === member.id ? { ...m, role: newRole } : m
            ));

            addToast?.('Role updated successfully', 'success');
        } catch (error) {
            console.error('Failed to update role:', error);
            addToast?.(`Update Failed: ${error.message || 'Unknown error'}`, 'error');
            // Re-fetch to ensure UI is in sync
            if (selectedProject?.id) fetchProjectMembers(selectedProject.id);
        }
    };

    const updateProjectStatus = async (projectId, newStatus) => {
        try {
            const { error } = await supabase
                .from('projects')
                .update({ status: newStatus })
                .eq('id', projectId);
            if (error) throw error;

            setProjects(projects.map(p => p.id === projectId ? { ...p, status: newStatus } : p));
            if (selectedProject?.id === projectId) {
                setSelectedProject({ ...selectedProject, status: newStatus });
            }
            addToast?.(`Project marked as ${newStatus}`, 'success');
        } catch (error) {
            addToast?.('Failed to update project status', 'error');
        }
    };

    const deleteProject = async (projectId) => {
        if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;

        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', projectId);

            if (error) throw error;

            setProjects(projects.filter(p => p.id !== projectId));
            if (selectedProject?.id === projectId) {
                setSelectedProject(null);
                setProjectMembers([]);
            }

            addToast?.('Project deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting project:', error);
            addToast?.('Failed to delete project', 'error');
        }
    };

    const getRoleBadge = (role) => {
        // Map 'employee' from DB to 'student' for UI display
        const displayRole = role === 'employee' ? 'student' : role;
        const styles = {
            manager: { bg: '#fef3c7', color: '#b45309' },
            team_lead: { bg: '#dbeafe', color: '#1d4ed8' },
            student: { bg: '#f3f4f6', color: '#374151' }
        };
        return styles[displayRole] || styles.student;
    };

    const getStatusBadge = (status) => {
        const styles = {
            active: { bg: '#dcfce7', color: '#166534', icon: CheckCircle },
            completed: { bg: '#dbeafe', color: '#1e40af', icon: CheckCircle },
            deactivated: { bg: '#f3f4f6', color: '#6b7280', icon: XCircle }
        };
        return styles[status?.toLowerCase()] || styles.active;
    };

    const filteredUsers = allUsers.filter(u =>
        !projectMembers.find(m => m.user_id === u.id) &&
        (u.full_name?.toLowerCase().includes(searchUser.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchUser.toLowerCase()))
    );

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Loading projects...</div>;
    }

    return (
        <div style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 120px)' }}>
            {/* Projects List */}
            <div style={{ width: '280px', backgroundColor: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FolderOpen size={18} /> Projects
                    </h3>
                    <button onClick={() => setShowAddProject(true)} style={{ background: '#8b5cf6', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'white' }}>
                        <Plus size={18} />
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {projects.map(project => (
                        <div key={project.id} onClick={() => { setSelectedProject(project); fetchProjectMembers(project.id); }}
                            style={{
                                padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                                backgroundColor: selectedProject?.id === project.id ? '#ede9fe' : 'transparent',
                                borderLeft: selectedProject?.id === project.id ? '3px solid #8b5cf6' : '3px solid transparent'
                            }}>
                            <div style={{ fontWeight: 600 }}>{project.name}</div>
                            <div style={{
                                fontSize: '0.75rem',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                backgroundColor: getStatusBadge(project.status).bg,
                                color: getStatusBadge(project.status).color,
                                fontWeight: 600,
                                textTransform: 'capitalize',
                                display: 'inline-block',
                                marginTop: '4px'
                            }}>
                                {project.status || 'active'}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Project Members */}
            <div style={{ flex: 1, backgroundColor: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {selectedProject ? (
                    <>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedProject.name}</h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{projectMembers.length} members</p>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <select
                                    value={selectedProject.status || 'active'}
                                    onChange={(e) => updateProjectStatus(selectedProject.id, e.target.value)}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: '10px',
                                        border: '2px solid var(--border)',
                                        backgroundColor: getStatusBadge(selectedProject.status).bg,
                                        color: getStatusBadge(selectedProject.status).color,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    <option value="active">Active</option>
                                    <option value="completed">Completed</option>
                                    <option value="deactivated">Deactivated</option>
                                </select>
                                <button onClick={() => setShowAddMember(true)} style={{
                                    padding: '10px 20px', borderRadius: '10px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                    color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                                }}>
                                    <UserPlus size={18} /> Add Member
                                </button>
                                <button
                                    onClick={() => deleteProject(selectedProject.id)}
                                    style={{
                                        padding: '10px',
                                        borderRadius: '10px',
                                        backgroundColor: '#fee2e2',
                                        color: '#ef4444',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                    title="Delete Project"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                            {projectMembers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                    <Users size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
                                    <p>No members yet. Add project members to get started.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {projectMembers.map(member => {
                                        const badge = getRoleBadge(member.role);
                                        return (
                                            <div key={member.id} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '14px 16px', backgroundColor: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>
                                                        {member.profiles?.full_name?.charAt(0) || '?'}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{member.profiles?.full_name || 'Unknown'}</div>
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{member.profiles?.email}</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <select
                                                        value={member.role === 'employee' ? 'student' : (member.role?.toLowerCase() || 'student')}
                                                        onChange={(e) => updateMemberRole(member, e.target.value)}
                                                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: badge.bg, color: badge.color, fontWeight: 600, cursor: 'pointer' }}
                                                    >
                                                        <option value="student">Student</option>
                                                        <option value="team_lead">Team Lead</option>
                                                        <option value="manager">Mentor</option>
                                                    </select>
                                                    <button onClick={() => removeMember(member.id)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #fee2e2', backgroundColor: '#fff', cursor: 'pointer', color: '#ef4444' }}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                        Select a project to manage members
                    </div>
                )}
            </div>

            {/* Add Project Wizard Modal */}
            {showAddProject && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--surface)', padding: '0', borderRadius: '16px', width: '600px', maxWidth: '90%', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        {/* Header */}
                        <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Create New Project</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '4px 0 0' }}>Step {wizardStep} of 3</p>
                            </div>
                            <button onClick={() => setShowAddProject(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={24} /></button>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ padding: '0 24px', marginTop: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                                <div style={{ position: 'absolute', top: '50%', left: '0', right: '0', height: '2px', backgroundColor: '#e5e7eb', zIndex: 0 }}></div>
                                <div style={{ position: 'absolute', top: '50%', left: '0', width: wizardStep === 1 ? '0%' : wizardStep === 2 ? '50%' : '100%', height: '2px', backgroundColor: '#8b5cf6', transition: 'width 0.3s ease', zIndex: 0 }}></div>

                                {[1, 2, 3].map((step) => (
                                    <div key={step} style={{
                                        width: '32px', height: '32px', borderRadius: '50%',
                                        backgroundColor: wizardStep >= step ? '#8b5cf6' : 'white',
                                        border: `2px solid ${wizardStep >= step ? '#8b5cf6' : '#e5e7eb'}`,
                                        color: wizardStep >= step ? 'white' : '#9ca3af',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, zIndex: 1,
                                        transition: 'all 0.3s ease'
                                    }}>
                                        {step}
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#6b7280', fontSize: '0.8rem', fontWeight: 500 }}>
                                <span>Project Info</span>
                                <span>Team</span>
                                <span>Review</span>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div style={{ padding: '32px 24px', flex: 1, overflowY: 'auto' }}>

                            {/* Step 1: Project Info */}
                            {wizardStep === 1 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Project Name</label>
                                        <input
                                            type="text"
                                            value={wizardData.name}
                                            onChange={(e) => setWizardData({ ...wizardData, name: e.target.value })}
                                            placeholder="e.g. Website Redesign"
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }}
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Status</label>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            {['active', 'completed', 'planning'].map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => setWizardData({ ...wizardData, status: s })}
                                                    style={{
                                                        padding: '10px 20px', borderRadius: '8px',
                                                        border: `1px solid ${wizardData.status === s ? '#8b5cf6' : 'var(--border)'}`,
                                                        backgroundColor: wizardData.status === s ? '#f3e8ff' : 'var(--background)',
                                                        color: wizardData.status === s ? '#7c3aed' : 'var(--text-secondary)',
                                                        fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer'
                                                    }}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Team Selection */}
                            {wizardStep === 2 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                                    {/* Manager Selection */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Assign Project Mentor</label>
                                        <div style={{ position: 'relative' }}>
                                            <select
                                                value={wizardData.managerId}
                                                onChange={(e) => setWizardData({ ...wizardData, managerId: e.target.value })}
                                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '1rem', appearance: 'none', backgroundColor: 'var(--background)' }}
                                            >
                                                <option value="">Select a Mentor</option>
                                                {allUsers.map(user => (
                                                    <option key={user.id} value={user.id}>{user.full_name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
                                        </div>
                                    </div>

                                    {/* Add Members */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Add Team Members</label>

                                        {/* Search Box */}
                                        <div style={{ position: 'relative', marginBottom: '12px' }}>
                                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                            <input
                                                type="text"
                                                placeholder="Search to add members..."
                                                value={searchUser}
                                                onChange={(e) => setSearchUser(e.target.value)}
                                                style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                            />
                                            {searchUser && (
                                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                                    {allUsers.filter(u =>
                                                        u.id !== wizardData.managerId &&
                                                        !wizardData.members.find(m => m.id === u.id) &&
                                                        u.full_name.toLowerCase().includes(searchUser.toLowerCase())
                                                    ).map(user => (
                                                        <div
                                                            key={user.id}
                                                            onClick={() => {
                                                                setWizardData({ ...wizardData, members: [...wizardData.members, { ...user, role: 'student' }] });
                                                                setSearchUser('');
                                                            }}
                                                            style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                                        >
                                                            <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{user.full_name}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{user.email}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Added Members List */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                                            {wizardData.members.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No members added yet.</div>}
                                            {wizardData.members.map((member, idx) => (
                                                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>{member.full_name[0]}</div>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{member.full_name}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <select
                                                            value={member.role}
                                                            onChange={(e) => {
                                                                const newMembers = [...wizardData.members];
                                                                newMembers[idx].role = e.target.value;
                                                                setWizardData({ ...wizardData, members: newMembers });
                                                            }}
                                                            style={{ fontSize: '0.8rem', padding: '4px', borderRadius: '4px', border: '1px solid #e5e7eb' }}
                                                        >
                                                            <option value="student">Student</option>
                                                            <option value="team_lead">Team Lead</option>
                                                        </select>
                                                        <button onClick={() => {
                                                            const newMembers = wizardData.members.filter((_, i) => i !== idx);
                                                            setWizardData({ ...wizardData, members: newMembers });
                                                        }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 3: Review */}
                            {wizardStep === 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                                    <div style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                                        <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Project Summary</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</p>
                                                <p style={{ fontWeight: 600, fontSize: '1rem' }}>{wizardData.name}</p>
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Status</p>
                                                <p style={{ fontWeight: 600, fontSize: '1rem', textTransform: 'capitalize', color: '#8b5cf6' }}>{wizardData.status}</p>
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Manager</p>
                                                <p style={{ fontWeight: 600, fontSize: '1rem' }}>
                                                    {allUsers.find(u => u.id === wizardData.managerId)?.full_name || 'Not Assigned'}
                                                </p>
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Team Size</p>
                                                <p style={{ fontWeight: 600, fontSize: '1rem' }}>{wizardData.members.length} members</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Member List</h4>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {wizardData.members.map((member, i) => (
                                                <span key={i} style={{ padding: '6px 12px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '20px', fontSize: '0.85rem' }}>
                                                    {member.full_name} <span style={{ color: '#9ca3af' }}>({member.role})</span>
                                                </span>
                                            ))}
                                            {wizardData.members.length === 0 && <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No additional members</span>}
                                        </div>
                                    </div>

                                </div>
                            )}

                        </div>

                        {/* Footer Controls */}
                        <div style={{ padding: '24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                            <button
                                onClick={() => wizardStep > 1 ? setWizardStep(wizardStep - 1) : setShowAddProject(false)}
                                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)' }}
                            >
                                {wizardStep === 1 ? 'Cancel' : 'Back'}
                            </button>

                            <button
                                onClick={() => {
                                    if (wizardStep < 3) {
                                        if (wizardStep === 1 && !wizardData.name.trim()) return; // Validation
                                        setWizardStep(wizardStep + 1);
                                    } else {
                                        createProject();
                                    }
                                }}
                                disabled={wizardStep === 1 && !wizardData.name.trim()}
                                style={{
                                    padding: '10px 24px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: wizardStep === 1 && !wizardData.name.trim() ? '#e5e7eb' : '#8b5cf6',
                                    color: wizardStep === 1 && !wizardData.name.trim() ? '#9ca3af' : 'white',
                                    fontWeight: 600,
                                    cursor: wizardStep === 1 && !wizardData.name.trim() ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                {wizardStep === 3 ? (
                                    <>Create Project <Check size={18} /></>
                                ) : (
                                    <>Next Step <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} /></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Member Modal */}
            {showAddMember && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '16px', width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontWeight: 700 }}>Add Member to {selectedProject?.name}</h3>
                            <button onClick={() => setShowAddMember(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                <input type="text" value={searchUser} onChange={(e) => setSearchUser(e.target.value)} placeholder="Search users..."
                                    style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '8px', border: '1px solid var(--border)' }} />
                            </div>
                            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}
                                style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <option value="student">Student</option>
                                <option value="team_lead">Team Lead</option>
                                <option value="manager">Mentor</option>
                            </select>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px' }}>
                            {filteredUsers.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No users found</div>
                            ) : (
                                filteredUsers.map(user => (
                                    <div key={user.id} onClick={() => addMember(user.id)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px' }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--background)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                            {user.full_name?.charAt(0) || '?'}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500 }}>{user.full_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{user.email}</div>
                                        </div>
                                        <Plus size={18} color="#8b5cf6" />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectManagement;
