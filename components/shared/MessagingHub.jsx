import React, { useState, useEffect } from 'react';
import { MessageCircle, Users, Building2, Search, Paperclip, Send, X, Plus, User, Trash2, Reply, Smile, ChevronDown, PieChart, Info } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import {
    getConversationsByCategory,
    getConversationMessages,
    sendMessage,
    subscribeToConversation,
    unsubscribeFromConversation,
    getUserDetails,
    getOrgUsers,
    createDMConversation,
    createTeamConversation,
    getOrCreateOrgConversation,

    updateConversationIndex,
    getMessageReactions
} from '../../services/messageService';
import { sendNotification } from '../../services/notificationService';
import { useMessages } from './context/MessageContext';
import PollMessage from './PollMessage';
import CreatePollModal from './CreatePollModal';
import PollDetailsModal from './PollDetailsModal';
import './MessagingHub.css';

const MessagingHub = () => {
    const [activeCategory, setActiveCategory] = useState('myself');
    const [conversations, setConversations] = useState([]);
    const [conversationCache, setConversationCache] = useState({}); // Cache conversations by category
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageInput, setMessageInput] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [currentUserRole, setCurrentUserRole] = useState(null);
    const [currentUserOrgId, setCurrentUserOrgId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewDMModal, setShowNewDMModal] = useState(false);
    const [orgUsers, setOrgUsers] = useState([]);
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [errorMessage, setErrorMessage] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [selectedTeamMembers, setSelectedTeamMembers] = useState([]);
    const [teamName, setTeamName] = useState('');
    const [authLoading, setAuthLoading] = useState(true);
    const { markAsRead, lastReadTimes } = useMessages();
    const [showMembersModal, setShowMembersModal] = useState(false);
    const [currentMembers, setCurrentMembers] = useState([]);
    const [hoveredMessageId, setHoveredMessageId] = useState(null);
    const [replyToMessage, setReplyToMessage] = useState(null); // For WhatsApp-style reply
    const [showReactionPickerForId, setShowReactionPickerForId] = useState(null); // For emoji reactions
    const [activeDropdownId, setActiveDropdownId] = useState(null); // For message actions dropdown
    const [showPollModal, setShowPollModal] = useState(false);
    const [showPollDetails, setShowPollDetails] = useState(false);
    const [selectedPollMessage, setSelectedPollMessage] = useState(null);
    const [pollMemberCount, setPollMemberCount] = useState(0);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [messageSearchTerm, setMessageSearchTerm] = useState('');
    const [showReactionsModal, setShowReactionsModal] = useState(false);
    const [reactionDetails, setReactionDetails] = useState({});
    const [reactionModalLoading, setReactionModalLoading] = useState(false);
    const [activeReactionTab, setActiveReactionTab] = useState('All');

    // Quick reaction emojis (like WhatsApp)
    const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

    const handleOpenPollDetails = async (msg) => {
        setSelectedPollMessage(msg);
        setShowPollDetails(true);

        if (!selectedConversation) {
            setPollMemberCount(0);
            return;
        }

        if (selectedConversation.type === 'everyone') {
            setPollMemberCount(orgUsers.length);
        } else if (selectedConversation.type === 'dm') {
            setPollMemberCount(2);
        } else if (selectedConversation.type === 'team') {
            try {
                // Fetch member count for this team
                const { count } = await supabase
                    .from('conversation_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversation_id', selectedConversation.id);
                setPollMemberCount(count || 0);
            } catch (error) {
                console.error("Error fetching poll member count", error);
                setPollMemberCount(0);
            }
        } else {
            setPollMemberCount(0);
        }
    };

    const getSenderName = (senderId) => {
        const user = orgUsers.find(u => u.id === senderId);
        return user?.full_name || user?.email || 'Unknown';
    };

    const fetchConversationMembers = async () => {
        if (!selectedConversation) return;

        if (selectedConversation.type === 'everyone') {
            setCurrentMembers(orgUsers);
            setShowMembersModal(true);
            return;
        }

        try {
            const { data } = await supabase
                .from('conversation_members')
                .select('user_id')
                .eq('conversation_id', selectedConversation.id);

            if (data) {
                const memberIds = data.map(m => m.user_id);
                const members = orgUsers.filter(u => memberIds.includes(u.id));
                setCurrentMembers(members);
                setShowMembersModal(true);
            }
        } catch (err) {
            console.error('Error fetching members:', err);
        }
    };

    const formatDividerDate = (dateString) => {
        const date = new Date(dateString);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
            });
        }
    };

    // Get current user from Supabase auth
    useEffect(() => {
        const fetchCurrentUser = async () => {
            setAuthLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();

                if (user) {
                    setCurrentUserId(user.id);

                    // Fetch user profile to get org_id and role
                    const { data: profile, error } = await supabase
                        .from('profiles')
                        .select('org_id, role')
                        .eq('id', user.id)
                        .single();

                    if (!error && profile) {
                        setCurrentUserOrgId(profile.org_id);
                        setCurrentUserRole(profile.role?.toLowerCase());
                        // Always load org users - the function handles null org_id
                        loadOrgUsers(profile.org_id, profile.role?.toLowerCase(), user.id);
                    } else {
                        // Even if no profile, try to load users for executive
                        console.log('No profile found, attempting to load all users');
                        loadOrgUsers(null, 'executive', user.id);
                    }
                }
            } catch (err) {
                console.error('Error fetching current user:', err);
            } finally {
                setAuthLoading(false);
            }
        };

        fetchCurrentUser();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                fetchCurrentUser();
            } else if (event === 'SIGNED_OUT') {
                setCurrentUserId(null);
                setCurrentUserRole(null);
                setCurrentUserOrgId(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Load all users for messaging (Everyone can see everyone)
    const loadOrgUsers = async (orgId, userRole, userId) => {
        try {
            console.log('Loading all users for messaging...');

            const { data, error } = await supabase
                .from('profiles')
                .select('id, email, full_name, avatar_url, role')
                .order('full_name', { ascending: true, nullsFirst: false });

            if (error) {
                console.error('Error fetching users:', error);
            } else {
                console.log('Found users:', data?.length);
                setOrgUsers(data || []);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };

    // Load conversations when category changes
    useEffect(() => {
        if (currentUserId) {
            loadConversations();
        }
    }, [activeCategory, currentUserId]);

    // Live Sidebar Updates: Subscribe to conversation_indexes to update chat list in real-time
    useEffect(() => {
        const channel = supabase.channel('sidebar-updates')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for INSERT and UPDATE
                    schema: 'public',
                    table: 'conversation_indexes'
                },
                (payload) => {
                    const { new: newRecord } = payload;
                    if (!newRecord) return;

                    setConversations(prev => {
                        // Only update if we have this conversation in our list
                        const exists = prev.find(c => c.id === newRecord.conversation_id);
                        if (!exists) return prev;

                        // Create updated conversation object
                        const updatedConversation = {
                            ...exists,
                            conversation_indexes: [newRecord]
                        };

                        // Remove old version and add new version at the top
                        // This handles both content updates (deleted message) and reordering (new message)
                        const otherConversations = prev.filter(c => c.id !== newRecord.conversation_id);
                        return [updatedConversation, ...otherConversations];
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Subscribe to real-time updates for selected conversation
    useEffect(() => {
        let subscription = null;

        if (selectedConversation) {
            subscription = subscribeToConversation(selectedConversation.id, async (payload) => {
                const { eventType, new: newMessage, old: oldMessage } = payload;

                if (eventType === 'INSERT') {
                    // Always fetch full details including attachments
                    const { data: fullMsg } = await supabase
                        .from('messages')
                        .select(`
                            *,
                            attachments(*),
                            reply_to:reply_to_id(id, content, sender_user_id),
                            poll_options(
                                id, 
                                option_text,
                                poll_votes(user_id)
                            )
                        `)
                        .eq('id', newMessage.id)
                        .single();

                    let messageToAdd = fullMsg || newMessage;

                    if (messageToAdd.message_type === 'poll') {
                        messageToAdd = {
                            ...messageToAdd,
                            poll_options: messageToAdd.poll_options?.map(opt => ({
                                ...opt,
                                votes: opt.poll_votes?.length || 0,
                                userVoted: currentUserId ? opt.poll_votes?.some(v => v.user_id === currentUserId) : false
                            })) || []
                        };
                    }

                    setMessages(prev => {
                        if (prev.some(msg => msg.id === newMessage.id)) return prev;
                        return [...prev, messageToAdd];
                    });
                } else if (eventType === 'UPDATE') {
                    setMessages(prev =>
                        prev.map(msg =>
                            msg.id === newMessage.id ? { ...msg, ...newMessage } : msg
                        )
                    );
                } else if (eventType === 'DELETE') {
                    setMessages(prev => prev.filter(msg => msg.id !== oldMessage.id));
                }
            });
        }

        // Subscribe to poll votes for real-time updates
        let voteSubscription = null;
        if (selectedConversation) {
            voteSubscription = supabase
                .channel(`poll-votes-${selectedConversation.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'poll_votes'
                    },
                    async (payload) => {
                        const { data: updatedMessages } = await supabase
                            .from('messages')
                            .select(`
                                *,
                                attachments(*),
                                reply_to:reply_to_id(id, content, sender_user_id),
                                poll_options(
                                    id, 
                                    option_text,
                                    poll_votes(user_id)
                                )
                            `)
                            .eq('conversation_id', selectedConversation.id)
                            .order('created_at', { ascending: true });

                        const processed = updatedMessages?.map(msg => {
                            if (msg.message_type === 'poll' && msg.poll_options) {
                                return {
                                    ...msg,
                                    poll_options: msg.poll_options.map(opt => ({
                                        ...opt,
                                        votes: opt.poll_votes?.length || 0,
                                        userVoted: opt.poll_votes?.some(v => v.user_id === currentUserId)
                                    }))
                                };
                            }
                            return msg;
                        });

                        if (processed) setMessages(processed);
                    }
                )
                .subscribe();
        }

        return () => {
            if (subscription) {
                unsubscribeFromConversation(subscription);
            }
            if (voteSubscription) {
                supabase.removeChannel(voteSubscription);
            }
        };
    }, [selectedConversation, currentUserId]);

    const loadConversations = async () => {
        if (!currentUserId) {
            console.warn('Cannot load conversations: No user ID');
            return;
        }

        // Check if we have cached conversations for this category
        if (conversationCache[activeCategory]) {
            console.log('Using cached conversations for', activeCategory);
            setConversations(conversationCache[activeCategory]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const convs = await getConversationsByCategory(currentUserId, activeCategory, currentUserOrgId);

            // For DM conversations, fetch the other user's name
            let finalConvs = convs;
            if (activeCategory === 'myself') {
                const convsWithNames = await Promise.all(convs.map(async (conv) => {
                    if (conv.type === 'dm' && !conv.name) {
                        // Get conversation members
                        const { data: members } = await supabase
                            .from('conversation_members')
                            .select('user_id')
                            .eq('conversation_id', conv.id);

                        // Find the other user (not current user)
                        const otherUserId = members?.find(m => m.user_id !== currentUserId)?.user_id;

                        if (otherUserId) {
                            // Get other user's profile
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('full_name, email')
                                .eq('id', otherUserId)
                                .single();

                            return {
                                ...conv,
                                name: profile?.full_name || profile?.email || 'User',
                                otherUserId: otherUserId
                            };
                        }
                    }
                    return conv;
                }));
                finalConvs = convsWithNames;
            }

            setConversations(finalConvs);
            // Cache the conversations for this category
            setConversationCache(prev => ({
                ...prev,
                [activeCategory]: finalConvs
            }));
        } catch (error) {
            console.error('Error loading conversations:', error);
            // Don't crash the app, just show empty state
            setConversations([]);
        } finally {
            setLoading(false);
        }
    };

    const loadMessages = async (conversation) => {
        setSelectedConversation(conversation);
        setLoading(true);

        // Mark conversation as read globally
        markAsRead(conversation.id);

        try {
            const msgs = await getConversationMessages(conversation.id, currentUserId);
            setMessages(msgs);
        } catch (error) {
            console.error('Error loading messages:', error);
            // Show empty messages instead of crashing
            setMessages([]);
        } finally {
            setLoading(false);
        }
    };

    // Delete Functions
    const deleteMessageForEveryone = async (messageId) => {
        const msg = messages.find(m => m.id === messageId);
        if (msg) {
            const timeDiff = (new Date() - new Date(msg.created_at)) / (1000 * 60);
            if (timeDiff > 5) {
                alert('Messages can only be deleted within 5 minutes of sending.');
                return;
            }
        }
        if (!confirm('Are you sure you want to delete this message for everyone?')) return;
        try {
            const { error } = await supabase
                .from('messages')
                .update({
                    content: 'This message was deleted',
                    is_deleted: true
                })
                .eq('id', messageId);

            if (error) throw error;

            // Update conversation index so sidebar shows "This message was deleted"
            if (msg) {
                await updateConversationIndex(msg.conversation_id, 'This message was deleted');
            }

            setMessages(prev => prev.map(m =>
                m.id === messageId
                    ? { ...m, content: 'This message was deleted', is_deleted: true, attachments: [] }
                    : m
            ));

            // Refresh conversation list to show updated preview
            // Update local state immediately for instant feedback
            setConversations(prev => prev.map(c => {
                if (c.id === msg.conversation_id && c.conversation_indexes?.[0]) {
                    return {
                        ...c,
                        conversation_indexes: [{
                            ...c.conversation_indexes[0],
                            last_message: 'This message was deleted'
                        }]
                    };
                }
                return c;
            }));

            // Also clear cache to ensure reload fetches fresh data
            setConversationCache(prev => {
                const newCache = { ...prev };
                delete newCache[activeCategory];
                return newCache;
            });

        } catch (err) {
            console.error('Error deleting message for everyone:', err);
            alert(`Failed to delete message: ${err.message || 'Unknown error'}`);
        }
    };

    const deleteMessageForMe = async (messageId) => {
        const msg = messages.find(m => m.id === messageId);
        if (msg) {
            const timeDiff = (new Date() - new Date(msg.created_at)) / (1000 * 60);
            if (timeDiff > 5) {
                alert('Messages can only be deleted within 5 minutes of sending.');
                return;
            }
        }
        try {
            const { data: currentMsg } = await supabase
                .from('messages')
                .select('deleted_for')
                .eq('id', messageId)
                .single();

            const currentDeletedFor = currentMsg?.deleted_for || [];
            if (!currentDeletedFor.includes(currentUserId)) {
                const { error } = await supabase
                    .from('messages')
                    .update({
                        deleted_for: [...currentDeletedFor, currentUserId]
                    })
                    .eq('id', messageId);

                if (error) throw error;

                setMessages(prev => prev.filter(m => m.id !== messageId));
            }
        } catch (err) {
            console.error('Error deleting message for me:', err);
            alert(`Failed to delete message: ${err.message || 'Unknown error'}`);
        }
    };

    // Handle emoji reactions
    const handleReaction = async (messageId, emoji) => {
        try {
            const message = messages.find(m => m.id === messageId);
            if (!message) return;

            // Get current reactions or initialize empty object
            const currentReactions = message.reactions || {};

            // Check if user already reacted with this emoji
            const userReactions = currentReactions[emoji] || [];
            const hasReacted = userReactions.includes(currentUserId);

            let updatedReactions;
            if (hasReacted) {
                // Remove user's reaction
                updatedReactions = {
                    ...currentReactions,
                    [emoji]: userReactions.filter(id => id !== currentUserId)
                };
                // Clean up empty arrays
                if (updatedReactions[emoji].length === 0) {
                    delete updatedReactions[emoji];
                }
            } else {
                // Add user's reaction
                updatedReactions = {
                    ...currentReactions,
                    [emoji]: [...userReactions, currentUserId]
                };
            }

            // Update in database
            const { error } = await supabase
                .from('messages')
                .update({ reactions: updatedReactions })
                .eq('id', messageId);

            if (error) throw error;

            // Update local state
            setMessages(prev => prev.map(m =>
                m.id === messageId ? { ...m, reactions: updatedReactions } : m
            ));

            // Hide reaction picker
            setShowReactionPickerForId(null);
        } catch (err) {
            console.error('Error adding reaction:', err);
        }
    };

    const handleViewReactions = (msg) => {
        setShowReactionsModal(true);
        setReactionDetails({});
        setActiveReactionTab('All');
        setReactionModalLoading(false);

        if (!msg.reactions) return;

        const details = {};
        Object.entries(msg.reactions).forEach(([emoji, userIds]) => {
            if (Array.isArray(userIds)) {
                details[emoji] = userIds.map(id => {
                    const user = orgUsers.find(u => u.id === id);
                    return {
                        userId: id,
                        name: user?.full_name || user?.email || 'Unknown User',
                        avatar: user?.avatar_url
                    };
                });
            }
        });
        setReactionDetails(details);
    };

    const handleSendMessage = async () => {
        if (!messageInput.trim() && attachments.length === 0) return;
        if (!selectedConversation) return;

        try {
            let conversationId = selectedConversation.id;

            // If this is a temporary conversation, create a real one first
            if (selectedConversation.temp && selectedConversation.otherUser) {
                console.log('Creating real conversation for temp chat...');
                const realConversation = await createDMConversation(
                    currentUserId,
                    selectedConversation.otherUser.id,
                    currentUserOrgId
                );
                conversationId = realConversation.id;

                // Update the selected conversation to the real one
                setSelectedConversation({
                    ...realConversation,
                    name: selectedConversation.otherUser.full_name || selectedConversation.otherUser.email
                });
            }

            const newMessage = await sendMessage(
                conversationId,
                currentUserId,
                messageInput,
                attachments,
                replyToMessage?.id // Pass reply reference
            );

            // Optimistically add message to state to fix "No messages yet" glitch
            setMessages(prev => {
                const exists = prev.some(m => m.id === newMessage.id);
                if (exists) return prev;
                return [...prev, { ...newMessage, reply_to: replyToMessage }];
            });

            setMessageInput('');
            setAttachments([]);
            setReplyToMessage(null); // Clear reply
            setErrorMessage(null);

            // Send notifications to other conversation members
            try {
                // Get current user's name
                const { data: senderProfile } = await supabase
                    .from('profiles')
                    .select('full_name')
                    .eq('id', currentUserId)
                    .single();

                const senderName = senderProfile?.full_name || 'Someone';

                // Get all members of the conversation except current user
                const { data: members } = await supabase
                    .from('conversation_members')
                    .select('user_id')
                    .eq('conversation_id', conversationId)
                    .neq('user_id', currentUserId);

                // Send notification to each member
                if (members && members.length > 0) {
                    for (const member of members) {
                        await sendNotification(
                            member.user_id,
                            currentUserId,
                            senderName,
                            `New message from ${senderName}`,
                            'message'
                        );
                    }
                }
            } catch (notifError) {
                console.error('Error sending message notifications:', notifError);
                // Don't fail the whole message send if notifications fail
            }

            // Invalidate cache and reload conversations to show the new message
            setConversationCache(prev => {
                const newCache = { ...prev };
                delete newCache[activeCategory];
                return newCache;
            });
            loadConversations();
        } catch (error) {
            console.error('Error sending message:', error);
            // Check for specific errors
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                setErrorMessage('Messaging tables not set up. Please run the SQL setup script in Supabase.');
            } else if (error.code === '22P02') {
                setErrorMessage('Invalid conversation. Please try starting a new chat.');
            } else {
                setErrorMessage(`Failed to send message: ${error.message || 'Unknown error'}`);
            }
        }
    };

    const handleFileAttachment = (e) => {
        const files = Array.from(e.target.files);
        setAttachments(prev => [...prev, ...files]);
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handlePaste = (e) => {
        if (e.clipboardData && e.clipboardData.items) {
            const items = e.clipboardData.items;
            const files = [];

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        files.push(file);
                    }
                }
            }

            if (files.length > 0) {
                e.preventDefault(); // Prevent pasting the image binary string into text input
                setAttachments(prev => [...prev, ...files]);
            }
        }
    };

    const startNewDM = async (userId) => {
        try {
            console.log('Starting DM with user:', userId);
            setLoading(true);

            // Find the selected user info for display
            const user = orgUsers.find(u => u.id === userId);
            setSelectedUser(user);

            const conversation = await createDMConversation(currentUserId, userId, currentUserOrgId);
            setShowNewDMModal(false);
            setUserSearchQuery('');
            setErrorMessage(null);
            // Invalidate cache for 'myself' category
            setConversationCache(prev => {
                const newCache = { ...prev };
                delete newCache['myself'];
                return newCache;
            });
            loadConversations();
            loadMessages(conversation);
        } catch (error) {
            console.error('Error creating DM:', error);
            // Check if error is due to missing table
            if (error.message?.includes('does not exist') || error.code === '42P01') {
                setErrorMessage('Messaging database is not set up. Please run the setup_messaging_database.sql script in Supabase.');
            } else {
                setErrorMessage(`Failed to start conversation: ${error.message || 'Unknown error'}`);
            }
            // Keep the modal open so user can see the error
        } finally {
            setLoading(false);
        }
    };

    // Start a chat directly with a user (for quick action)
    const startChatWithUser = async (user) => {
        setSelectedUser(user);
        setShowNewDMModal(false);
        setUserSearchQuery('');
        // For now, just show the user is selected even if conversation can't be created
        setSelectedConversation({
            id: `temp_${user.id}`,
            type: 'dm',
            name: user.full_name || user.email,
            temp: true,
            otherUser: user
        });
        setMessages([]);
    };

    // Create a new team chat with selected members
    const createNewTeamChat = async () => {
        if (!teamName.trim() || selectedTeamMembers.length === 0) {
            setErrorMessage('Please enter a team name and select at least one member');
            return;
        }

        try {
            setLoading(true);
            const conversation = await createTeamConversation(
                currentUserId,
                selectedTeamMembers,
                teamName,
                currentUserOrgId
            );
            setShowTeamModal(false);
            setTeamName('');
            setSelectedTeamMembers([]);
            setErrorMessage(null);
            // Invalidate cache for 'team' category
            setConversationCache(prev => {
                const newCache = { ...prev };
                delete newCache['team'];
                return newCache;
            });
            loadConversations();
            loadMessages(conversation);
        } catch (error) {
            console.error('Error creating team chat:', error);
            setErrorMessage(`Failed to create team chat: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Join or create organization-wide chat
    const joinOrganizationChat = async () => {
        try {
            setLoading(true);
            const conversation = await getOrCreateOrgConversation(currentUserId, currentUserOrgId);
            setErrorMessage(null);
            // Invalidate cache for 'organization' category
            setConversationCache(prev => {
                const newCache = { ...prev };
                delete newCache['organization'];
                return newCache;
            });
            loadConversations();
            loadMessages(conversation);
        } catch (error) {
            console.error('Error joining org chat:', error);
            setErrorMessage(`Failed to join organization chat: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Toggle member selection for team chat
    const toggleTeamMember = (userId) => {
        setSelectedTeamMembers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const filteredConversations = conversations.filter(conv => {
        if (!searchQuery) return true;
        const lastMsg = conv.conversation_indexes?.[0]?.last_message || '';
        return lastMsg.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const categories = [
        { id: 'myself', label: 'Personal Chat', icon: MessageCircle, description: 'Personal Chat' },
        { id: 'team', label: 'Groups Chat', icon: Users, description: 'Groups Chat' },
        { id: 'organization', label: 'Company Chat', icon: Building2, description: 'Company Chat' }
    ];

    return (
        <div className="messaging-hub" style={{ margin: 0, padding: 0, display: 'grid' }}>
            {authLoading ? (
                <div className="loading-auth" style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid #f3f3f3', borderTop: '3px solid var(--accent, #6366f1)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
            ) : !currentUserId ? (
                <div className="login-prompt" style={{ padding: '2rem', textAlign: 'center' }}>
                    <p>Please log in to view your messages.</p>
                    <button onClick={() => {
                        window.location.href = '/login';
                    }} style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        Go to Login
                    </button>
                </div>
            ) : (
                // Category Selector
                <div className="category-sidebar">
                    <div className="category-header">
                        <h2>Messages</h2>
                    </div>
                    <div className="category-list">
                        {categories.map(category => {
                            const Icon = category.icon;
                            return (
                                <button
                                    key={category.id}
                                    title={category.label}
                                    className={`category-item ${activeCategory === category.id ? 'active' : ''}`}
                                    onClick={() => setActiveCategory(category.id)}
                                >
                                    <Icon size={20} />
                                    <div className="category-info">
                                        <span className="category-label">{category.label}</span>
                                        <span className="category-description">{category.description}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Conversation List */}
            <div className="conversation-sidebar">
                <div className="conversation-header">
                    {activeCategory === 'myself' && (
                        <button
                            className="new-dm-button"
                            onClick={() => setShowNewDMModal(true)}
                            title="New conversation"
                        >
                            +
                        </button>
                    )}
                    {activeCategory === 'team' && (
                        <button
                            className="new-dm-button"
                            onClick={() => setShowTeamModal(true)}
                            title="Create team chat"
                        >
                            +
                        </button>
                    )}
                    <div className="search-box">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Search conversations..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="conversation-list">
                    {loading && !selectedConversation ? (
                        <div className="loading-state">Loading conversations...</div>
                    ) : filteredConversations.length === 0 ? (
                        <div className="empty-state">
                            <MessageCircle size={48} />
                            <p>No conversations yet</p>
                            {activeCategory === 'myself' && (
                                <button onClick={() => setShowNewDMModal(true)}>
                                    Start a conversation
                                </button>
                            )}
                            {activeCategory === 'team' && (
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1rem' }}>
                                        Create a team chat to collaborate with your colleagues
                                    </p>
                                    <button
                                        onClick={() => setShowTeamModal(true)}
                                        style={{
                                            background: 'var(--accent, #6366f1)',
                                            color: 'white',
                                            border: 'none',
                                            padding: '0.75rem 1.5rem',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            margin: '0 auto'
                                        }}
                                    >
                                        <Plus size={18} />
                                        Create Team Chat
                                    </button>
                                </div>
                            )}
                            {activeCategory === 'organization' && (
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1rem' }}>
                                        Join the company-wide chat to connect with everyone
                                    </p>
                                    <button
                                        onClick={joinOrganizationChat}
                                        style={{
                                            background: 'var(--accent, #6366f1)',
                                            color: 'white',
                                            border: 'none',
                                            padding: '0.75rem 1.5rem',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            margin: '0 auto'
                                        }}
                                        disabled={loading}
                                    >
                                        <Building2 size={18} />
                                        {loading ? 'Joining...' : 'Join Company Chat'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        filteredConversations.map(conv => {
                            const lastMsgTime = conv.conversation_indexes?.[0]?.last_message_at ? new Date(conv.conversation_indexes[0].last_message_at).getTime() : 0;
                            const lastReadTime = lastReadTimes[conv.id] || 0;
                            const isUnread = lastMsgTime > lastReadTime;

                            return (
                                <div
                                    key={conv.id}
                                    className={`conversation-item ${selectedConversation?.id === conv.id ? 'active' : ''} ${isUnread ? 'unread' : ''}`}
                                    onClick={() => loadMessages(conv)}
                                >
                                    <div className="conversation-avatar">
                                        {conv.type === 'dm' ? <User size={20} /> : conv.type === 'team' ? <Users size={20} /> : <Building2 size={20} />}
                                    </div>
                                    <div className="conversation-info">
                                        <div className="conversation-name">
                                            {conv.name || 'Conversation'}
                                        </div>
                                        <div className="conversation-preview">
                                            {conv.conversation_indexes?.[0]?.last_message
                                                || (conv.conversation_indexes?.[0]?.last_message_at ? 'ðŸ“Ž Attachment' : 'No messages yet')}
                                        </div>
                                    </div>
                                    <div className="conversation-time">
                                        {conv.conversation_indexes?.[0]?.last_message_at ? (
                                            new Date(conv.conversation_indexes[0].last_message_at).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })
                                        ) : ''}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Message Thread */}
            <div className="message-thread">
                {selectedConversation ? (
                    <>
                        <div className="thread-header">
                            <div className="thread-info">
                                <h3>{selectedConversation.name || selectedConversation.otherUser?.full_name || 'Conversation'}</h3>
                                <span className="thread-type">
                                    {selectedConversation.type === 'dm' ? 'Direct Message' :
                                        selectedConversation.type === 'team' ? 'Team Chat' : 'Organization'}
                                </span>
                            </div>
                            {(selectedConversation.type === 'team' || selectedConversation.type === 'everyone') && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        onClick={() => setShowMessageSearch && setShowMessageSearch(!showMessageSearch)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid #e5e7eb',
                                            background: 'white',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            color: '#374151',
                                            fontWeight: 500
                                        }}
                                    >
                                        <Search size={14} />
                                        Search
                                    </button>
                                    <button
                                        onClick={fetchConversationMembers}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid #e5e7eb',
                                            background: 'white',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            color: '#374151',
                                            fontWeight: 500
                                        }}
                                    >
                                        <Users size={14} />
                                        Members
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Search Bar */}
                        {showMessageSearch && (
                            <div style={{ padding: '8px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                    <input
                                        type="text"
                                        placeholder="Search messages..."
                                        value={messageSearchTerm}
                                        onChange={(e) => setMessageSearchTerm(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px 8px 36px',
                                            borderRadius: '8px',
                                            border: '1px solid #e5e7eb',
                                            fontSize: '14px',
                                            outline: 'none'
                                        }}
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => { setShowMessageSearch(false); setMessageSearchTerm(''); }}
                                        style={{
                                            position: 'absolute',
                                            right: '8px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: '#9ca3af',
                                            padding: '4px'
                                        }}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="messages-container">
                            {selectedConversation.temp ? (
                                <div className="empty-messages" style={{ textAlign: 'center', padding: '2rem' }}>
                                    <MessageCircle size={48} style={{ marginBottom: '1rem', opacity: 0.5, color: '#6366f1' }} />
                                    <h4 style={{ marginBottom: '0.5rem', color: '#1f2937' }}>
                                        Chat with {selectedConversation.otherUser?.full_name || 'User'}
                                    </h4>
                                    <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                                        Send a message to start the conversation!
                                    </p>

                                </div>
                            ) : messages.length === 0 ? (
                                <div className="empty-messages">
                                    <p>No messages yet. Start the conversation!</p>
                                </div>
                            ) : (
                                messages
                                    .filter(msg => !messageSearchTerm || (msg.content && msg.content.toLowerCase().includes(messageSearchTerm.toLowerCase())))
                                    .map((msg, index) => {
                                        const prevMsg = messages[index - 1];
                                        const prevDate = prevMsg ? new Date(prevMsg.created_at).toDateString() : null;
                                        const currDate = new Date(msg.created_at).toDateString();
                                        const isNewDay = currDate !== prevDate;

                                        return (
                                            <React.Fragment key={msg.id}>
                                                {isNewDay && (
                                                    <div className="date-divider" style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        margin: '24px 0 12px 0',
                                                        position: 'relative'
                                                    }}>
                                                        <div style={{ height: '1px', background: '#e5e7eb', width: '100%', position: 'absolute' }}></div>
                                                        <span style={{
                                                            background: '#f9fafb',
                                                            padding: '0 16px',
                                                            fontSize: '11px',
                                                            color: '#6b7280',
                                                            fontWeight: 600,
                                                            zIndex: 1,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.05em'
                                                        }}>
                                                            {formatDividerDate(msg.created_at)}
                                                        </span>
                                                    </div>
                                                )}
                                                <div
                                                    className={`message ${msg.sender_user_id === currentUserId ? 'sent' : 'received'}`}
                                                    style={{ position: 'relative', group: 'message-group' }}
                                                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                                                    onMouseLeave={() => setHoveredMessageId(null)}
                                                >
                                                    <div className="message-bubble">
                                                        {/* Sender Name for Group Chats */}
                                                        {(selectedConversation.type === 'team' || selectedConversation.type === 'everyone') && msg.sender_user_id !== currentUserId && (
                                                            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px', marginLeft: '2px', fontWeight: 600 }}>
                                                                {getSenderName(msg.sender_user_id)}
                                                            </div>
                                                        )}
                                                        {/* Message Actions Dropdown */}
                                                        {!msg.is_deleted && (hoveredMessageId === msg.id || showReactionPickerForId === msg.id || activeDropdownId === msg.id) && (
                                                            <div
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: '-18px',
                                                                    right: msg.sender_user_id === currentUserId ? '0' : 'auto',
                                                                    left: msg.sender_user_id !== currentUserId ? '0' : 'auto',
                                                                    zIndex: 20,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '2px',
                                                                    background: 'white',
                                                                    borderRadius: '24px',
                                                                    padding: '2px 4px',
                                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                                                    border: '1px solid #e2e8f0',
                                                                    animation: 'fadeIn 0.15s ease'
                                                                }}
                                                            >
                                                                {/* Reply Button */}
                                                                <button
                                                                    onClick={() => setReplyToMessage(msg)}
                                                                    style={{ padding: '6px', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
                                                                    title="Reply"
                                                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                >
                                                                    <Reply size={15} />
                                                                </button>

                                                                {/* Reaction Button */}
                                                                <div style={{ position: 'relative' }}>
                                                                    <button
                                                                        onClick={() => { setShowReactionPickerForId(showReactionPickerForId === msg.id ? null : msg.id); setActiveDropdownId(null); }}
                                                                        style={{ padding: '6px', borderRadius: '50%', border: 'none', background: showReactionPickerForId === msg.id ? '#e0e7ff' : 'transparent', cursor: 'pointer', color: showReactionPickerForId === msg.id ? '#6366f1' : '#64748b', display: 'flex', alignItems: 'center' }}
                                                                        title="React"
                                                                        onMouseEnter={e => e.currentTarget.style.background = showReactionPickerForId === msg.id ? '#e0e7ff' : '#f1f5f9'}
                                                                        onMouseLeave={e => e.currentTarget.style.background = showReactionPickerForId === msg.id ? '#e0e7ff' : 'transparent'}
                                                                    >
                                                                        <Smile size={15} />
                                                                    </button>

                                                                    {/* Reaction Picker Popover */}
                                                                    {showReactionPickerForId === msg.id && (
                                                                        <div style={{
                                                                            position: 'absolute',
                                                                            bottom: '100%',
                                                                            left: msg.sender_user_id === currentUserId ? 'auto' : '-35px',
                                                                            right: msg.sender_user_id === currentUserId ? '-35px' : 'auto',
                                                                            marginBottom: '10px',
                                                                            background: 'white',
                                                                            borderRadius: '24px',
                                                                            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                                                            padding: '6px 8px',
                                                                            display: 'flex',
                                                                            gap: '6px',
                                                                            border: '1px solid #e2e8f0',
                                                                            zIndex: 50,
                                                                            whiteSpace: 'nowrap'
                                                                        }}>
                                                                            {QUICK_REACTIONS.map(emoji => (
                                                                                <button
                                                                                    key={emoji}
                                                                                    onClick={() => handleReaction(msg.id, emoji)}
                                                                                    style={{
                                                                                        border: 'none',
                                                                                        background: 'transparent',
                                                                                        fontSize: '20px',
                                                                                        cursor: 'pointer',
                                                                                        padding: '4px',
                                                                                        transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                                                                    }}
                                                                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                                                                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                                                >
                                                                                    {emoji}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Info/More Actions Button */}
                                                                <div style={{ position: 'relative' }}>
                                                                    <button
                                                                        onClick={() => { setActiveDropdownId(activeDropdownId === msg.id ? null : msg.id); setShowReactionPickerForId(null); }}
                                                                        style={{ padding: '6px', borderRadius: '50%', border: 'none', background: activeDropdownId === msg.id ? '#f1f5f9' : 'transparent', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
                                                                        title="More Options"
                                                                        onMouseEnter={e => e.currentTarget.style.background = activeDropdownId === msg.id ? '#f1f5f9' : '#f1f5f9'}
                                                                        onMouseLeave={e => e.currentTarget.style.background = activeDropdownId === msg.id ? '#f1f5f9' : 'transparent'}
                                                                    >
                                                                        <Info size={15} />
                                                                    </button>

                                                                    {/* Dropdown Menu */}
                                                                    {activeDropdownId === msg.id && (
                                                                        <div style={{
                                                                            position: 'absolute',
                                                                            top: '100%',
                                                                            right: msg.sender_user_id === currentUserId ? '0' : 'auto',
                                                                            left: msg.sender_user_id === currentUserId ? 'auto' : '0',
                                                                            marginTop: '6px',
                                                                            background: 'white',
                                                                            borderRadius: '8px',
                                                                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                                                                            border: '1px solid #e2e8f0',
                                                                            zIndex: 50,
                                                                            width: '180px',
                                                                            overflow: 'hidden',
                                                                            padding: '4px 0'
                                                                        }}>
                                                                            {/* Copy Content */}
                                                                            <button
                                                                                onClick={() => {
                                                                                    navigator.clipboard.writeText(msg.content || '');
                                                                                    setActiveDropdownId(null);
                                                                                }}
                                                                                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', color: '#334155' }}
                                                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                                                onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                                                            >
                                                                                <Paperclip size={14} /> Copy Text
                                                                            </button>

                                                                            {/* View Reactions */}
                                                                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                                                                <button
                                                                                    onClick={() => { handleViewReactions(msg); setActiveDropdownId(null); }}
                                                                                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', color: '#334155' }}
                                                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                                                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                                                                >
                                                                                    <Smile size={14} /> View Reactions
                                                                                </button>
                                                                            )}

                                                                            {/* Delete Options - Condition Logic Preserved */}
                                                                            {(msg.sender_user_id === currentUserId || activeDropdownId /* Admin logic could go here */) && (
                                                                                <>
                                                                                    <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }}></div>

                                                                                    <button
                                                                                        onClick={() => { deleteMessageForMe(msg.id); setActiveDropdownId(null); }}
                                                                                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', color: '#64748b' }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                                                                    >
                                                                                        <Trash2 size={14} /> Delete for me
                                                                                    </button>

                                                                                    {/* Delete for Everyone check (5 min) */}
                                                                                    {msg.sender_user_id === currentUserId && (new Date() - new Date(msg.created_at)) < 5 * 60 * 1000 && (
                                                                                        <button
                                                                                            onClick={() => { deleteMessageForEveryone(msg.id); setActiveDropdownId(null); }}
                                                                                            style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', color: '#ef4444' }}
                                                                                            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                                                                            onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                                                                        >
                                                                                            <Trash2 size={14} /> Delete for everyone
                                                                                        </button>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Quoted Reply Display */}
                                                        {msg.reply_to && (
                                                            <div style={{
                                                                background: msg.sender_user_id === currentUserId ? '#000000' : 'rgba(0,0,0,0.05)', // Solid Black
                                                                borderLeft: '3px solid ' + (msg.sender_user_id === currentUserId ? '#ffffff' : '#6366f1'),
                                                                padding: '8px 10px',
                                                                borderRadius: '6px',
                                                                marginBottom: '6px',
                                                                fontSize: '12px'
                                                            }}>
                                                                <div style={{ fontWeight: 600, fontSize: '11px', color: msg.sender_user_id === currentUserId ? '#ffffff' : '#6366f1', marginBottom: '2px' }}>
                                                                    {msg.reply_to.sender_user_id === currentUserId ? 'You' : getSenderName(msg.reply_to.sender_user_id)}
                                                                </div>
                                                                <div style={{ color: msg.sender_user_id === currentUserId ? '#ffffff' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                                                                    {msg.reply_to.content || '📎 Attachment'}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="message-content" style={{ fontStyle: msg.is_deleted ? 'italic' : 'normal', color: msg.is_deleted ? '#94a3b8' : 'inherit' }}>
                                                            {msg.is_deleted && <Trash2 size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />}

                                                            {msg.message_type === 'poll' && !msg.is_deleted ? (
                                                                <PollMessage
                                                                    message={msg}
                                                                    currentUserId={currentUserId}
                                                                    onViewVotes={() => handleOpenPollDetails(msg)}
                                                                />
                                                            ) : (
                                                                msg.content
                                                            )}
                                                        </div>
                                                        {msg.attachments && msg.attachments.length > 0 && (
                                                            <div className="message-attachments">
                                                                {msg.attachments.map(att => (
                                                                    <a
                                                                        key={att.id}
                                                                        href={att.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="attachment-link"
                                                                    >
                                                                        📎 {att.file_name}
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="message-time">
                                                            {new Date(msg.created_at).toLocaleTimeString([], {
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </div>

                                                        {/* Reactions Display - Floating Badge Style */}
                                                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                                            <div style={{
                                                                display: 'flex',
                                                                flexWrap: 'wrap',
                                                                gap: '4px',
                                                                marginTop: '6px',
                                                                marginBottom: '-2px'
                                                            }}>
                                                                {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                                                                    if (!userIds || userIds.length === 0) return null;
                                                                    const hasMyReaction = userIds.includes(currentUserId);
                                                                    return (
                                                                        <button
                                                                            key={emoji}
                                                                            onClick={() => handleReaction(msg.id, emoji)}
                                                                            style={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                padding: '2px 8px',
                                                                                borderRadius: '12px',
                                                                                border: hasMyReaction ? '1px solid #818cf8' : '1px solid rgba(0,0,0,0.06)',
                                                                                background: hasMyReaction
                                                                                    ? '#eef2ff'
                                                                                    : '#ffffff',
                                                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.2s ease',
                                                                                transform: 'scale(1)',
                                                                                minHeight: '22px'
                                                                            }}
                                                                            title={userIds.map(id => id === currentUserId ? 'You' : getSenderName(id)).join(', ')}
                                                                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                                        >
                                                                            <span style={{ fontSize: '14px', lineHeight: 1 }}>{emoji}</span>
                                                                            {userIds.length > 1 && (
                                                                                <span style={{
                                                                                    fontSize: '11px',
                                                                                    fontWeight: 600,
                                                                                    color: hasMyReaction ? '#4f46e5' : '#64748b',
                                                                                    minWidth: '10px',
                                                                                    textAlign: 'center'
                                                                                }}>
                                                                                    {userIds.length}
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                        );
                                    })
                            )}
                        </div>

                        <div className="message-input-container">
                            {/* Error Banner */}
                            {errorMessage && (
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    marginBottom: '0.5rem',
                                    background: '#fee2e2',
                                    border: '1px solid #fca5a5',
                                    borderRadius: '8px',
                                    color: '#b91c1c',
                                    fontSize: '13px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span>{errorMessage}</span>
                                    <button
                                        onClick={() => setErrorMessage(null)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Reply Preview Bar */}
                            {replyToMessage && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 14px',
                                    marginBottom: '8px',
                                    background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
                                    borderRadius: '10px',
                                    border: '1px solid #c4b5fd',
                                    borderLeft: '4px solid #6366f1'
                                }}>
                                    <Reply size={18} style={{ color: '#6366f1', flexShrink: 0 }} />
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#6366f1', marginBottom: '2px' }}>
                                            Replying to {replyToMessage.sender_user_id === currentUserId ? 'yourself' : getSenderName(replyToMessage.sender_user_id)}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {replyToMessage.content || '📎 Attachment'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setReplyToMessage(null)}
                                        style={{
                                            background: 'white',
                                            border: '1px solid #c4b5fd',
                                            borderRadius: '50%',
                                            width: '24px',
                                            height: '24px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            flexShrink: 0
                                        }}
                                    >
                                        <X size={14} style={{ color: '#6366f1' }} />
                                    </button>
                                </div>
                            )}

                            {attachments.length > 0 && (
                                <div className="attachments-preview">
                                    {attachments.map((file, index) => (
                                        <div key={index} className="attachment-chip">
                                            <span>{file.name}</span>
                                            <button onClick={() => removeAttachment(index)}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="message-input-box">
                                <label className="attachment-button">
                                    <Paperclip size={20} />
                                    <input
                                        type="file"
                                        multiple
                                        onChange={handleFileAttachment}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                                <button
                                    className="attachment-button"
                                    onClick={() => setShowPollModal(true)}
                                    title="Create Poll"
                                >
                                    <PieChart size={20} />
                                </button>
                                <input
                                    type="text"
                                    placeholder="Type a message... (Paste images directly)"
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    onPaste={handlePaste}
                                />
                                <button
                                    className="send-button"
                                    onClick={handleSendMessage}
                                    disabled={!messageInput.trim() && attachments.length === 0}
                                >
                                    <Send size={20} />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="no-conversation-selected">
                        <MessageCircle size={64} />
                        <h3>Select a conversation</h3>
                        <p>Choose a conversation from the list to start messaging</p>
                    </div>
                )}
            </div>

            {/* New DM Modal */}
            {
                showNewDMModal && (
                    <div className="modal-overlay" onClick={() => { setShowNewDMModal(false); setUserSearchQuery(''); setErrorMessage(null); }}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ minWidth: '400px' }}>
                            <div className="modal-header">
                                <h3>Start a new conversation</h3>
                                <button onClick={() => { setShowNewDMModal(false); setUserSearchQuery(''); setErrorMessage(null); }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                {/* Error Message Display */}
                                {errorMessage && (
                                    <div style={{
                                        padding: '0.75rem 1rem',
                                        marginBottom: '1rem',
                                        background: '#fee2e2',
                                        border: '1px solid #fca5a5',
                                        borderRadius: '8px',
                                        color: '#b91c1c',
                                        fontSize: '14px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span>{errorMessage}</span>
                                        <button
                                            onClick={() => setErrorMessage(null)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                )}

                                <div className="user-search" style={{ marginBottom: '1rem' }}>
                                    <div className="search-box" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#f5f5f5', borderRadius: '8px' }}>
                                        <Search size={18} style={{ color: '#888' }} />
                                        <input
                                            type="text"
                                            placeholder="Search employees by name or role..."
                                            value={userSearchQuery}
                                            onChange={(e) => setUserSearchQuery(e.target.value)}
                                            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '14px' }}
                                            autoFocus
                                        />
                                        {userSearchQuery && (
                                            <button
                                                onClick={() => setUserSearchQuery('')}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                            >
                                                <X size={16} style={{ color: '#888' }} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {loading && (
                                    <div style={{ textAlign: 'center', padding: '1rem', color: '#888' }}>
                                        <div className="spinner" style={{
                                            width: '24px',
                                            height: '24px',
                                            border: '3px solid #f3f3f3',
                                            borderTop: '3px solid var(--accent, #6366f1)',
                                            borderRadius: '50%',
                                            animation: 'spin 1s linear infinite',
                                            margin: '0 auto 0.5rem'
                                        }} />
                                        <p>Starting conversation...</p>
                                    </div>
                                )}

                                <div className="user-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    {orgUsers.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                                            <Users size={48} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                            <p>No employees found</p>
                                        </div>
                                    ) : (
                                        orgUsers
                                            .filter(user => user.id !== currentUserId)
                                            .filter(user => {
                                                if (!userSearchQuery) return true;
                                                const query = userSearchQuery.toLowerCase();
                                                return (
                                                    (user.full_name?.toLowerCase() || '').includes(query) ||
                                                    (user.email?.toLowerCase() || '').includes(query) ||
                                                    (user.role?.toLowerCase() || '').includes(query)
                                                );
                                            })
                                            .map(user => (
                                                <div
                                                    key={user.id}
                                                    className="user-item"
                                                    onClick={() => startChatWithUser(user)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        padding: '12px',
                                                        cursor: 'pointer',
                                                        borderRadius: '8px',
                                                        transition: 'background 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div className="user-avatar" style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        borderRadius: '50%',
                                                        background: '#e5e7eb',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '16px',
                                                        fontWeight: 'bold',
                                                        color: '#6366f1'
                                                    }}>
                                                        {user.avatar_url ? (
                                                            <img src={user.avatar_url} alt={user.full_name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                                        ) : (
                                                            (user.full_name?.[0] || user.email?.[0] || '?').toUpperCase()
                                                        )}
                                                    </div>
                                                    <div className="user-info" style={{ flex: 1 }}>
                                                        <div className="user-name" style={{ fontWeight: '500', color: '#1f2937' }}>
                                                            {user.full_name || user.email}
                                                        </div>
                                                        <div className="user-role" style={{ fontSize: '12px', color: '#6b7280', textTransform: 'capitalize' }}>
                                                            {user.role}
                                                        </div>
                                                    </div>
                                                    <MessageCircle size={18} style={{ color: '#9ca3af' }} />
                                                </div>
                                            ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Team Chat Modal */}
            {
                showTeamModal && (
                    <div className="modal-overlay" onClick={() => { setShowTeamModal(false); setTeamName(''); setSelectedTeamMembers([]); setErrorMessage(null); }}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%', maxHeight: '80vh', background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
                            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Create Team Chat</h2>
                                <button onClick={() => { setShowTeamModal(false); setTeamName(''); setSelectedTeamMembers([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Error Message */}
                            {errorMessage && (
                                <div style={{ padding: '0.75rem', marginBottom: '1rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', fontSize: '14px' }}>
                                    {errorMessage}
                                </div>
                            )}

                            {/* Team Name Input */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>Team Name</label>
                                <input
                                    type="text"
                                    placeholder="Enter team name..."
                                    value={teamName}
                                    onChange={(e) => setTeamName(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}
                                />
                            </div>

                            {/* Member Selection */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                                    Select Members ({selectedTeamMembers.length} selected)
                                </label>
                                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                                    {orgUsers.filter(u => u.id !== currentUserId).length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                                            No team members available
                                        </div>
                                    ) : (
                                        orgUsers
                                            .filter(u => u.id !== currentUserId)
                                            .map(user => (
                                                <div
                                                    key={user.id}
                                                    onClick={() => toggleTeamMember(user.id)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        padding: '12px',
                                                        cursor: 'pointer',
                                                        borderBottom: '1px solid #f3f4f6',
                                                        background: selectedTeamMembers.includes(user.id) ? '#eef2ff' : 'transparent'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTeamMembers.includes(user.id)}
                                                        onChange={() => { }}
                                                        style={{ width: '18px', height: '18px', accentColor: '#6366f1' }}
                                                    />
                                                    <div style={{
                                                        width: '36px',
                                                        height: '36px',
                                                        borderRadius: '50%',
                                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: 'white',
                                                        fontWeight: '600',
                                                        fontSize: '14px'
                                                    }}>
                                                        {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: '500', color: '#1f2937' }}>
                                                            {user.full_name || user.email}
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'capitalize' }}>
                                                            {user.role}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </div>
                            </div>

                            {/* Create Button */}
                            <button
                                onClick={createNewTeamChat}
                                disabled={loading || !teamName.trim() || selectedTeamMembers.length === 0}
                                style={{
                                    width: '100%',
                                    padding: '0.875rem',
                                    background: loading || !teamName.trim() || selectedTeamMembers.length === 0 ? '#d1d5db' : 'var(--accent, #6366f1)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: loading || !teamName.trim() || selectedTeamMembers.length === 0 ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '15px'
                                }}
                            >
                                {loading ? 'Creating...' : 'Create Team Chat'}
                            </button>
                        </div>
                    </div>
                )
            }

            {/* View Members Modal */}
            {
                showMembersModal && (
                    <div className="modal-overlay" onClick={() => setShowMembersModal(false)}>
                        <div onClick={e => e.stopPropagation()} style={{
                            maxWidth: '380px',
                            width: '90%',
                            background: 'white',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
                        }}>
                            {/* Purple Gradient Header */}
                            <div style={{
                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                padding: '20px 24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <h2 style={{
                                    margin: 0,
                                    fontSize: '1.125rem',
                                    color: 'white',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <Users size={20} />
                                    Group Members ({currentMembers.length})
                                </h2>
                                <button
                                    onClick={() => setShowMembersModal(false)}
                                    style={{
                                        background: 'rgba(255,255,255,0.2)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '6px',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white'
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Members List */}
                            <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '16px' }}>
                                {currentMembers.map(user => {
                                    const isAdmin = selectedConversation?.admin_ids?.includes(user.id);
                                    const displayRole = user.role === 'executive' ? 'Tutor' :
                                        user.role === 'manager' ? 'Mentor' :
                                            user.role === 'team_lead' ? 'Project Mentor' :
                                                user.role === 'employee' ? 'Student' : user.role;

                                    return (
                                        <div
                                            key={user.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '10px 0',
                                                borderBottom: '1px solid #f3f4f6'
                                            }}
                                        >
                                            <div style={{
                                                width: '48px',
                                                height: '48px',
                                                borderRadius: '50%',
                                                background: '#e5e7eb',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '18px',
                                                fontWeight: 'bold',
                                                color: '#6366f1',
                                                overflow: 'hidden'
                                            }}>
                                                {user.avatar_url ? (
                                                    <img
                                                        src={user.avatar_url}
                                                        alt={user.full_name}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                ) : (
                                                    (user.full_name?.[0] || user.email?.[0] || '?').toUpperCase()
                                                )}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 600, color: '#1f2937' }}>
                                                        {user.full_name || user.email}
                                                    </span>
                                                    {isAdmin && (
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '2px 8px',
                                                            background: '#eef2ff',
                                                            color: '#4f46e5',
                                                            borderRadius: '4px',
                                                            fontSize: '10px',
                                                            fontWeight: 600,
                                                            textTransform: 'uppercase'
                                                        }}>
                                                            ◇ ADMIN
                                                        </span>
                                                    )}
                                                    {user.id === currentUserId && (
                                                        <span style={{ color: '#9ca3af', fontSize: '13px' }}>(You)</span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                                                    {displayRole}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Leave Group Button */}
                            {selectedConversation?.type === 'team' && (
                                <div style={{ padding: '16px', borderTop: '1px solid #f3f4f6' }}>
                                    <button
                                        onClick={async () => {
                                            if (window.confirm('Are you sure you want to leave this group?')) {
                                                try {
                                                    await supabase
                                                        .from('conversation_members')
                                                        .delete()
                                                        .eq('conversation_id', selectedConversation.id)
                                                        .eq('user_id', currentUserId);
                                                    setShowMembersModal(false);
                                                    setSelectedConversation(null);
                                                    setConversationCache({});
                                                    loadConversations();
                                                } catch (err) {
                                                    console.error('Error leaving group:', err);
                                                    alert('Failed to leave group');
                                                }
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            background: 'transparent',
                                            border: '1px solid #fca5a5',
                                            borderRadius: '24px',
                                            color: '#ef4444',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            fontSize: '14px'
                                        }}
                                    >
                                        Leave Group
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Message Reactions Modal */}
            {showReactionsModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 60
                }}>
                    <div style={{
                        background: 'white',
                        borderRadius: '16px',
                        width: '400px',
                        maxWidth: '90%',
                        maxHeight: '80vh', // Limit height
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '16px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid #e5e7eb'
                        }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>Message Reactions</h3>
                            <button
                                onClick={() => setShowReactionsModal(false)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#6b7280'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{ padding: '0', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            {reactionModalLoading ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading reactions...</div>
                            ) : (
                                <>
                                    {/* Tabs */}
                                    <div style={{
                                        display: 'flex',
                                        gap: '8px',
                                        padding: '16px 20px',
                                        borderBottom: '1px solid #f3f4f6',
                                        overflowX: 'auto',
                                        scrollbarWidth: 'none'
                                    }}>
                                        <button
                                            onClick={() => setActiveReactionTab('All')}
                                            style={{
                                                padding: '6px 16px',
                                                borderRadius: '20px',
                                                border: 'none',
                                                background: activeReactionTab === 'All' ? '#eff6ff' : 'transparent',
                                                color: activeReactionTab === 'All' ? '#4f46e5' : '#6b7280',
                                                fontWeight: 500,
                                                fontSize: '14px',
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            All {Object.values(reactionDetails).reduce((acc, arr) => acc + arr.length, 0)}
                                        </button>
                                        {Object.entries(reactionDetails).map(([emoji, users]) => (
                                            <button
                                                key={emoji}
                                                onClick={() => setActiveReactionTab(emoji)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '20px',
                                                    border: 'none',
                                                    background: activeReactionTab === emoji ? '#eff6ff' : 'transparent',
                                                    color: activeReactionTab === emoji ? '#4f46e5' : '#6b7280',
                                                    fontWeight: 500,
                                                    fontSize: '14px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                <span>{emoji}</span>
                                                <span>{users.length}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* List */}
                                    <div style={{ padding: '0' }}>
                                        {(() => {
                                            let usersToShow = [];
                                            if (activeReactionTab === 'All') {
                                                // Flatten and show all
                                                Object.entries(reactionDetails).forEach(([emoji, users]) => {
                                                    users.forEach(u => usersToShow.push({ ...u, emoji }));
                                                });
                                            } else {
                                                usersToShow = (reactionDetails[activeReactionTab] || []).map(u => ({ ...u, emoji: activeReactionTab }));
                                            }

                                            if (usersToShow.length === 0) {
                                                return <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No reactions found</div>;
                                            }

                                            return usersToShow.map((u, idx) => (
                                                <div key={`${u.userId}-${idx}`} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '12px 20px',
                                                    borderBottom: '1px solid #f9fafb'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{
                                                            width: '40px',
                                                            height: '40px',
                                                            borderRadius: '50%',
                                                            backgroundColor: '#e0e7ff',
                                                            color: '#4f46e5',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '16px',
                                                            fontWeight: 600,
                                                            overflow: 'hidden'
                                                        }}>
                                                            {u.avatar ? (
                                                                <img src={u.avatar} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            ) : (
                                                                u.name.charAt(0).toUpperCase()
                                                            )}
                                                        </div>
                                                        <span style={{ fontWeight: 500, color: '#1f2937' }}>{u.name}</span>
                                                    </div>
                                                    <div style={{ fontSize: '20px' }}>{u.emoji}</div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <CreatePollModal
                isOpen={showPollModal}
                onClose={() => setShowPollModal(false)}
                conversationId={selectedConversation?.id}
                currentUserId={currentUserId}
            />

            <PollDetailsModal
                isOpen={showPollDetails}
                onClose={() => {
                    setShowPollDetails(false);
                    setSelectedPollMessage(null);
                }}
                message={selectedPollMessage}
                currentUserId={currentUserId}
                orgUsers={orgUsers}
                memberCount={pollMemberCount}
            />
        </div>
    );
};

export default MessagingHub;
