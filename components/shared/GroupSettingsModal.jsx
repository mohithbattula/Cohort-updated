import React, { useState, useEffect } from 'react';
import { X, Settings, UserPlus, UserMinus, Crown, LogOut, Trash2, Edit2, Check, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { promoteToAdmin, demoteFromAdmin, isConversationAdmin, getCohortRoleDisplay } from '../../services/messageService';

const GroupSettingsModal = ({
    isOpen,
    onClose,
    conversation,
    currentUserId,
    currentUserRole,
    onGroupUpdated,
    onLeaveGroup,
    onDeleteGroup
}) => {
    const [members, setMembers] = useState([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState(conversation?.name || '');
    const [loading, setLoading] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen && conversation) {
            fetchMembers();
            checkAdminStatus();
            setNewName(conversation.name || '');
        }
    }, [isOpen, conversation]);

    const fetchMembers = async () => {
        const { data, error } = await supabase
            .from('conversation_members')
            .select(`
                user_id,
                profiles:user_id(id, full_name, avatar_url, role, email)
            `)
            .eq('conversation_id', conversation.id);

        if (!error && data) {
            setMembers(data.map(m => ({
                ...m.profiles,
                isAdmin: conversation.admin_ids?.includes(m.user_id)
            })));
        }
    };

    const checkAdminStatus = async () => {
        const adminStatus = await isConversationAdmin(conversation.id, currentUserId);
        setIsAdmin(adminStatus);
    };

    const fetchAvailableUsers = async () => {
        // Get org users not already in the group
        const memberIds = members.map(m => m.id);
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, role, email')
            .eq('org_id', conversation.org_id)
            .not('id', 'in', `(${memberIds.join(',')})`)
            .neq('is_hidden', true)
            .order('full_name');

        setAvailableUsers(data || []);
    };

    const handleRename = async () => {
        if (!newName.trim() || newName === conversation.name) {
            setIsEditing(false);
            return;
        }

        setLoading(true);
        const { error } = await supabase
            .from('conversations')
            .update({ name: newName.trim() })
            .eq('id', conversation.id);

        if (!error) {
            onGroupUpdated?.({ ...conversation, name: newName.trim() });
        }
        setLoading(false);
        setIsEditing(false);
    };

    const handleAddMember = async (userId) => {
        setLoading(true);
        const { error } = await supabase
            .from('conversation_members')
            .insert({ conversation_id: conversation.id, user_id: userId });

        if (!error) {
            await fetchMembers();
            setAvailableUsers(prev => prev.filter(u => u.id !== userId));
        }
        setLoading(false);
    };

    const handleRemoveMember = async (userId) => {
        if (!window.confirm('Remove this member from the group?')) return;

        setLoading(true);
        const { error } = await supabase
            .from('conversation_members')
            .delete()
            .eq('conversation_id', conversation.id)
            .eq('user_id', userId);

        if (!error) {
            await fetchMembers();
        }
        setLoading(false);
    };

    const handlePromote = async (userId) => {
        setLoading(true);
        try {
            await promoteToAdmin(conversation.id, userId, currentUserId);
            await fetchMembers();
            onGroupUpdated?.();
        } catch (error) {
            alert(error.message);
        }
        setLoading(false);
    };

    const handleDemote = async (userId) => {
        setLoading(true);
        try {
            await demoteFromAdmin(conversation.id, userId, currentUserId);
            await fetchMembers();
            onGroupUpdated?.();
        } catch (error) {
            alert(error.message);
        }
        setLoading(false);
    };

    const handleLeave = () => {
        if (window.confirm('Leave this group?')) {
            onLeaveGroup?.(conversation.id);
            onClose();
        }
    };

    const handleDelete = () => {
        if (window.confirm('Delete this group? This cannot be undone.')) {
            onDeleteGroup?.(conversation.id);
            onClose();
        }
    };

    if (!isOpen) return null;

    const filteredAvailable = availableUsers.filter(u =>
        u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isTutor = currentUserRole === 'executive';

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Settings size={20} className="text-gray-500" />
                        Group Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Group Name */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Group Name</label>
                        <div className="mt-1 flex items-center gap-2">
                            {isEditing ? (
                                <>
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleRename}
                                        disabled={loading}
                                        className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        <Check size={16} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <span className="flex-1 text-gray-900 font-medium">{conversation.name}</span>
                                    {(isAdmin || isTutor) && (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Members */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                                <Users size={14} />
                                Members ({members.length})
                            </label>
                            {(isAdmin || isTutor) && (
                                <button
                                    onClick={() => {
                                        setShowAddMember(!showAddMember);
                                        if (!showAddMember) fetchAvailableUsers();
                                    }}
                                    className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                                >
                                    <UserPlus size={14} />
                                    Add
                                </button>
                            )}
                        </div>

                        {/* Add Member Panel */}
                        {showAddMember && (
                            <div className="mb-3 p-3 bg-gray-50 rounded-lg border">
                                <input
                                    type="text"
                                    placeholder="Search users..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full border rounded px-3 py-2 text-sm mb-2"
                                />
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {filteredAvailable.map(user => (
                                        <button
                                            key={user.id}
                                            onClick={() => handleAddMember(user.id)}
                                            disabled={loading}
                                            className="w-full flex items-center gap-2 p-2 hover:bg-white rounded text-left text-sm"
                                        >
                                            <img
                                                src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || 'U')}`}
                                                alt=""
                                                className="w-6 h-6 rounded-full"
                                            />
                                            <span className="flex-1 truncate">{user.full_name}</span>
                                            <span className="text-xs text-gray-500">{getCohortRoleDisplay(user.role)}</span>
                                        </button>
                                    ))}
                                    {filteredAvailable.length === 0 && (
                                        <p className="text-xs text-gray-500 text-center py-2">No users found</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Member List */}
                        <div className="space-y-1">
                            {members.map(member => (
                                <div
                                    key={member.id}
                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                                >
                                    <img
                                        src={member.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.full_name || 'U')}`}
                                        alt=""
                                        className="w-8 h-8 rounded-full"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm text-gray-900 truncate">
                                                {member.full_name}
                                                {member.id === currentUserId && <span className="text-gray-400"> (You)</span>}
                                            </span>
                                            {member.isAdmin && (
                                                <Crown size={12} className="text-amber-500" />
                                            )}
                                        </div>
                                        <span className="text-xs text-gray-500">{getCohortRoleDisplay(member.role)}</span>
                                    </div>

                                    {/* Admin actions */}
                                    {(isAdmin || isTutor) && member.id !== currentUserId && (
                                        <div className="flex items-center gap-1">
                                            {member.isAdmin ? (
                                                <button
                                                    onClick={() => handleDemote(member.id)}
                                                    disabled={loading}
                                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                                                    title="Remove admin"
                                                >
                                                    <Crown size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handlePromote(member.id)}
                                                    disabled={loading}
                                                    className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                                                    title="Make admin"
                                                >
                                                    <Crown size={14} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleRemoveMember(member.id)}
                                                disabled={loading}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                title="Remove from group"
                                            >
                                                <UserMinus size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t space-y-2">
                    <button
                        onClick={handleLeave}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        <LogOut size={16} />
                        Leave Group
                    </button>
                    {(isAdmin || isTutor) && (
                        <button
                            onClick={handleDelete}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                        >
                            <Trash2 size={16} />
                            Delete Group
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GroupSettingsModal;
