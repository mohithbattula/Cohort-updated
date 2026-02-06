import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface EditEmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    employee: any;
    orgId: string;
    orgName?: string;
}

interface Team {
    id: string;
    name: string;
}

interface Project {
    id: string;
    name: string;
}

interface Department {
    id: string;
    department_name: string;
}

export const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({ isOpen, onClose, onSuccess, employee, orgId, orgName }) => {
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [currentUserRole, setCurrentUserRole] = useState<string>('');
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]); // Array of project IDs
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        role: 'employee',
        job_title: '',
        employment_type: 'Full-Time', // Added employment_type
        department_id: '', // Added department_id
        monthly_leave_quota: 3,
        basic_salary: '',
        hra: '',
        allowances: '',
        change_reason: 'Annual Increment',
        custom_change_reason: '',
        effective_from: new Date().toISOString().split('T')[0],
        joinDate: '',
    });
    const [projectRole, setProjectRole] = useState('employee');
    const [originalSalary, setOriginalSalary] = useState<any>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && employee) {
            fetchProjects();
            fetchDepartments();
            fetchCurrentUserRole();
            fetchEmployeeSalary();
            fetchEmployeeProjects(); // Fetch ALL projects
            fetchEmployeeDepartment(); // Fetch current department
            // Populate form with employee data
            setFormData({
                full_name: employee.name || '',
                email: employee.email || '',
                role: (orgName === 'Cohort' && employee.role === 'employee') ? 'student' : (employee.role || (orgName === 'Cohort' ? 'student' : 'employee')),
                job_title: '', // Will be updated by fetchEmployeeDepartment
                employment_type: 'full_time', // Will be updated
                department_id: '', // Will be updated by fetchEmployeeDepartment
                monthly_leave_quota: employee.monthly_leave_quota || 3,
                basic_salary: '',
                hra: '',
                allowances: '',
                change_reason: 'Annual Increment',
                custom_change_reason: '',
                effective_from: new Date().toISOString().split('T')[0],
                joinDate: '',
            });
            setProjectRole(orgName === 'Cohort' ? 'student' : 'employee');
        }
    }, [isOpen, employee, orgId]);

    const fetchDepartments = async () => {
        console.log('Fetching departments...');
        const { data, error } = await supabase
            .from('departments')
            .select('id, department_name')
            .eq('org_id', orgId)
            .order('department_name');

        if (error) {
            console.error('Error fetching departments:', error);
        } else {
            console.log('Departments fetched:', data);
            setDepartments(data || []);
        }
    };

    const fetchEmployeeDepartment = async () => {
        if (!employee?.id) return;
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('full_name, role')
                .eq('id', employee.id)
                .eq('org_id', orgId)
                .single();

            if (profile) {
                setFormData(prev => ({
                    ...prev,
                    department_id: '',
                    job_title: '',
                    employment_type: 'full_time',
                    joinDate: '',
                    monthly_leave_quota: 3
                }));
            }
        } catch (err) {
            console.error('Error fetching employee details:', err);
        }
    };

    const fetchProjects = async () => {
        console.log('Fetching projects for restricted access...');
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .eq('org_id', orgId)
                .single();

            if (profile?.role === 'manager') {
                console.log('User is manager, fetching only assigned projects');
                const { data: memberships, error: memberError } = await supabase
                    .from('project_members')
                    .select('project:projects(id, name)')
                    .eq('user_id', user.id)
                    .eq('org_id', orgId);

                if (memberError) throw memberError;

                const managerProjects = memberships
                    ?.map((m: any) => m.project)
                    .filter((p: any) => p !== null) || [];

                console.log('Manager projects fetched:', managerProjects);
                setProjects(managerProjects);
            } else {
                console.log('User is not manager, fetching all projects for orgId:', orgId);
                const { data, error } = await supabase
                    .from('projects')
                    .select('id, name')
                    .eq('org_id', orgId)
                    .order('name');

                if (error) throw error;
                setProjects(data || []);
            }
        } catch (error) {
            console.error('Error in fetchProjects:', error);
        }
    };

    const fetchEmployeeProjects = async () => {
        if (!employee?.id) return;
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('project_id')
                .eq('user_id', employee.id)
                .eq('org_id', orgId);

            if (data && data.length > 0) {
                const projectIds = data.map(p => String(p.project_id));
                setSelectedProjects(projectIds);
                console.log('Employee assigned to projects:', projectIds);
            } else {
                setSelectedProjects([]);
            }
        } catch (error) {
            console.error('Error fetching employee projects:', error);
        }
    };

    // New useEffect to match department ID once departments are loaded
    // matchDept removed as department column is missing in Cohort schema
    useEffect(() => {
        // Keeping an empty effect or removing logic that depends on missing columns
    }, [departments, employee?.id]);

    const fetchCurrentUserRole = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .eq('org_id', orgId)
                    .single();
                if (profile) {
                    setCurrentUserRole(profile.role);
                }
            }
        } catch (error) {
            console.error('Error fetching current user role:', error);
        }
    };

    const fetchEmployeeSalary = async () => {
        try {
            const { data, error } = await supabase
                .from('employee_finance')
                .select('*')
                .eq('employee_id', employee.id)
                .eq('is_active', true)
                .eq('org_id', orgId)
                .single();

            if (error) {
                console.log('No active salary record found:', error);
                return;
            }

            if (data) {
                setOriginalSalary(data);
                setFormData(prev => ({
                    ...prev,
                    basic_salary: data.basic_salary?.toString() || '',
                    hra: data.hra?.toString() || '',
                    allowances: data.allowances?.toString() || '',
                }));
            }
        } catch (error) {
            console.error('Error fetching employee salary:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Update employee profile
            console.log('Updating employee with data:', {
                full_name: formData.full_name,
                role: formData.role,
                job_title: formData.job_title,
                employment_type: formData.employment_type,
                department: formData.department_id || null,
                monthly_leave_quota: formData.monthly_leave_quota,
                join_date: formData.joinDate,
            });

            // Ensure role is mapped correctly for DB constraint
            const dbRole = (formData.role && formData.role.toLowerCase() === 'student') ? 'employee' : formData.role;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    full_name: formData.full_name,
                    role: dbRole,
                })
                .eq('id', employee.id)
                .eq('org_id', orgId);

            if (updateError) {
                console.error('Update error details:', updateError);
                throw new Error(updateError.message || 'Failed to update employee');
            }

            // Update project assignments - handle multiple projects
            const { data: currentAssignments } = await supabase
                .from('project_members')
                .select('project_id')
                .eq('user_id', employee.id)
                .eq('org_id', orgId);

            const currentProjectIds = currentAssignments?.map(a => a.project_id) || [];

            // Find projects to add and remove
            const projectsToAdd = selectedProjects.filter(id => !currentProjectIds.includes(id));
            const projectsToRemove = currentProjectIds.filter(id => !selectedProjects.includes(id));

            console.log('Projects to add:', projectsToAdd);
            console.log('Projects to remove:', projectsToRemove);

            // Remove from projects
            if (projectsToRemove.length > 0) {
                await supabase
                    .from('project_members')
                    .delete()
                    .eq('user_id', employee.id)
                    .in('project_id', projectsToRemove)
                    .eq('org_id', orgId);
            }

            // Add to new projects
            if (projectsToAdd.length > 0) {
                const newAssignments = projectsToAdd.map(projectId => ({
                    project_id: projectId,
                    user_id: employee.id,
                    role: projectRole,
                    org_id: orgId
                }));
                await supabase
                    .from('project_members')
                    .insert(newAssignments);
            }

            // Update role in all remaining projects
            if (selectedProjects.length > 0) {
                await supabase
                    .from('project_members')
                    .update({ role: projectRole })
                    .eq('user_id', employee.id)
                    .in('project_id', selectedProjects)
                    .eq('org_id', orgId);
            }

            console.log('Employee updated successfully');

            // Handle salary updates (executives only)
            if (currentUserRole === 'executive' && formData.basic_salary && formData.hra) {
                const newBasicSalary = parseFloat(formData.basic_salary);
                const newHra = parseFloat(formData.hra);
                const newAllowances = parseFloat(formData.allowances || '0');

                // Check if salary has changed (or if there's no existing salary)
                const salaryChanged = !originalSalary ||
                    newBasicSalary !== originalSalary.basic_salary ||
                    newHra !== originalSalary.hra ||
                    newAllowances !== (originalSalary.allowances || 0);

                if (salaryChanged) {
                    console.log('Salary changed or no existing salary, updating employee_finance...');

                    const today = new Date().toISOString().split('T')[0];

                    if (originalSalary) {
                        // Existing salary record - deactivate ALL active records for this employee
                        const effectiveFromDate = new Date(formData.effective_from);
                        const effectiveTo = new Date(effectiveFromDate);
                        effectiveTo.setDate(effectiveTo.getDate() - 1);
                        const effectiveToStr = effectiveTo.toISOString().split('T')[0];

                        // First, get all active record IDs
                        const { data: activeRecords, error: fetchError } = await supabase
                            .from('employee_finance')
                            .select('id')
                            .eq('employee_id', employee.id)
                            .eq('is_active', true)
                            .eq('org_id', orgId);

                        if (fetchError) {
                            console.error('Error fetching active records:', fetchError);
                            throw new Error(`Failed to fetch active records: ${fetchError.message}`);
                        }

                        if (activeRecords && activeRecords.length > 0) {
                            console.log(`Found ${activeRecords.length} active record(s) to deactivate`);

                            // Deactivate each record individually
                            for (const record of activeRecords) {
                                const { error: deactivateError } = await supabase
                                    .from('employee_finance')
                                    .update({
                                        is_active: false,
                                        effective_to: effectiveToStr,
                                    })
                                    .eq('id', record.id)
                                    .eq('org_id', orgId);

                                if (deactivateError) {
                                    console.error(`Error deactivating record ${record.id}:`, deactivateError);
                                    throw new Error(`Failed to deactivate record: ${deactivateError.message}`);
                                }
                            }

                            console.log('All active records deactivated successfully');

                            // Wait for database to commit
                            await new Promise(resolve => setTimeout(resolve, 500));

                            // Verify deactivation worked - check if any active records still exist
                            const { data: stillActive, error: checkError } = await supabase
                                .from('employee_finance')
                                .select('id')
                                .eq('employee_id', employee.id)
                                .eq('is_active', true)
                                .eq('org_id', orgId);

                            if (checkError) {
                                console.error('Error checking active records:', checkError);
                            } else if (stillActive && stillActive.length > 0) {
                                console.error('ERROR: Records still active after deactivation:', stillActive);
                                throw new Error(`Failed to deactivate ${stillActive.length} record(s). Please refresh and try again.`);
                            }
                        }
                    }

                    // Insert new salary record (works for both new and updated salaries)
                    const changeReason = formData.change_reason === 'Other'
                        ? formData.custom_change_reason || 'Salary Update'
                        : formData.change_reason;

                    const { error: insertError } = await supabase
                        .from('employee_finance')
                        .insert([{
                            employee_id: employee.id,
                            basic_salary: newBasicSalary,
                            hra: newHra,
                            allowances: newAllowances,
                            effective_from: formData.effective_from,
                            is_active: true,
                            change_reason: changeReason,
                            org_id: orgId
                        }]);

                    if (insertError) {
                        console.error('Error inserting new salary:', insertError);
                        throw new Error(`Failed to create salary record: ${insertError.message}`);
                    }

                    console.log('New salary record created successfully');
                }
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while updating the employee');
            console.error('Error updating employee:', err);
        } finally {
            setLoading(false);
        }
    };

    // Deleting Employee Handler
    // Deleting Employee Handler
    const handleDelete = async () => {
        if (!window.confirm(`Are you sure you want to delete ${formData.full_name}? This action cannot be undone.`)) {
            return;
        }

        try {
            setLoading(true);
            console.log('Starting deletion process for:', employee.id);

            // 1. Delete Notifications (Receiver or Sender)
            const { error: notifError } = await supabase
                .from('notifications')
                .delete()
                .or(`receiver_id.eq.${employee.id},sender_id.eq.${employee.id}`);

            if (notifError) console.error('Error clearing notifications:', notifError);

            // 2. Delete Employee Finance Records
            const { error: financeError } = await supabase
                .from('employee_finance')
                .delete()
                .eq('employee_id', employee.id);

            if (financeError) console.error('Error clearing finance records:', financeError);

            // 3. Delete Attendance
            const { error: attendanceError } = await supabase
                .from('attendance')
                .delete()
                .eq('employee_id', employee.id);

            if (attendanceError) console.error('Error clearing attendance:', attendanceError);

            // 4. Delete Leaves
            const { error: leaveError } = await supabase
                .from('leaves')
                .delete()
                .eq('employee_id', employee.id);

            if (leaveError) console.error('Error clearing leaves:', leaveError);

            // 5. Unassign Tasks (Assigned To or Assigned By)
            // Note: We update to NULL instead of deleting to preserve task history
            const { error: taskError1 } = await supabase
                .from('tasks')
                .update({ assigned_to: null })
                .eq('assigned_to', employee.id);

            if (taskError1) console.error('Error unassigning tasks (to):', taskError1);

            const { error: taskError2 } = await supabase
                .from('tasks')
                .update({ assigned_by: null })
                .eq('assigned_by', employee.id);

            if (taskError2) console.error('Error unassigning tasks (by):', taskError2);

            // 6. Delete project_members (Explicitly, just in case cascade fails or isn't set)
            const { error: memberError } = await supabase
                .from('project_members')
                .delete()
                .eq('user_id', employee.id);

            if (memberError) console.error('Error clearing project memberships:', memberError);


            // 7. Finally, Delete Profile
            const { error: deleteError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', employee.id)
                .eq('org_id', orgId);

            if (deleteError) {
                console.error('Error deleting employee profile:', deleteError);
                throw new Error(deleteError.message || 'Failed to delete employee profile');
            }

            console.log('Employee deleted successfully');
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while deleting the employee');
            console.error('Delete error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !employee) return null;

    return (
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
                zIndex: 1000,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'var(--surface)',
                    borderRadius: '16px',
                    width: '600px',
                    maxWidth: '90%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    boxShadow: 'var(--shadow-lg)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: 'var(--spacing-lg)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {orgName === 'Cohort' ? 'Edit Student' : 'Edit Employee'}
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '8px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: 'var(--spacing-lg)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {/* Full Name */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                Full Name *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.full_name}
                                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'var(--background)',
                                    color: 'var(--text-primary)',
                                }}
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                Email (Read-only)
                            </label>
                            <input
                                type="email"
                                value={formData.email}
                                readOnly
                                disabled
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    backgroundColor: '#f3f4f6',
                                    color: '#6b7280',
                                    cursor: 'not-allowed',
                                }}
                            />
                        </div>

                        {/* Role */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                Role *
                            </label>
                            <select
                                required
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'var(--background)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                <option value={orgName === 'Cohort' ? 'student' : 'employee'}>{orgName === 'Cohort' ? 'Student' : 'Employee'}</option>
                                <option value="manager">Mentor</option>
                                <option value="executive">Tutor</option>
                            </select>
                        </div>

                        {/* Job Title */}
                        {orgName !== 'Cohort' && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                    Job Title
                                </label>
                                <input
                                    type="text"
                                    value={formData.job_title}
                                    onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                                    placeholder="e.g. Senior Software Engineer"
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        backgroundColor: 'var(--background)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </div>
                        )}

                        {/* Department */}
                        {orgName !== 'Cohort' && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                    Department
                                </label>
                                <select
                                    value={formData.department_id}
                                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        backgroundColor: 'var(--background)',
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    <option value="">Select Department</option>
                                    <option value="">No Department</option>
                                    {departments.map((dept) => (
                                        <option key={dept.id} value={dept.id}>
                                            {dept.department_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Employment Type */}
                        {orgName !== 'Cohort' && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                    Employment Type
                                </label>
                                <select
                                    value={formData.employment_type}
                                    onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        backgroundColor: 'var(--background)',
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    <option value="full_time">Full Time</option>
                                    <option value="part_time">Part Time</option>
                                    <option value="contract">Contract</option>
                                    <option value="intern">Intern</option>
                                    <option value="trainee">Trainee</option>
                                    <option value="freelance">Freelance</option>
                                    <option value="probation">Probation</option>
                                </select>
                            </div>
                        )}

                        {/* Project Role */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                Project Role
                            </label>
                            <select
                                value={projectRole}
                                onChange={(e) => setProjectRole(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'var(--background)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                <option value={orgName === 'Cohort' ? 'student' : 'employee'}>{orgName === 'Cohort' ? 'Student' : 'Employee'}</option>
                                <option value="team_lead">Team Lead</option>
                                <option value="manager">Mentor</option>
                            </select>
                        </div>

                        {/* Projects - Multi-select */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                Projects (Select Multiple)
                            </label>

                            {/* Selected Projects Display */}
                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '8px',
                                marginBottom: '12px',
                                minHeight: '40px',
                                padding: '8px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--background)',
                            }}>
                                {selectedProjects.length === 0 ? (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                        No projects selected
                                    </span>
                                ) : (
                                    selectedProjects.map(projectId => {
                                        const project = projects.find(p => String(p.id) === String(projectId));
                                        return project ? (
                                            <div
                                                key={projectId}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    backgroundColor: 'var(--primary)',
                                                    color: 'white',
                                                    fontSize: '0.875rem',
                                                    fontWeight: 500,
                                                }}
                                            >
                                                {project.name}
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedProjects(selectedProjects.filter(id => id !== projectId))}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'white',
                                                        cursor: 'pointer',
                                                        padding: '0',
                                                        fontSize: '1.2rem',
                                                        lineHeight: '1',
                                                        marginLeft: '4px',
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ) : null;
                                    })
                                )}
                            </div>

                            {/* Available Projects Dropdown */}
                            <select
                                value=""
                                onChange={(e) => {
                                    if (e.target.value && !selectedProjects.some(id => String(id) === String(e.target.value))) {
                                        setSelectedProjects([...selectedProjects, e.target.value]);
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'var(--background)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                <option value="">+ Add Project</option>
                                {projects
                                    .filter(project => !selectedProjects.includes(project.id))
                                    .map((project) => (
                                        <option key={project.id} value={project.id}>
                                            {project.name}
                                        </option>
                                    ))}
                            </select>
                        </div>

                        {/* Join Date */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                Join Date
                            </label>
                            <input
                                type="date"
                                value={formData.joinDate || ''}
                                onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'var(--background)',
                                    color: 'var(--text-primary)',
                                }}
                            />
                        </div>



                        {/* Compensation Details Section - Role-based visibility */}
                        {orgName !== 'Cohort' && (currentUserRole === 'executive' || currentUserRole === 'manager') && (
                            <div style={{
                                marginTop: 'var(--spacing-lg)',
                                paddingTop: 'var(--spacing-lg)',
                                borderTop: '2px solid var(--border)',
                            }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--spacing-md)' }}>
                                    Compensation Details
                                </h3>

                                {/* Basic Salary */}
                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                        Basic Salary *
                                    </label>
                                    <input
                                        type="number"
                                        required={currentUserRole === 'executive'}
                                        min={0}
                                        step="0.01"
                                        value={formData.basic_salary}
                                        onChange={(e) => setFormData({ ...formData, basic_salary: e.target.value })}
                                        disabled={currentUserRole === 'manager'}
                                        placeholder="Enter basic salary"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            backgroundColor: currentUserRole === 'manager' ? '#f3f4f6' : 'var(--background)',
                                            color: currentUserRole === 'manager' ? '#6b7280' : 'var(--text-primary)',
                                            cursor: currentUserRole === 'manager' ? 'not-allowed' : 'text',
                                        }}
                                    />
                                </div>

                                {/* HRA */}
                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                        HRA (House Rent Allowance) *
                                    </label>
                                    <input
                                        type="number"
                                        required={currentUserRole === 'executive'}
                                        min={0}
                                        step="0.01"
                                        value={formData.hra}
                                        onChange={(e) => setFormData({ ...formData, hra: e.target.value })}
                                        disabled={currentUserRole === 'manager'}
                                        placeholder="Enter HRA amount"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            backgroundColor: currentUserRole === 'manager' ? '#f3f4f6' : 'var(--background)',
                                            color: currentUserRole === 'manager' ? '#6b7280' : 'var(--text-primary)',
                                            cursor: currentUserRole === 'manager' ? 'not-allowed' : 'text',
                                        }}
                                    />
                                </div>

                                {/* Allowances */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                        Other Allowances
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={formData.allowances}
                                        onChange={(e) => setFormData({ ...formData, allowances: e.target.value })}
                                        disabled={currentUserRole === 'manager'}
                                        placeholder="Enter other allowances (optional)"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)',
                                            backgroundColor: currentUserRole === 'manager' ? '#f3f4f6' : 'var(--background)',
                                            color: currentUserRole === 'manager' ? '#6b7280' : 'var(--text-primary)',
                                            cursor: currentUserRole === 'manager' ? 'not-allowed' : 'text',
                                        }}
                                    />
                                </div>

                                {/* Change Reason - Only for executives */}
                                {currentUserRole === 'executive' && (
                                    <>
                                        <div style={{ marginTop: 'var(--spacing-md)' }}>
                                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                                Reason for Change *
                                            </label>
                                            <select
                                                value={formData.change_reason}
                                                onChange={(e) => setFormData({ ...formData, change_reason: e.target.value })}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    backgroundColor: 'var(--background)',
                                                    color: 'var(--text-primary)',
                                                }}
                                            >
                                                <option value="Annual Increment">Annual Increment</option>
                                                <option value="Promotion">Promotion</option>
                                                <option value="Performance Bonus">Performance Bonus</option>
                                                <option value="Market Adjustment">Market Adjustment</option>
                                                <option value="Correction">Correction</option>
                                                <option value="Other">Other (Specify below)</option>
                                            </select>
                                        </div>

                                        {/* Custom Reason Input - Show only if "Other" is selected */}
                                        {formData.change_reason === 'Other' && (
                                            <div style={{ marginTop: 'var(--spacing-md)' }}>
                                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                                    Specify Reason *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.custom_change_reason}
                                                    onChange={(e) => setFormData({ ...formData, custom_change_reason: e.target.value })}
                                                    placeholder="Enter reason for salary change"
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border)',
                                                        backgroundColor: 'var(--background)',
                                                        color: 'var(--text-primary)',
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Effective From Date - Only for executives */}
                                {currentUserRole === 'executive' && (
                                    <div style={{ marginTop: 'var(--spacing-md)' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                                            Effective From Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.effective_from}
                                            onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border)',
                                                backgroundColor: 'var(--background)',
                                                color: 'var(--text-primary)',
                                            }}
                                        />
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                            The date when this salary change becomes effective
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error Message */}
                        {error && (
                            <div style={{
                                padding: '12px',
                                borderRadius: '8px',
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                                fontSize: '0.875rem',
                            }}>
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'var(--background)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            {(currentUserRole === 'executive' || currentUserRole === 'manager') && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        borderRadius: '8px',
                                        fontWeight: 600,
                                        border: '1px solid #fee2e2',
                                        backgroundColor: '#fee2e2',
                                        color: '#991b1b',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Delete
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    flex: 1,
                                    backgroundColor: loading ? 'var(--border)' : 'var(--primary)',
                                    color: 'white',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    border: 'none',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {loading ? 'Updating...' : `Update ${formData.role ? formData.role.charAt(0).toUpperCase() + formData.role.slice(1) : 'Employee'}`}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
