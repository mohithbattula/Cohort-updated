import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, Clock, Calendar, ChevronRight, MoreHorizontal,
    CheckCircle2, AlertCircle, Timer, Plus, Star, X,
    TrendingUp, Award, Briefcase, CheckCircle
} from 'lucide-react';
import { useToast } from '../../executive/context/ToastContext';
import { useUser } from '../../executive/context/UserContext';
import { supabase } from '../../../lib/supabaseClient';
import NotesTile from '../../shared/NotesTile';

import AttendanceTracker from '../components/Dashboard/AttendanceTracker';
import { useProject } from '../../employee/context/ProjectContext';


const DashboardHome = () => {
    const { addToast } = useToast();
    const { userName, orgName } = useUser();
    const { currentProject } = useProject();
    const navigate = useNavigate();

    // Helper to format date as YYYY-MM-DD for comparison (Local Time)
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // State
    const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
    const [showAddEventModal, setShowAddEventModal] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(today);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Active Employees Modal State
    const [showActiveListModal, setShowActiveListModal] = useState(false);
    const [activeEmployeesList, setActiveEmployeesList] = useState([]);

    // Update time every minute
    React.useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const getGreeting = () => {
        const hour = currentTime.getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    // Mock Data
    const [employeeStats, setEmployeeStats] = useState({ active: 0, away: 0, offline: 0, total: 0 });
    const [teamAnalytics, setTeamAnalytics] = useState([]);
    const [taskStats, setTaskStats] = useState({ pending: 0, inProgress: 0, completed: 0, total: 0, completionRate: 0 });

    // Team Performance Specific States
    const [lifecycleDistribution, setLifecycleDistribution] = useState([]);
    const [dailyProgress, setDailyProgress] = useState([]);
    const [memberPerformance, setMemberPerformance] = useState([]);
    const [performanceLoading, setPerformanceLoading] = useState(false);

    const [timeline, setTimeline] = useState([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Data for Modal
    const [allEmployees, setAllEmployees] = useState([]);
    const [allTeams, setAllTeams] = useState([]);
    const [eventScope, setEventScope] = useState('team'); // 'team' or 'employee'
    const [selectedTeams, setSelectedTeams] = useState([]);
    const [selectedEmployees, setSelectedEmployees] = useState([]);

    // Fetch data from Supabase
    React.useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const todayStr = new Date().toISOString().split('T')[0];

                let employees = [];
                let tasks = [];
                let eventsData = [];

                // 1. Fetch Data Based on Context
                if (currentProject) {
                    // Fetch Project Members
                    const { data: members } = await supabase
                        .from('project_members')
                        .select('user_id')
                        .eq('project_id', currentProject.id);

                    const memberIds = members?.map(m => m.user_id) || [];

                    if (memberIds.length > 0) {
                        const { data: empData } = await supabase
                            .from('profiles')
                            .select('id, full_name, role, team_id')
                            .in('id', memberIds);
                        employees = empData || [];
                    }

                    // Fetch Project Tasks
                    const { data: taskData } = await supabase
                        .from('tasks')
                        .select('id, status, assigned_to, title, due_date, priority, project_id')
                        .eq('project_id', currentProject.id);
                    tasks = taskData || [];

                    // Fetch Announcements (Keeping global for now, filtering can be added if needed)
                    // Ideally check if announcement is for 'all' or specific team/project
                    const { data: annData } = await supabase
                        .from('announcements')
                        .select('*')
                        .order('event_time', { ascending: true });
                    eventsData = annData || [];

                } else {
                    // Global View assignment
                    const { data: empData } = await supabase
                        .from('profiles')
                        .select('id, full_name, role, team_id');
                    employees = empData || [];

                    const { data: taskData } = await supabase
                        .from('tasks')
                        .select('id, status, assigned_to, title, due_date, priority, project_id');
                    tasks = taskData || [];

                    const { data: annData } = await supabase
                        .from('announcements')
                        .select('*')
                        .order('event_time', { ascending: true });
                    eventsData = annData || [];
                }

                // NEW: Fetch ALL project memberships to map employees to projects for the analytics section
                const { data: allMemberships } = await supabase
                    .from('project_members')
                    .select('user_id, project_id');
                const memberships = allMemberships || [];

                // 2. Fetch Attendance & Leaves for Stats Calculation
                // Filter attendance/leaves by gathered employee IDs
                const employeeIds = employees.map(e => e.id);
                let activeCount = 0;
                let absentCount = 0;
                let activeList = [];
                let attendanceData = [];
                let leavesData = [];

                if (employeeIds.length > 0) {
                    const { data: attData } = await supabase
                        .from('attendance')
                        .select('employee_id, clock_in, clock_out')
                        .eq('date', todayStr)
                        .in('employee_id', employeeIds);
                    attendanceData = attData || [];

                    const { data: lData } = await supabase
                        .from('leaves')
                        .select('id, employee_id') // Added employee_id to selection
                        .eq('status', 'approved')
                        .lte('from_date', todayStr)
                        .gte('to_date', todayStr)
                        .in('employee_id', employeeIds);
                    leavesData = lData || [];

                    if (attendanceData.length > 0) {
                        const activeRecords = attendanceData.filter(a => a.clock_in && !a.clock_out);
                        activeCount = activeRecords.length;

                        // Map active records to employee details
                        const activeIds = activeRecords.map(a => a.employee_id);
                        activeList = employees.filter(e => activeIds.includes(e.id));
                    }
                    absentCount = leavesData.length;
                }

                setAllEmployees(employees); // For modal usage

                // --- STATS UPDATE (Context Aware) ---
                const offlineCount = Math.max(0, employees.length - activeCount - absentCount);
                setEmployeeStats({
                    total: employees.length,
                    active: activeCount,
                    absent: absentCount,
                    away: 0,
                    offline: offlineCount
                });
                setActiveEmployeesList(activeList);

                if (tasks) {
                    const completed = tasks.filter(t => ['completed', 'done'].includes(t.status?.toLowerCase()) || t.lifecycle_state === 'closed').length;
                    const pending = tasks.filter(t => ['pending', 'to_do', 'to do'].includes(t.status?.toLowerCase())).length;
                    const inProgress = tasks.filter(t => ['in_progress', 'in progress'].includes(t.status?.toLowerCase())).length;
                    const total = tasks.length;
                    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

                    setTaskStats({
                        pending,
                        inProgress,
                        completed,
                        total,
                        completionRate
                    });

                    // 1a. Process Lifecycle Distribution
                    const lifecyclePhases = ['requirement_refiner', 'design_guidance', 'build_guidance', 'acceptance_criteria', 'deployment', 'closed'];
                    const distribution = lifecyclePhases.map(phase => {
                        const count = tasks.filter(t => t.lifecycle_state === phase).length;
                        return {
                            phase: phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                            count,
                            percentage: total > 0 ? Math.round((count / total) * 100) : 0
                        };
                    });
                    setLifecycleDistribution(distribution);

                    // 1b. Process Daily Progress (Last 6 Days)
                    const last6Days = [];
                    for (let i = 5; i >= 0; i--) {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        const dayName = d.toLocaleString('default', { weekday: 'short' });
                        const dateStr = d.toISOString().split('T')[0];

                        const count = tasks.filter(t => {
                            if (!t.updated_at && !t.created_at) return false;
                            const tDate = new Date(t.updated_at || t.created_at).toISOString().split('T')[0];
                            return (['completed', 'done'].includes(t.status?.toLowerCase()) || t.lifecycle_state === 'closed') &&
                                tDate === dateStr;
                        }).length;

                        last6Days.push({ day: dayName, count });
                    }
                    setDailyProgress(last6Days);

                    // 1c. Process Individual Member Performance
                    const memberStats = employees.map(emp => {
                        const memberTasks = tasks.filter(t => t.assigned_to === emp.id);
                        const mCompleted = memberTasks.filter(t => ['completed', 'done'].includes(t.status?.toLowerCase()) || t.lifecycle_state === 'closed').length;
                        const mActive = memberTasks.filter(t => t.status?.toLowerCase().includes('progress') || t.sub_state === 'in_progress').length;
                        const mTotal = memberTasks.length;
                        const mRate = mTotal > 0 ? Math.round((mCompleted / mTotal) * 100) : 0;

                        return {
                            id: emp.id,
                            name: emp.full_name,
                            email: emp.email || '',
                            totalTasks: mTotal,
                            completedTasks: mCompleted,
                            activeTasks: mActive,
                            completionRate: mRate
                        };
                    });
                    memberStats.sort((a, b) => b.completionRate - a.completionRate);
                    setMemberPerformance(memberStats);
                }

                // Process Events
                let combinedEvents = [];
                if (eventsData) {
                    const formattedEvents = eventsData.map(event => ({
                        id: event.id,
                        date: event.event_date,
                        time: event.event_time ? event.event_time.slice(0, 5) : '', // HH:MM
                        title: event.title,
                        location: event.location,
                        color: '#e0f2fe', // Default color for announcements
                        scope: event.event_for,
                        participants: [],
                        status: event.status,
                        type: 'announcement'
                    }));
                    combinedEvents = [...combinedEvents, ...formattedEvents];
                }

                if (tasks) {
                    const taskEvents = tasks
                        .filter(t => t.due_date)
                        .map(t => ({
                            id: `task-${t.id}`,
                            date: t.due_date,
                            time: '09:00',
                            title: `Task: ${t.title}`,
                            location: `${t.priority} Priority`,
                            color: '#fef3c7', // Yellow for tasks
                            scope: 'task',
                            type: 'task',
                            participants: []
                        }));
                    combinedEvents = [...combinedEvents, ...taskEvents];
                }

                // Sort Events
                combinedEvents.sort((a, b) => {
                    const getStatusPriority = (event) => {
                        if (event.type !== 'announcement') return 0;
                        const status = event.status || ((event.date === formatDate(new Date())) ? 'active' : (new Date(event.date) < new Date().setHours(0, 0, 0, 0) ? 'completed' : 'future'));
                        if (status === 'active') return 1;
                        if (status === 'future') return 2;
                        return 3;
                    };
                    const priorityA = getStatusPriority(a);
                    const priorityB = getStatusPriority(b);
                    if (priorityA !== priorityB) return priorityA - priorityB;
                    return a.time.localeCompare(b.time);
                });

                setTimeline(combinedEvents);

                // Fetch Project List
                const { data: projectsData } = await supabase
                    .from('projects')
                    .select('id, name');

                let projects = projectsData ? projectsData.map(p => ({ id: p.id, name: p.name })) : [];

                // Filter for current project only
                if (currentProject) {
                    projects = projects.filter(p => p.id === currentProject.id);
                }

                if (projects.length > 0) setAllTeams(projects);

                // 3. Process Student-Task Analytics (Exclude Completed)
                if (employees.length > 0) {
                    const studentTasks = [];
                    employees.forEach(emp => {
                        const empTasks = tasks.filter(t =>
                            t.assigned_to === emp.id &&
                            !['completed', 'done'].includes(t.status?.toLowerCase())
                        );
                        if (empTasks.length > 0) {
                            empTasks.forEach(task => {
                                studentTasks.push({
                                    id: `${emp.id}-${task.id}`,
                                    studentName: emp.full_name,
                                    taskName: task.title,
                                    status: task.status || 'Pending',
                                    priority: task.priority
                                });
                            });
                        } else {
                            // Check if student had only completed tasks or no tasks at all
                            const hasAnyTasks = tasks.some(t => t.assigned_to === emp.id);
                            if (!hasAnyTasks) {
                                studentTasks.push({
                                    id: `${emp.id}-none`,
                                    studentName: emp.full_name,
                                    taskName: 'No tasks assigned',
                                    status: 'N/A',
                                    priority: 'none'
                                });
                            }
                        }
                    });
                    setTeamAnalytics(studentTasks);
                }

            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            }
        };

        fetchDashboardData();
    }, [refreshTrigger, currentProject]);

    // Real-time Subscription
    React.useEffect(() => {
        const sub = supabase
            .channel('dashboard_home_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
                setRefreshTrigger(prev => prev + 1);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
                setRefreshTrigger(prev => prev + 1);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
                setRefreshTrigger(prev => prev + 1);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, () => {
                setRefreshTrigger(prev => prev + 1);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'timesheets' }, () => {
                setRefreshTrigger(prev => prev + 1);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll' }, () => {
                setRefreshTrigger(prev => prev + 1);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(sub);
        };
    }, []);

    // Handlers
    const handleMonthChange = (direction) => {
        const newDate = new Date(currentMonth);
        newDate.setMonth(currentMonth.getMonth() + direction);
        setCurrentMonth(newDate);
    };

    const handleDateClick = (day) => {
        const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        setSelectedDate(newDate);
    };

    const handleAddEvent = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const title = formData.get('title');
        const date = formData.get('date');
        const time = formData.get('time');
        const location = formData.get('location');

        try {
            const { error } = await supabase
                .from('announcements')
                .insert({
                    title: title,
                    event_date: date,
                    event_time: time,
                    location: location,
                    event_for: eventScope,
                    teams: selectedTeams,
                    employees: selectedEmployees,
                    // message: '' // Optional if you have a message field
                });

            if (error) throw error;

            addToast('Event added successfully', 'success');
            setShowAddEventModal(false);

            // Reset form state
            setEventScope('team');
            setSelectedTeams([]);
            setSelectedEmployees([]);

            // Trigger refresh to update timeline
            setRefreshTrigger(prev => prev + 1);

        } catch (error) {
            console.error('Error adding event:', error);
            addToast('Failed to add event: ' + error.message, 'error');
        }
    };

    const handleAddEmployee = (e) => {
        e.preventDefault();
        setShowAddEmployeeModal(false);
        addToast('Employee added successfully', 'success');
    };

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const startDayOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const filteredTimeline = timeline.filter(event => event.date === formatDate(selectedDate));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '32px' }}>
            <style>{`
                .chart-tooltip-dh { 
                    opacity: 0; 
                    transition: all 0.2s ease; 
                    pointer-events: none;
                    background-color: #0f172a;
                    color: white;
                    font-size: 0.65rem;
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-weight: 700;
                    white-space: nowrap;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                    z-index: 10;
                    position: absolute;
                    top: -28px;
                    left: 50%;
                    transform: translateX(-50%);
                }
                .chart-bar-container-dh:hover .chart-tooltip-dh { 
                    opacity: 1; 
                    transform: translateX(-50%) translateY(-5px); 
                }
            `}</style>

            {/* Header */}
            <div>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
                    {getGreeting()}, <span style={{ color: 'var(--accent)' }}>{userName}</span>
                </h1>
                <p style={{ color: '#64748b', fontSize: '1rem' }}>
                    Wish you a good and productive day. {employeeStats.active} employees active today. You have {filteredTimeline.length} events on {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
                </p>
            </div>

            {/* Main Content Grid */}
            <div className="flex flex-col lg:grid lg:grid-cols-[2.5fr_1fr] gap-8">

                {/* Left Column: Cards Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

                    {/* Attendance Tracker - Added Here */}
                    <AttendanceTracker />

                    {/* Top Row Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Employees Card (Yellow) */}
                        <div
                            onClick={() => navigate('/manager-dashboard/employee-status')}
                            style={{
                                backgroundColor: '#fef08a',
                                borderRadius: '24px',
                                padding: '24px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                minHeight: '240px',
                                position: 'relative',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                transition: 'transform 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#854d0e' }}>Employees:</h3>
                            </div>

                            <div style={{ display: 'flex', gap: '32px', marginTop: '16px' }}>
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowActiveListModal(true);
                                    }}
                                    style={{ cursor: 'pointer' }}
                                    title="View Active Employees"
                                >
                                    <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#000', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>{employeeStats.active}</span>
                                    <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#000' }}>Active</p>
                                </div>
                                {orgName !== 'Cohort' && (
                                    <div style={{ paddingTop: '12px' }}>
                                        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#854d0e' }}>{employeeStats.absent}</span>
                                        <p style={{ fontSize: '0.9rem', fontWeight: '600', color: '#854d0e' }}>Absent</p>
                                    </div>
                                )}
                                <div style={{ paddingTop: '12px' }}>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#854d0e' }}>{employeeStats.offline}</span>
                                    <p style={{ fontSize: '0.9rem', fontWeight: '600', color: '#854d0e' }}>Offline</p>
                                </div>
                            </div>

                            {/* Decorative Bottom Shapes */}
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginTop: 'auto', height: '40px' }}>
                                <div style={{ width: '30px', height: '20px', backgroundColor: '#422006', borderRadius: '15px 15px 0 0', opacity: 0.8 }}></div>
                                <div style={{ width: '30px', height: '35px', backgroundColor: '#a16207', borderRadius: '15px 15px 0 0', opacity: 0.6 }}></div>
                                <div style={{ width: '30px', height: '15px', backgroundColor: '#422006', borderRadius: '15px 15px 0 0', opacity: 0.8 }}></div>
                                <div style={{ width: '30px', height: '40px', backgroundColor: '#a16207', borderRadius: '15px 15px 0 0', opacity: 0.6 }}></div>
                                <div style={{ width: '30px', height: '25px', backgroundColor: '#422006', borderRadius: '15px 15px 0 0', opacity: 0.8 }}></div>
                                <div style={{ width: '30px', height: '40px', backgroundColor: '#a16207', borderRadius: '15px 15px 0 0', opacity: 0.6 }}></div>
                                <div style={{ width: '30px', height: '20px', backgroundColor: '#422006', borderRadius: '15px 15px 0 0', opacity: 0.8 }}></div>
                            </div>
                        </div>

                        {/* Task Status Card (Blue) - Moved Here */}
                        <div
                            onClick={() => navigate('/manager-dashboard/tasks')}
                            style={{
                                backgroundColor: '#bfdbfe', borderRadius: '24px', padding: '24px',
                                display: 'flex', flexDirection: 'column', minHeight: '240px',
                                position: 'relative', overflow: 'hidden', cursor: 'pointer',
                                transition: 'transform 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '24px' }}>Task Status:</h3>

                            <div className="flex flex-wrap gap-4 justify-between">
                                <div>
                                    <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000' }}>{taskStats.pending}</span>
                                    <p style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1e3a8a', marginTop: '4px' }}>PENDING</p>
                                </div>
                                <div>
                                    <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000' }}>{taskStats.inProgress}</span>
                                    <p style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1e3a8a', marginTop: '4px' }}>IN PROGRESS</p>
                                </div>
                                <div>
                                    <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000' }}>{taskStats.completed}</span>
                                    <p style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1e3a8a', marginTop: '4px' }}>COMPLETED</p>
                                </div>
                            </div>

                            {/* Decorative Triangle */}
                            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '0', height: '0', borderStyle: 'solid', borderWidth: '0 0 100px 100px', borderColor: 'transparent transparent rgba(255,255,255,0.3) transparent' }}></div>
                        </div>
                    </div>

                    {/* Student Status Card (Green) - Detailed Task List */}
                    <div style={{ backgroundColor: '#bbf7d0', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#14532d', marginBottom: '20px' }}>Student Status:</h3>

                        <div className="hide-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px' }}>
                            <style>{`
                                .hide-scrollbar::-webkit-scrollbar {
                                    display: none;
                                }
                                .hide-scrollbar {
                                    -ms-overflow-style: none;
                                    scrollbar-width: none;
                                }
                            `}</style>
                            {/* Header Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr', gap: '12px', padding: '0 16px 8px 16px', borderBottom: '1px solid rgba(20, 83, 45, 0.1)', fontSize: '0.75rem', fontWeight: 'bold', color: '#14532d', opacity: 0.6 }}>
                                <span>STUDENT</span>
                                <span>TASK</span>
                                <span>STATUS</span>
                            </div>

                            {teamAnalytics.map((item) => (
                                <div
                                    key={item.id}
                                    style={{
                                        backgroundColor: 'rgba(255, 255, 255, 0.6)',
                                        borderRadius: '12px',
                                        padding: '12px 16px',
                                        display: 'grid',
                                        gridTemplateColumns: '1.5fr 2fr 1fr',
                                        gap: '12px',
                                        alignItems: 'center',
                                        transition: 'all 0.2s ease',
                                        border: '1px solid rgba(255, 255, 255, 0.4)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                                        e.currentTarget.style.transform = 'translateX(4px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                                        e.currentTarget.style.transform = 'translateX(0)';
                                    }}
                                >
                                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#14532d' }}>{item.studentName}</span>
                                    <span style={{ fontSize: '0.85rem', color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.taskName}>
                                        {item.taskName}
                                    </span>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 'bold',
                                        textAlign: 'center',
                                        padding: '4px 8px',
                                        borderRadius: '8px',
                                        textTransform: 'uppercase',
                                        backgroundColor: item.status?.toLowerCase().includes('completed') ? '#dcfce7' : item.status?.toLowerCase().includes('progress') ? '#dbeafe' : '#fef3c7',
                                        color: item.status?.toLowerCase().includes('completed') ? '#166534' : item.status?.toLowerCase().includes('progress') ? '#1e40af' : '#92400e',
                                        width: 'fit-content'
                                    }}>
                                        {item.status || 'Pending'}
                                    </span>
                                </div>
                            ))}

                            {teamAnalytics.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontStyle: 'italic' }}>
                                    No students or tasks found.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Notes Tile */}
                    <div style={{ marginTop: '32px' }}>
                        <NotesTile />
                    </div>

                </div>

                {/* Right Column: Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>



                    {/* Calendar Widget */}
                    <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => handleMonthChange(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#64748b' }}>&lt;</button>
                                <button onClick={() => handleMonthChange(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#64748b' }}>&gt;</button>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                            <span>MO</span><span>TU</span><span>WE</span><span>TH</span><span>FR</span><span>SA</span><span>SU</span>

                            {/* Empty cells for offset */}
                            {Array.from({ length: startDayOffset }).map((_, i) => (
                                <span key={`empty-${i}`}></span>
                            ))}

                            {/* Calendar Days */}
                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                const isSelected = selectedDate.getDate() === d && selectedDate.getMonth() === currentMonth.getMonth() && selectedDate.getFullYear() === currentMonth.getFullYear();
                                const isToday = today.getDate() === d && today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear();

                                return (
                                    <span
                                        key={d}
                                        onClick={() => handleDateClick(d)}
                                        style={{
                                            padding: '6px',
                                            borderRadius: '50%',
                                            backgroundColor: isSelected ? '#000' : isToday ? '#e2e8f0' : 'transparent',
                                            color: isSelected ? '#fff' : 'inherit',
                                            cursor: 'pointer',
                                            fontWeight: isSelected || isToday ? 'bold' : 'normal'
                                        }}
                                    >
                                        {d}
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* Add Event Button */}
                    <button
                        onClick={() => setShowAddEventModal(true)}
                        style={{ backgroundColor: '#000', color: '#fff', padding: '16px', borderRadius: '32px', fontWeight: 'bold', fontSize: '1rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    >
                        Add event
                    </button>

                    {/* Timeline */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b' }}>
                                {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </h3>
                        </div>

                        {/* Column Headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '32px', marginBottom: '16px', paddingLeft: '8px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.05em' }}>TIME</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.05em' }}>EVENT</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', position: 'relative', minHeight: '200px' }}>
                            {/* Vertical Line */}
                            <div style={{
                                position: 'absolute',
                                left: '91px',
                                top: '10px',
                                bottom: '10px',
                                width: '2px',
                                backgroundColor: '#f1f5f9',
                                zIndex: 0
                            }}></div>

                            {filteredTimeline.length > 0 ? (
                                filteredTimeline.map((event) => (
                                    <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '32px', position: 'relative', zIndex: 1, marginBottom: '24px' }}>
                                        {/* Time */}
                                        <span style={{
                                            fontSize: '0.9rem',
                                            fontWeight: '600',
                                            color: '#64748b',
                                            paddingTop: '14px',
                                            textAlign: 'right'
                                        }}>
                                            {event.time}
                                        </span>

                                        {/* Timeline Dot */}
                                        <div style={{
                                            position: 'absolute',
                                            left: '86px',
                                            top: '20px',
                                            width: '12px',
                                            height: '12px',
                                            borderRadius: '50%',
                                            backgroundColor: '#3b82f6',
                                            border: '2px solid #fff',
                                            boxShadow: '0 0 0 2px #e0f2fe',
                                            zIndex: 2
                                        }}></div>

                                        {/* Event Card */}
                                        <div style={{
                                            backgroundColor: event.color,
                                            padding: '16px',
                                            borderRadius: '16px',
                                            transition: 'all 0.2s ease',
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                        }}
                                            onClick={() => {
                                                if (event.type === 'task') {
                                                    navigate('/manager-dashboard/tasks');
                                                } else if (event.type === 'announcement') {
                                                    navigate('/manager-dashboard/announcements');
                                                }
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = '0 8px 16px -4px rgba(0,0,0,0.1)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                                            }}
                                        >
                                            <p style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>{event.title}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem' }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8' }}></div>
                                                {event.location}
                                            </div>
                                            {event.type === 'announcement' && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 'bold',
                                                    textTransform: 'uppercase',
                                                    padding: '2px 6px',
                                                    borderRadius: '8px',
                                                    marginTop: '4px',
                                                    display: 'inline-block',
                                                    backgroundColor: (event.status === 'completed' || new Date(event.date) < new Date().setHours(0, 0, 0, 0)) ? '#f1f5f9' : (event.status === 'active' || event.date === formatDate(new Date())) ? '#dcfce7' : '#e0f2fe',
                                                    color: (event.status === 'completed' || new Date(event.date) < new Date().setHours(0, 0, 0, 0)) ? '#64748b' : (event.status === 'active' || event.date === formatDate(new Date())) ? '#166534' : '#0369a1'
                                                }}>
                                                    {(event.status === 'completed' || new Date(event.date) < new Date().setHours(0, 0, 0, 0)) ? 'Completed' : (event.status === 'active' || event.date === formatDate(new Date())) ? 'Active' : 'Future'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ paddingLeft: '112px', paddingTop: '24px', color: '#94a3b8', fontStyle: 'italic' }}>
                                    No events for this day
                                </div>
                            )}
                        </div>
                    </div>



                </div>
            </div>

            {/* Modals */}
            {showAddEmployeeModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '24px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Add Employee</h3>
                            <button onClick={() => setShowAddEmployeeModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
                        </div>
                        <form onSubmit={handleAddEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <input type="text" placeholder="Full Name" required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem' }} />
                            <input type="text" placeholder="Role" required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem' }} />
                            <select style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem' }}>
                                <option>Engineering</option>
                                <option>Design</option>
                                <option>Product</option>
                            </select>
                            <button type="submit" style={{ backgroundColor: '#000', color: '#fff', padding: '12px', borderRadius: '12px', fontWeight: 'bold', border: 'none', cursor: 'pointer', marginTop: '8px' }}>Add Employee</button>
                        </form>
                    </div>
                </div>
            )}

            {showAddEventModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '24px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Add Event</h3>
                            <button onClick={() => setShowAddEventModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
                        </div>
                        <form onSubmit={handleAddEvent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <input name="title" type="text" placeholder="Event Title" required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem' }} />

                            {/* Scope Selection */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1e293b' }}>Who is this event for?</label>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="scope"
                                            value="team"
                                            checked={eventScope === 'team'}
                                            onChange={() => setEventScope('team')}
                                        />
                                        Entire Project(s)
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="scope"
                                            value="employee"
                                            checked={eventScope === 'employee'}
                                            onChange={() => setEventScope('employee')}
                                        />
                                        Specific Employee(s)
                                    </label>
                                </div>
                            </div>

                            {/* Multi-select Lists */}
                            {eventScope === 'team' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '8px' }}>
                                    {allTeams.length > 0 ? allTeams.map(team => (
                                        <label key={team.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedTeams.includes(team.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedTeams([...selectedTeams, team.id]);
                                                    } else {
                                                        setSelectedTeams(selectedTeams.filter(id => id !== team.id));
                                                    }
                                                }}
                                            />
                                            {team.name}
                                        </label>
                                    )) : <p style={{ color: '#94a3b8', fontSize: '0.9rem', padding: '4px' }}>No teams available</p>}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '8px' }}>
                                    {allEmployees.length > 0 ? allEmployees.map(emp => (
                                        <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedEmployees.includes(emp.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedEmployees([...selectedEmployees, emp.id]);
                                                    } else {
                                                        setSelectedEmployees(selectedEmployees.filter(id => id !== emp.id));
                                                    }
                                                }}
                                            />
                                            {emp.full_name}
                                        </label>
                                    )) : <p style={{ color: '#94a3b8', fontSize: '0.9rem', padding: '4px' }}>No employees available</p>}
                                </div>
                            )}

                            <input
                                name="date"
                                type="date"
                                required
                                defaultValue={formatDate(selectedDate)}
                                style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem' }}
                            />
                            <input name="time" type="time" required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem' }} />
                            <input name="location" type="text" placeholder="Location" required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem' }} />
                            <button type="submit" style={{ backgroundColor: '#000', color: '#fff', padding: '12px', borderRadius: '12px', fontWeight: 'bold', border: 'none', cursor: 'pointer', marginTop: '8px' }}>Save Event</button>
                        </form>
                    </div>
                </div>
            )}
            {showActiveListModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '24px', width: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e' }}></div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Active Employees</h3>
                            </div>
                            <button onClick={() => setShowActiveListModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '8px' }}>
                            {activeEmployeesList.length > 0 ? (
                                activeEmployeesList.map(emp => (
                                    <div key={emp.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '16px',
                                        padding: '12px',
                                        backgroundColor: '#f8fafc',
                                        borderRadius: '16px',
                                        border: '1px solid #e2e8f0'
                                    }}>
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '50%',
                                            backgroundColor: '#e0f2fe',
                                            color: '#0369a1',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 'bold',
                                            fontSize: '1rem'
                                        }}>
                                            {emp.full_name?.charAt(0) || 'U'}
                                        </div>
                                        <div>
                                            <p style={{ fontWeight: 'bold', color: '#1e293b', margin: 0 }}>{emp.full_name}</p>
                                            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>{emp.role ? emp.role.replace('_', ' ') : 'Employee'}</p>
                                        </div>
                                        <div style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 'bold', color: '#15803d', backgroundColor: '#dcfce7', padding: '4px 8px', borderRadius: '12px' }}>
                                            Online
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                                    No active employees found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}




        </div>
    );
};

export default DashboardHome;
