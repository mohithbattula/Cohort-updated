import React, { useState, useEffect } from 'react';
import { X, Crown, LogOut, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { getCohortRoleDisplay } from '../../services/messageService';

/**
 * GroupMembersModal - View members of a group chat
 * Simple modal matching the attached design
 */
const GroupMembersModal = ({
    isOpen,
    onClose,
    conversation,
    currentUserId,
    onLeaveGroup
}) => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && conversation) {
            fetchMembers();
        }
    }, [isOpen, conversation]);

    const fetchMembers = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('conversation_members')
            .select(`
                user_id,
                profiles:user_id(id, full_name, avatar_url, role)
            `)
            .eq('conversation_id', conversation.id);

        if (!error && data) {
            setMembers(data.map(m => ({
                ...m.profiles,
                isAdmin: conversation.admin_ids?.includes(m.user_id)
            })));
        }
        setLoading(false);
    };

    const handleLeave = () => {
        if (window.confirm('Leave this group?')) {
            onLeaveGroup?.(conversation.id);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
                {/* Header with gradient */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-5 flex items-center justify-between">
                    <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                        <Users size={20} />
                        Group Members ({members.length})
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Members List */}
                <div className="p-4 max-h-[300px] overflow-y-auto">
                    {loading ? (
                        <div className="text-center text-gray-500 py-4">Loading...</div>
                    ) : (
                        <div className="space-y-3">
                            {members.map(member => (
                                <div
                                    key={member.id}
                                    className="flex items-center gap-3"
                                >
                                    <img
                                        src={member.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.full_name || 'U')}&background=6366f1&color=fff`}
                                        alt=""
                                        className="w-12 h-12 rounded-full object-cover"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-gray-900">
                                                {member.full_name}
                                            </span>
                                            {member.isAdmin && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                                                    <Crown size={10} />
                                                    ADMIN
                                                </span>
                                            )}
                                            {member.id === currentUserId && (
                                                <span className="text-gray-400 text-sm">(You)</span>
                                            )}
                                        </div>
                                        <span className="text-sm text-gray-500">
                                            {getCohortRoleDisplay(member.role)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Leave Group Button */}
                <div className="p-4 border-t">
                    <button
                        onClick={handleLeave}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-red-500 border border-red-200 rounded-full hover:bg-red-50 transition-colors font-medium"
                    >
                        Leave Group
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GroupMembersModal;
