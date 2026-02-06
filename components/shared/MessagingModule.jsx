import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    MessageCircle, Users, Building2, Send, Paperclip,
    Image, X, Plus, Settings, Search, BarChart3,
    Reply, ChevronLeft, Smile
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import {
    getConversationsByCategory,
    getConversationMessages,
    sendMessageWithSnapshot,
    createDMConversation,
    createTeamConversation,
    getOrCreateOrgConversation,
    getOrgUsers,
    subscribeToConversation,
    unsubscribeFromConversation,
    getCohortRoleDisplay
} from '../../services/messageService';
import { useMessages } from './context/MessageContext';
import ReactionBar from './ReactionBar';
import ReplyPreview from './ReplyPreview';
import MessageOptionsMenu from './MessageOptionsMenu';
import PollMessage from './PollMessage';
import CreatePollModal from './CreatePollModal';
import PollDetailsModal from './PollDetailsModal';
import GroupSettingsModal from './GroupSettingsModal';
import GroupMembersModal from './GroupMembersModal';

/**
 * MessagingModule - Unified chat UI for all cohort dashboards
 * Same system, different permissions - never different UX
 */
const MessagingModule = ({ userRole }) => {
    // State
    const [category, setCategory] = useState('myself'); // 'myself' | 'team' | 'organization'
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [replyingTo, setReplyingTo] = useState(null);

    // User state
    const [currentUser, setCurrentUser] = useState(null);
    const [orgId, setOrgId] = useState(null);
    const [orgUsers, setOrgUsers] = useState([]);

    // UI state
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [showNewGroupModal, setShowNewGroupModal] = useState(false);
    const [showGroupSettings, setShowGroupSettings] = useState(false);
    const [showPollModal, setShowPollModal] = useState(false);
    const [pollDetailsMessage, setPollDetailsMessage] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [showMembersModal, setShowMembersModal] = useState(false);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [messageSearchTerm, setMessageSearchTerm] = useState('');

    // Refs
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const subscriptionRef = useRef(null);

    // Context
    const { markAsRead } = useMessages();

    // Fetch current user
    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setCurrentUser(user);
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('org_id, role')
                    .eq('id', user.id)
                    .single();
                if (profile) {
                    setOrgId(profile.org_id);
                }
            }
        };
        fetchUser();
    }, []);

    // Fetch conversations for current category
    useEffect(() => {
        if (!currentUser || !orgId) return;
        fetchConversations();
    }, [category, currentUser, orgId]);

    const fetchConversations = async () => {
        if (!currentUser || !orgId) return;
        setLoading(true);
        const data = await getConversationsByCategory(currentUser.id, category, orgId);
        setConversations(data || []);
        setLoading(false);
    };

    // Fetch messages for selected conversation
    useEffect(() => {
        if (!selectedConversation || !currentUser) return;

        const fetchMessages = async () => {
            setLoading(true);
            const msgs = await getConversationMessages(selectedConversation.id, currentUser.id);
            setMessages(msgs || []);
            setLoading(false);
            markAsRead(selectedConversation.id);
        };

        fetchMessages();

        // Subscribe to real-time updates
        if (subscriptionRef.current) {
            unsubscribeFromConversation(subscriptionRef.current);
        }
        subscriptionRef.current = subscribeToConversation(selectedConversation.id, (payload) => {
            if (payload.eventType === 'INSERT') {
                setMessages(prev => [...prev, payload.new]);
            } else if (payload.eventType === 'UPDATE') {
                setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
            } else if (payload.eventType === 'DELETE') {
                setMessages(prev => prev.filter(m => m.id !== payload.old.id));
            }
        });

        return () => {
            if (subscriptionRef.current) {
                unsubscribeFromConversation(subscriptionRef.current);
            }
        };
    }, [selectedConversation, currentUser]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Fetch org users for new chat modal
    useEffect(() => {
        if ((showNewChatModal || showNewGroupModal) && orgId) {
            getOrgUsers(orgId).then(setOrgUsers);
        }
    }, [showNewChatModal, showNewGroupModal, orgId]);

    // Send message handler
    const handleSendMessage = async () => {
        if ((!newMessage.trim() && !attachments.length) || sendingMessage || !selectedConversation) return;

        setSendingMessage(true);
        try {
            await sendMessageWithSnapshot(
                selectedConversation.id,
                currentUser.id,
                newMessage.trim(),
                attachments,
                replyingTo?.id || null
            );
            setNewMessage('');
            setAttachments([]);
            setReplyingTo(null);
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message');
        }
        setSendingMessage(false);
    };

    // Create DM
    const handleStartDM = async (targetUserId) => {
        const conv = await createDMConversation(currentUser.id, targetUserId, orgId);
        setShowNewChatModal(false);
        setCategory('myself');
        await fetchConversations();
        setSelectedConversation(conv);
    };

    // Create Group
    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || selectedMembers.length === 0) {
            alert('Please enter a group name and select members');
            return;
        }

        const conv = await createTeamConversation(
            currentUser.id,
            selectedMembers,
            newGroupName.trim(),
            orgId
        );

        // Set creator as admin
        await supabase
            .from('conversations')
            .update({ admin_ids: [currentUser.id] })
            .eq('id', conv.id);

        setShowNewGroupModal(false);
        setNewGroupName('');
        setSelectedMembers([]);
        setCategory('team');
        await fetchConversations();
        setSelectedConversation(conv);
    };

    // Get display name for conversation
    const getConversationName = useCallback((conv) => {
        if (conv.name) return conv.name;
        if (conv.type === 'dm' && conv.otherUser) {
            return conv.otherUser.full_name || conv.otherUser.email;
        }
        return 'Conversation';
    }, []);

    // File attachment handler
    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        setAttachments(prev => [...prev, ...files]);
    };

    // Category tabs
    const categories = [
        { id: 'myself', label: 'Myself', icon: MessageCircle },
        { id: 'team', label: 'Team', icon: Users },
        { id: 'organization', label: 'Organization', icon: Building2 }
    ];

    // Filtered users for search
    const filteredUsers = orgUsers.filter(u =>
        u.id !== currentUser?.id &&
        (u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="messaging-module flex h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Sidebar */}
            <div className="w-80 border-r border-gray-200 flex flex-col">
                {/* Category Tabs */}
                <div className="p-3 border-b border-gray-100">
                    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                        {categories.map(cat => {
                            const Icon = cat.icon;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        setCategory(cat.id);
                                        setSelectedConversation(null);
                                    }}
                                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${category === cat.id
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    <Icon size={16} />
                                    {cat.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* New Chat Button */}
                <div className="p-3 border-b border-gray-100">
                    {category === 'myself' && (
                        <button
                            onClick={() => setShowNewChatModal(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            <Plus size={16} />
                            New Chat
                        </button>
                    )}
                    {category === 'team' && (
                        <button
                            onClick={() => setShowNewGroupModal(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            <Plus size={16} />
                            New Group
                        </button>
                    )}
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto">
                    {loading && conversations.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">Loading...</div>
                    ) : conversations.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                            No conversations yet
                        </div>
                    ) : (
                        conversations.map(conv => (
                            <button
                                key={conv.id}
                                onClick={() => setSelectedConversation(conv)}
                                className={`w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${selectedConversation?.id === conv.id ? 'bg-indigo-50' : ''
                                    }`}
                            >
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold">
                                    {conv.type === 'team' ? <Users size={18} /> :
                                        conv.type === 'everyone' ? <Building2 size={18} /> :
                                            (getConversationName(conv)?.[0]?.toUpperCase() || '?')}
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="font-medium text-gray-900 truncate">
                                        {getConversationName(conv)}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                        {conv.conversation_indexes?.[0]?.last_message || 'No messages yet'}
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
                {selectedConversation ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setSelectedConversation(null)}
                                    className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <div>
                                    <h2 className="font-semibold text-gray-900">
                                        {getConversationName(selectedConversation)}
                                    </h2>
                                    {selectedConversation.type === 'team' && (
                                        <span className="text-xs text-indigo-600">TEAM CHAT</span>
                                    )}
                                </div>
                                {selectedConversation.is_read_only && (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                                        Read-only
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                {/* Search Button */}
                                <button
                                    onClick={() => setShowMessageSearch(!showMessageSearch)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm"
                                >
                                    <Search size={14} />
                                    Search
                                </button>
                                {/* Members Button (for team/everyone chats) */}
                                {(selectedConversation.type === 'team' || selectedConversation.type === 'everyone') && (
                                    <button
                                        onClick={() => setShowMembersModal(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm"
                                    >
                                        <Users size={14} />
                                        Members
                                    </button>
                                )}
                                {/* Settings for team chats (admin only) */}
                                {selectedConversation.type === 'team' && (
                                    <button
                                        onClick={() => setShowGroupSettings(true)}
                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                                    >
                                        <Settings size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Search bar (when active) */}
                        {showMessageSearch && (
                            <div className="px-4 py-2 bg-gray-50 border-b">
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search messages..."
                                        value={messageSearchTerm}
                                        onChange={(e) => setMessageSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => { setShowMessageSearch(false); setMessageSearchTerm(''); }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`group flex ${msg.sender_user_id === currentUser?.id ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[70%] ${msg.sender_user_id === currentUser?.id ? 'order-2' : ''}`}>
                                        {/* Reply Preview */}
                                        {(msg.reply_to_id || msg.reply_snapshot_content) && (
                                            <ReplyPreview message={msg} />
                                        )}

                                        {/* Message Bubble */}
                                        <div className={`relative rounded-2xl px-4 py-2 ${msg.sender_user_id === currentUser?.id
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-900'
                                            }`}>
                                            {/* Sender name for group chats */}
                                            {msg.sender_user_id !== currentUser?.id && selectedConversation.type !== 'dm' && (
                                                <div className="text-xs font-medium mb-1 opacity-70">
                                                    {msg.profiles?.full_name || 'User'}
                                                    <span className="ml-1.5 opacity-60">
                                                        {getCohortRoleDisplay(msg.profiles?.role)}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Poll or Text */}
                                            {msg.message_type === 'poll' ? (
                                                <PollMessage
                                                    message={msg}
                                                    currentUserId={currentUser?.id}
                                                    onViewVotes={() => setPollDetailsMessage(msg)}
                                                />
                                            ) : (
                                                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                            )}

                                            {/* Attachments */}
                                            {msg.attachments?.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {msg.attachments.map(att => (
                                                        <a
                                                            key={att.id}
                                                            href={att.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-2 text-sm underline"
                                                        >
                                                            <Paperclip size={12} />
                                                            {att.file_name}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Options Menu */}
                                            <div className="absolute top-1 right-1">
                                                <MessageOptionsMenu
                                                    message={msg}
                                                    currentUserId={currentUser?.id}
                                                    currentUserRole={userRole}
                                                    onReply={(m) => setReplyingTo(m)}
                                                    onDeleted={() => fetchConversations()}
                                                />
                                            </div>
                                        </div>

                                        {/* Reactions */}
                                        <ReactionBar
                                            messageId={msg.id}
                                            currentUserId={currentUser?.id}
                                            conversationId={selectedConversation.id}
                                        />

                                        {/* Timestamp */}
                                        <div className="text-[10px] text-gray-400 mt-1 px-1">
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Reply banner */}
                        {replyingTo && (
                            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Reply size={14} />
                                    Replying to <span className="font-medium">{replyingTo.profiles?.full_name || 'User'}</span>
                                </div>
                                <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-gray-200 rounded">
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        {/* Attachments preview */}
                        {attachments.length > 0 && (
                            <div className="px-4 py-2 bg-gray-50 border-t flex gap-2 flex-wrap">
                                {attachments.map((file, idx) => (
                                    <div key={idx} className="flex items-center gap-1 px-2 py-1 bg-white rounded border text-sm">
                                        <Paperclip size={12} />
                                        {file.name}
                                        <button
                                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                                            className="p-0.5 hover:bg-gray-100 rounded"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Input Area */}
                        {!selectedConversation.is_read_only || userRole === 'executive' ? (
                            <div className="p-4 border-t border-gray-200">
                                <div className="flex items-end gap-2">
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileSelect}
                                        className="hidden"
                                        multiple
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                                    >
                                        <Paperclip size={20} />
                                    </button>
                                    <button
                                        onClick={() => setShowPollModal(true)}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                                        title="Create poll"
                                    >
                                        <BarChart3 size={20} />
                                    </button>
                                    <textarea
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                        placeholder="Type a message..."
                                        className="flex-1 resize-none border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-h-32"
                                        rows={1}
                                    />
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={sendingMessage || (!newMessage.trim() && !attachments.length)}
                                        className="p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Send size={18} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 border-t border-gray-200 text-center text-gray-500 text-sm">
                                This channel is read-only
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                        <div className="text-center">
                            <MessageCircle size={48} className="mx-auto mb-4 opacity-30" />
                            <p>Select a conversation to start messaging</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            {/* New Chat Modal */}
            {showNewChatModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-semibold">New Chat</h3>
                            <button onClick={() => setShowNewChatModal(false)} className="p-1 hover:bg-gray-100 rounded">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4">
                            <div className="relative mb-4">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search members..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 border rounded-lg"
                                />
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-1">
                                {filteredUsers.map(user => (
                                    <button
                                        key={user.id}
                                        onClick={() => handleStartDM(user.id)}
                                        className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg"
                                    >
                                        <img
                                            src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || 'U')}`}
                                            alt=""
                                            className="w-8 h-8 rounded-full"
                                        />
                                        <div className="text-left">
                                            <div className="font-medium text-sm">{user.full_name}</div>
                                            <div className="text-xs text-gray-500">{getCohortRoleDisplay(user.role)}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* New Group Modal */}
            {showNewGroupModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-semibold">New Group</h3>
                            <button onClick={() => setShowNewGroupModal(false)} className="p-1 hover:bg-gray-100 rounded">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <input
                                type="text"
                                placeholder="Group name..."
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg"
                            />
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-2 block">Select members</label>
                                <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
                                    {orgUsers.filter(u => u.id !== currentUser?.id).map(user => (
                                        <label
                                            key={user.id}
                                            className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedMembers.includes(user.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedMembers(prev => [...prev, user.id]);
                                                    } else {
                                                        setSelectedMembers(prev => prev.filter(id => id !== user.id));
                                                    }
                                                }}
                                                className="rounded"
                                            />
                                            <span className="text-sm">{user.full_name}</span>
                                            <span className="text-xs text-gray-500 ml-auto">{getCohortRoleDisplay(user.role)}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={handleCreateGroup}
                                disabled={!newGroupName.trim() || selectedMembers.length === 0}
                                className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >
                                Create Group
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Group Settings Modal */}
            <GroupSettingsModal
                isOpen={showGroupSettings}
                onClose={() => setShowGroupSettings(false)}
                conversation={selectedConversation}
                currentUserId={currentUser?.id}
                currentUserRole={userRole}
                onGroupUpdated={() => fetchConversations()}
                onLeaveGroup={async (convId) => {
                    await supabase
                        .from('conversation_members')
                        .delete()
                        .eq('conversation_id', convId)
                        .eq('user_id', currentUser?.id);
                    setSelectedConversation(null);
                    fetchConversations();
                }}
                onDeleteGroup={async (convId) => {
                    await supabase.from('conversations').delete().eq('id', convId);
                    setSelectedConversation(null);
                    fetchConversations();
                }}
            />

            {/* Poll Modals */}
            <CreatePollModal
                isOpen={showPollModal}
                onClose={() => setShowPollModal(false)}
                conversationId={selectedConversation?.id}
                currentUserId={currentUser?.id}
            />

            {pollDetailsMessage && (
                <PollDetailsModal
                    isOpen={!!pollDetailsMessage}
                    onClose={() => setPollDetailsMessage(null)}
                    message={pollDetailsMessage}
                />
            )}

            {/* Group Members Modal */}
            <GroupMembersModal
                isOpen={showMembersModal}
                onClose={() => setShowMembersModal(false)}
                conversation={selectedConversation}
                currentUserId={currentUser?.id}
                onLeaveGroup={async (convId) => {
                    await supabase
                        .from('conversation_members')
                        .delete()
                        .eq('conversation_id', convId)
                        .eq('user_id', currentUser?.id);
                    setSelectedConversation(null);
                    fetchConversations();
                }}
            />
        </div>
    );
};

export default MessagingModule;
