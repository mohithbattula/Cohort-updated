import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
// @ts-ignore
import Layout from '../manager/components/Layout/Layout';
// @ts-ignore
import DashboardHome from '../manager/pages/DashboardHome';
// @ts-ignore
import ModulePage from '../manager/pages/ModulePage';
// @ts-ignore
import MyLeavesPage from '../manager/pages/MyLeavesPage';
// @ts-ignore
import ManagerAllTasksPage from '../manager/pages/ManagerAllTasksPage';
// @ts-ignore
import MessagingHub from '../shared/MessagingHub';
// @ts-ignore
import RaiseTicketPage from '../shared/pages/RaiseTicketPage';
// @ts-ignore
import { ToastProvider } from '../executive/context/ToastContext';
// @ts-ignore
import { UserProvider } from '../executive/context/UserContext';
// @ts-ignore
import { ProjectProvider } from '../employee/context/ProjectContext';
// @ts-ignore
import StudentReviewPage from '../executive/pages/StudentReviewPage';
import RoleGuard from '../shared/RoleGuard';
import '../manager/index.css';

export const ManagerDashboard = () => {
    return (
        <RoleGuard allowedRoles={['manager']}>
            <UserProvider>
                <ToastProvider>
                    <ProjectProvider>
                        <Layout>
                            <Routes>
                                <Route path="/" element={<Navigate to="dashboard" replace />} />
                                <Route path="dashboard" element={<DashboardHome />} />
                                <Route path="analytics" element={<ModulePage title="Team Performance" type="analytics" />} />
                                <Route path="students" element={<ModulePage title="Students" type="workforce" />} />
                                <Route path="tasks" element={<ModulePage title="All Project Tasks" type="tasks" />} />
                                <Route path="global-tasks" element={<ManagerAllTasksPage />} />
                                <Route path="personal-tasks" element={<ModulePage title="My Tasks" type="personal-tasks" />} />
                                <Route path="leaves" element={<ModulePage title="Leave Requests" type="leaves" />} />
                                <Route path="my-leaves" element={<MyLeavesPage />} />
                                <Route path="student-status" element={<ModulePage title="Student Status" type="status" />} />
                                <Route path="payslips" element={<ModulePage title="Payslips" type="payroll" />} />
                                <Route path="policies" element={<ModulePage title="Policies" type="policies" />} />
                                <Route path="payroll" element={<ModulePage title="Payroll" type="payroll-generation" />} />
                                <Route path="hiring" element={<ModulePage title="Hiring Portal" type="recruitment" />} />
                                <Route path="hierarchy" element={<ModulePage title="Organizational Hierarchy" type="default" />} />
                                <Route path="project-hierarchy" element={<ModulePage title="Project Hierarchy" type="default" />} />
                                <Route path="messages" element={<MessagingHub />} />
                                <Route path="announcements" element={<ModulePage title="Announcements" type="default" />} />
                                <Route path="raise-ticket" element={<RaiseTicketPage />} />
                                <Route path="documents" element={<ModulePage title="Project Documents" type="documents" />} />
                                <Route path="student-review" element={<StudentReviewPage />} />
                                <Route path="settings" element={<ModulePage title="Settings" type="default" />} />
                            </Routes>
                        </Layout>
                    </ProjectProvider>
                </ToastProvider>
            </UserProvider>
        </RoleGuard>
    );
};
