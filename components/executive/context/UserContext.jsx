import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const UserContext = createContext();

export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
    const [userName, setUserName] = useState('Loading...');
    const [userRole, setUserRole] = useState('User');
    const [userStatus, setUserStatus] = useState('Offline');
    const [userTask, setUserTask] = useState('');
    const [lastActive, setLastActive] = useState('Now');
    const [userId, setUserId] = useState(null);
    const [teamId, setTeamId] = useState(null);
    const [orgId, setOrgId] = useState(null);
    const [orgName, setOrgName] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();

                if (user) {
                    setUserId(user.id);

                    const { data: profile, error } = await supabase
                        .from('profiles')
                        .select('full_name, email, role, org_id, team_id, organizations(name)')
                        .eq('id', user.id)
                        .single();

                    if (error) {
                        console.error('Error fetching user profile:', error);
                        setUserName(user.email || 'User');
                        setUserRole('User');
                    } else if (profile) {
                        setUserName(profile.full_name || profile.email || 'User');
                        setUserRole(profile.role || 'User');
                        setOrgId(profile.org_id);
                        setTeamId(profile.team_id);
                        const fetchedOrgName = profile.organizations?.name || (Array.isArray(profile.organizations) ? profile.organizations[0]?.name : '');
                        setOrgName(fetchedOrgName);
                    }
                } else {
                    setUserName('Guest');
                    setUserRole('Guest');
                    setUserId(null);
                    setOrgId(null);
                }
            } catch (err) {
                console.error('Error in fetchUserData:', err);
                setUserName('User');
                setUserRole('User');
                setUserId(null);
                setOrgId(null);
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, []);

    return (
        <UserContext.Provider value={{
            userName, setUserName,
            userRole, setUserRole,
            userId,
            teamId,
            orgId,
            orgName,
            userStatus, setUserStatus,
            userTask, setUserTask,
            lastActive, setLastActive,
            loading
        }}>
            {children}
        </UserContext.Provider>
    );
};
