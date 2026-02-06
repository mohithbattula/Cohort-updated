import { supabase } from '../lib/supabaseClient';

/**
 * Message Service
 * Handles all messaging-related operations with Supabase
 */

/**
 * Get conversations for a user filtered by category
 * @param {string} userId - Current user's ID
 * @param {string} category - 'myself' (DMs), 'team', or 'organization'
 * @returns {Promise<Array>} List of conversations
 */
export const getConversationsByCategory = async (userId, category, orgId) => {
    try {
        // Check if user is authenticated
        if (!userId) {
            console.warn('No user ID provided for getConversationsByCategory');
            return [];
        }

        // Step 1: Get user's conversation memberships first
        const { data: memberships, error: memberError } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', userId);

        if (memberError) {
            console.error('Error fetching conversation memberships:', memberError);
            return [];
        }

        if (!memberships || memberships.length === 0) {
            console.log('No conversations found for user');
            return [];
        }

        const conversationIds = memberships.map(m => m.conversation_id);

        // Step 2: Get conversations the user is a member of
        let query = supabase
            .from('conversations')
            .select('*')
            .in('id', conversationIds);

        // Filter by org_id, but also include conversations with NULL org_id (legacy conversations)
        if (orgId) {
            query = query.or(`org_id.eq.${orgId},org_id.is.null`);
        }

        // Filter by conversation type based on category
        if (category === 'myself') {
            query = query.eq('type', 'dm');
        } else if (category === 'team') {
            query = query.eq('type', 'team');
        } else if (category === 'organization') {
            query = query.eq('type', 'everyone');
        }

        const { data: conversations, error } = await query.order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching conversations:', error);
            return [];
        }

        if (!conversations || conversations.length === 0) {
            return [];
        }

        // Step 3: Fetch conversation indexes for these conversations
        const { data: indexes, error: indexError } = await supabase
            .from('conversation_indexes')
            .select('*')
            .in('conversation_id', conversations.map(c => c.id));

        if (indexError) {
            console.error('Error fetching conversation indexes:', indexError);
            // Return conversations without indexes rather than failing completely
            return conversations;
        }

        // Step 4: Merge indexes into conversations
        const conversationsWithIndexes = conversations.map(conv => {
            const index = indexes?.find(idx => idx.conversation_id === conv.id);
            return {
                ...conv,
                conversation_indexes: index ? [index] : []
            };
        });

        // Step 5: Self-healing for missing message previews
        // If we have a timestamp but no message content, fetch it
        const brokenConversations = conversationsWithIndexes.filter(c => {
            const idx = c.conversation_indexes?.[0];
            return idx && idx.last_message_at && !idx.last_message;
        });

        if (brokenConversations.length > 0) {
            await Promise.all(brokenConversations.map(async (conv) => {
                const { data: msgs } = await supabase
                    .from('messages')
                    .select('content')
                    .eq('conversation_id', conv.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (msgs && msgs.length > 0) {
                    const content = msgs[0].content;
                    // Update local object immediately so UI shows it
                    if (conv.conversation_indexes[0]) {
                        conv.conversation_indexes[0].last_message = content;
                    }

                    // Background repair: Persist this fix to the DB index
                    updateConversationIndex(conv.id, content).catch(err =>
                        console.error('Failed to auto-repair conversation index:', err)
                    );
                }
            }));
        }

        return conversationsWithIndexes;
    } catch (error) {
        console.error('Error in getConversationsByCategory:', error);
        return [];
    }
};

/**
 * Get all messages for a specific conversation
 * @param {string} conversationId - ID of the conversation
 * @returns {Promise<Array>} List of messages
 */
export const getConversationMessages = async (conversationId, currentUserId) => {
    try {
        const { data: messages, error } = await supabase
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
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Transform poll data for easier consumption
        const processedMessages = messages?.map(msg => {
            if (msg.message_type === 'poll' && msg.poll_options) {
                return {
                    ...msg,
                    poll_options: msg.poll_options.map(opt => ({
                        ...opt,
                        votes: opt.poll_votes?.length || 0,
                        userVoted: currentUserId ? opt.poll_votes?.some(v => v.user_id === currentUserId) : false
                    }))
                };
            }
            return msg;
        });

        return processedMessages || [];
    } catch (error) {
        console.error('Error fetching messages:', error);
        throw error;
    }
};

/**
 * Send a new message
 * @param {string} conversationId - ID of the conversation
 * @param {string} userId - ID of the sender
 * @param {string} content - Message content
 * @param {Array} files - Optional array of files to attach
 * @param {string} replyToId - Optional ID of message being replied to
 * @returns {Promise<Object>} Created message
 */
export const sendMessage = async (conversationId, userId, content, files = [], replyToId = null) => {
    try {
        // Build message object
        const messageData = {
            conversation_id: conversationId,
            sender_user_id: userId,
            sender_type: 'human',
            message_type: 'chat',
            content: content,
            created_at: new Date().toISOString()
        };

        // Add reply reference if replying to a message
        if (replyToId) {
            messageData.reply_to_id = replyToId;
        }

        // Insert the message
        const { data: message, error: messageError } = await supabase
            .from('messages')
            .insert(messageData)
            .select()
            .single();

        if (messageError) throw messageError;

        // Upload attachments if any
        let uploadedAttachments = [];
        if (files && files.length > 0) {
            for (const file of files) {
                const attachment = await uploadAttachment(file, conversationId, message.id);
                uploadedAttachments.push(attachment);
            }
        }

        // Update conversation index
        // Use '[Attachment]' if no text but files were sent
        const indexMessage = content || (files && files.length > 0 ? '📎 Attachment' : '');
        await updateConversationIndex(conversationId, indexMessage);

        // Create notifications for other participants
        const { data: members } = await supabase
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', conversationId);

        if (members && members.length > 0) {
            const notifications = members
                .filter(member => member.user_id !== userId)
                .map(member => ({
                    receiver_id: member.user_id,
                    sender_id: userId,
                    message: `New message: ${content ? (content.length > 30 ? content.substring(0, 30) + '...' : content) : '📎 Attachment'}`,
                    type: 'message',
                    is_read: false,
                    conversation_id: conversationId
                }));

            if (notifications.length > 0) {
                const { error: notifError } = await supabase
                    .from('notifications')
                    .insert(notifications);

                if (notifError) console.error('Error creating notifications:', notifError);
            }
        }

        return { ...message, attachments: uploadedAttachments };
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
};

/**
 * Upload a file attachment to Supabase Storage
 * @param {File} file - File to upload
 * @param {string} conversationId - ID of the conversation
 * @param {string} messageId - ID of the message
 * @returns {Promise<Object>} Attachment metadata
 */
export const uploadAttachment = async (file, conversationId, messageId) => {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${conversationId}/${fileName}`;

        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('message-attachments')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('message-attachments')
            .getPublicUrl(filePath);

        // Insert attachment metadata
        const { data: attachment, error: attachmentError } = await supabase
            .from('attachments')
            .insert({
                message_id: messageId,
                file_name: file.name,
                file_type: file.type,
                file_size: file.size,
                storage_path: filePath,
                url: publicUrl
            })
            .select()
            .single();

        if (attachmentError) throw attachmentError;

        return attachment;
    } catch (error) {
        console.error('Error uploading attachment:', error);
        throw error;
    }
};

/**
 * Update conversation index with last message
 * @param {string} conversationId - ID of the conversation
 * @param {string} lastMessage - Last message content
 */
export const updateConversationIndex = async (conversationId, lastMessage) => {
    try {
        const { error } = await supabase
            .from('conversation_indexes')
            .upsert(
                {
                    conversation_id: conversationId,
                    last_message: lastMessage,
                    last_message_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    onConflict: 'conversation_id',
                    ignoreDuplicates: false
                }
            );

        if (error) throw error;
    } catch (error) {
        console.error('Error updating conversation index:', error);
        throw error;
    }
};

/**
 * Create a new DM conversation
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Created conversation
 */
export const createDMConversation = async (userId1, userId2, orgId) => {
    try {
        // Strategy: Find existing DM between these two users regardless of org_id or context

        // 1. Get all conversation IDs for User 1
        const { data: user1Convs } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', userId1);

        const candidateIds = user1Convs?.map(c => c.conversation_id) || [];

        if (candidateIds.length > 0) {
            // 2. Search for a DM conversation in these candidates that ALSO includes User 2
            const { data: existingDM } = await supabase
                .from('conversations')
                .select(`
                    *,
                    conversation_members!inner(user_id)
                `)
                .in('id', candidateIds) // Must be one of User 1's conversations
                .eq('type', 'dm')       // Must be a DM
                .eq('conversation_members.user_id', userId2) // Must include User 2 (inner join filters for this)
                .maybeSingle();

            if (existingDM) {
                console.log('Found existing DM:', existingDM.id);
                return existingDM;
            }
        }

        console.log('Creating new DM conversation...');

        // Create new DM conversation
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .insert({
                org_id: orgId,
                type: 'dm',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (convError) throw convError;

        // Add both users as members
        const { error: membersError } = await supabase
            .from('conversation_members')
            .insert([
                { conversation_id: conversation.id, user_id: userId1 },
                { conversation_id: conversation.id, user_id: userId2 }
            ]);

        if (membersError) throw membersError;

        return conversation;
    } catch (error) {
        console.error('Error creating DM conversation:', error);
        throw error;
    }
};

/**
 * Create a Team conversation
 * @param {string} creatorId - User creating the team chat
 * @param {Array} memberIds - Array of user IDs to add to team
 * @param {string} teamName - Name of the team chat
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Created conversation
 */
export const createTeamConversation = async (creatorId, memberIds, teamName, orgId) => {
    try {
        // Create team conversation
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .insert({
                org_id: orgId,
                type: 'team',
                name: teamName,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (convError) throw convError;

        // Add all members including creator
        const allMembers = [...new Set([creatorId, ...memberIds])];
        const memberInserts = allMembers.map(userId => ({
            conversation_id: conversation.id,
            user_id: userId
        }));

        const { error: membersError } = await supabase
            .from('conversation_members')
            .insert(memberInserts);

        if (membersError) throw membersError;

        return conversation;
    } catch (error) {
        console.error('Error creating team conversation:', error);
        throw error;
    }
};

/**
 * Get or create organization-wide conversation
 * @param {string} userId - Current user's ID
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Organization conversation
 */
export const getOrCreateOrgConversation = async (userId, orgId) => {
    try {
        // Check if org conversation exists
        const { data: existing } = await supabase
            .from('conversations')
            .select('*')
            .eq('type', 'everyone')
            .eq('org_id', orgId)
            .maybeSingle();

        if (existing) {
            // Make sure user is a member
            const { data: membership } = await supabase
                .from('conversation_members')
                .select('id')
                .eq('conversation_id', existing.id)
                .eq('user_id', userId)
                .maybeSingle();

            if (!membership) {
                await supabase
                    .from('conversation_members')
                    .insert({ conversation_id: existing.id, user_id: userId });
            }

            return existing;
        }

        // Create new org-wide conversation
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .insert({
                org_id: orgId,
                type: 'everyone',
                name: 'Company Chat',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (convError) throw convError;

        // Add creator as first member
        await supabase
            .from('conversation_members')
            .insert({ conversation_id: conversation.id, user_id: userId });

        return conversation;
    } catch (error) {
        console.error('Error getting/creating org conversation:', error);
        throw error;
    }
};

/**
 * Subscribe to real-time updates for a conversation
 * @param {string} conversationId - ID of the conversation
 * @param {Function} callback - Callback function for new messages
 * @returns {Object} Subscription object
 */
export const subscribeToConversation = (conversationId, callback) => {
    const subscription = supabase
        .channel(`conversation:${conversationId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();

    return subscription;
};

/**
 * Unsubscribe from real-time updates
 * @param {Object} subscription - Subscription object to unsubscribe
 */
export const unsubscribeFromConversation = async (subscription) => {
    if (subscription) {
        await supabase.removeChannel(subscription);
    }
};

/**
 * Get user details for conversation display
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User details
 */
export const getUserDetails = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, full_name, avatar_url')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching user details:', error);
        return null;
    }
};

/**
 * Get all users in the organization for starting new DMs
 * @param {string} orgId - Organization ID
 * @returns {Promise<Array>} List of users
 */
export const getOrgUsers = async (orgId) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, full_name, avatar_url, role, is_hidden')
            .eq('org_id', orgId)
            .neq('is_hidden', true)
            .order('full_name');

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching org users:', error);
        return [];
    }
};
/**
 * Create a Poll
 * @param {string} conversationId - ID of the conversation
 * @param {string} userId - ID of the sender
 * @param {string} question - Poll question
 * @param {Array<string>} options - List of option texts
 * @param {boolean} allowMultiple - Whether users can select multiple options
 * @returns {Promise<Object>} Created message
 */
export const createPoll = async (conversationId, userId, question, options, allowMultiple = false) => {
    try {
        // 1. Create the poll message
        const { data: message, error: msgError } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender_user_id: userId,
                sender_type: 'human',
                message_type: 'poll',
                content: question,
                metadata: { allow_multiple: allowMultiple },
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (msgError) throw msgError;

        // 2. Create poll options
        if (options && options.length > 0) {
            const optionsData = options.map(opt => ({
                message_id: message.id,
                option_text: opt
            }));

            const { error: matchError } = await supabase
                .from('poll_options')
                .insert(optionsData);

            if (matchError) throw matchError;
        }

        // Update conversation index
        await updateConversationIndex(conversationId, `📊 Poll: ${question}`);

        return message;
    } catch (error) {
        console.error('Error creating poll:', error);
        throw error;
    }
};

/**
 * Vote on a Poll
 * @param {string} pollOptionId - ID of the selected option
 * @param {string} userId - ID of the voter
 * @returns {Promise<Object>} Action performed (added/removed)
 */
export const votePoll = async (pollOptionId, userId) => {
    try {
        // Check if user already voted for this option
        const { data: existingVotes, error: checkError } = await supabase
            .from('poll_votes')
            .select('id')
            .eq('poll_option_id', pollOptionId)
            .eq('user_id', userId);

        if (checkError) throw checkError;

        if (existingVotes && existingVotes.length > 0) {
            // Unvote (toggle off)
            const { error: deleteError } = await supabase
                .from('poll_votes')
                .delete()
                .eq('poll_option_id', pollOptionId)
                .eq('user_id', userId);

            if (deleteError) throw deleteError;
            return { action: 'removed' };
        } else {
            // Check metadata to enforce constraints
            const { data: optionData } = await supabase
                .from('poll_options')
                .select('message_id, message:message_id(metadata)')
                .eq('id', pollOptionId)
                .single();

            const allowMultiple = optionData?.message?.metadata?.allow_multiple;

            if (!allowMultiple) {
                // If single choice, remove votes for sibling options
                const { data: allOptions } = await supabase
                    .from('poll_options')
                    .select('id')
                    .eq('message_id', optionData.message_id);

                const allOptionIds = allOptions?.map(o => o.id) || [];

                if (allOptionIds.length > 0) {
                    await supabase
                        .from('poll_votes')
                        .delete()
                        .in('poll_option_id', allOptionIds)
                        .eq('user_id', userId);
                }
            }

            // Vote
            const { error: insertError } = await supabase
                .from('poll_votes')
                .insert({
                    poll_option_id: pollOptionId,
                    user_id: userId
                });

            if (insertError) throw insertError;
            return { action: 'added' };
        }
    } catch (error) {
        console.error('Error voting on poll:', error);
        throw error;
    }
};

// ============================================
// COHORT MESSAGING MODULE - Extended Functions
// ============================================

/**
 * Add a reaction to a message
 * @param {string} messageId - ID of the message
 * @param {string} userId - ID of the user
 * @param {string} emoji - Emoji to add
 * @returns {Promise<Object>} Created reaction
 */
export const addReaction = async (messageId, userId, emoji) => {
    try {
        const { data, error } = await supabase
            .from('message_reactions')
            .insert({
                message_id: messageId,
                user_id: userId,
                emoji: emoji
            })
            .select()
            .single();

        if (error) {
            // If duplicate, that's okay - user already reacted with this emoji
            if (error.code === '23505') {
                return { alreadyExists: true };
            }
            throw error;
        }
        return data;
    } catch (error) {
        console.error('Error adding reaction:', error);
        throw error;
    }
};

/**
 * Remove a reaction from a message
 * @param {string} messageId - ID of the message
 * @param {string} userId - ID of the user
 * @param {string} emoji - Emoji to remove
 * @returns {Promise<void>}
 */
export const removeReaction = async (messageId, userId, emoji) => {
    try {
        const { error } = await supabase
            .from('message_reactions')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', userId)
            .eq('emoji', emoji);

        if (error) throw error;
    } catch (error) {
        console.error('Error removing reaction:', error);
        throw error;
    }
};

/**
 * Get all reactions for a message, grouped by emoji
 * @param {string} messageId - ID of the message
 * @returns {Promise<Object>} Grouped reactions { emoji: [users] }
 */
export const getMessageReactions = async (messageId) => {
    try {
        const { data, error } = await supabase
            .from('message_reactions')
            .select(`
                emoji,
                user_id,
                profiles:user_id(full_name, avatar_url)
            `)
            .eq('message_id', messageId);

        if (error) throw error;

        // Group by emoji
        const grouped = {};
        data?.forEach(reaction => {
            if (!grouped[reaction.emoji]) {
                grouped[reaction.emoji] = [];
            }
            grouped[reaction.emoji].push({
                userId: reaction.user_id,
                name: reaction.profiles?.full_name || 'User',
                avatar: reaction.profiles?.avatar_url
            });
        });

        return grouped;
    } catch (error) {
        console.error('Error getting reactions:', error);
        return {};
    }
};

/**
 * Delete message for the current user only (soft delete)
 * @param {string} messageId - ID of the message
 * @param {string} userId - ID of the user
 * @returns {Promise<void>}
 */
export const deleteForMe = async (messageId, userId) => {
    try {
        // Add user to deleted_for array
        const { data: message } = await supabase
            .from('messages')
            .select('deleted_for')
            .eq('id', messageId)
            .single();

        const currentDeletedFor = message?.deleted_for || [];
        if (!currentDeletedFor.includes(userId)) {
            currentDeletedFor.push(userId);
        }

        const { error } = await supabase
            .from('messages')
            .update({ deleted_for: currentDeletedFor })
            .eq('id', messageId);

        if (error) throw error;
    } catch (error) {
        console.error('Error deleting message for me:', error);
        throw error;
    }
};

/**
 * Delete message for everyone (only within 5 minutes or by moderator)
 * @param {string} messageId - ID of the message
 * @param {string} userId - ID of the user requesting deletion
 * @param {boolean} isModerator - If true, bypasses time limit
 * @returns {Promise<Object>} Result indicating success or reason for failure
 */
export const deleteForEveryone = async (messageId, userId, isModerator = false) => {
    try {
        // Get message details
        const { data: message, error: fetchError } = await supabase
            .from('messages')
            .select('sender_user_id, created_at')
            .eq('id', messageId)
            .single();

        if (fetchError) throw fetchError;

        // Check ownership or moderator status
        const isOwner = message.sender_user_id === userId;

        if (!isOwner && !isModerator) {
            return { success: false, reason: 'not_authorized' };
        }

        // Check 5-minute window for non-moderators
        if (!isModerator) {
            const createdAt = new Date(message.created_at).getTime();
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;

            if (now - createdAt > fiveMinutes) {
                return { success: false, reason: 'time_expired' };
            }
        }

        // Soft delete for everyone
        const { error } = await supabase
            .from('messages')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: userId,
                content: '[Message deleted]'
            })
            .eq('id', messageId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error deleting message for everyone:', error);
        throw error;
    }
};

/**
 * Send a message with snapshot reply support
 * @param {string} conversationId - ID of the conversation
 * @param {string} userId - ID of the sender
 * @param {string} content - Message content
 * @param {Array} files - Optional array of files to attach
 * @param {string} replyToId - Optional ID of message being replied to
 * @returns {Promise<Object>} Created message
 */
export const sendMessageWithSnapshot = async (conversationId, userId, content, files = [], replyToId = null) => {
    try {
        // Build message object
        const messageData = {
            conversation_id: conversationId,
            sender_user_id: userId,
            sender_type: 'human',
            message_type: 'chat',
            content: content,
            created_at: new Date().toISOString()
        };

        // Add reply snapshot if replying to a message
        if (replyToId) {
            messageData.reply_to_id = replyToId;

            // Fetch original message for snapshot
            const { data: originalMsg } = await supabase
                .from('messages')
                .select(`
                    content,
                    sender_user_id,
                    profiles:sender_user_id(full_name, role)
                `)
                .eq('id', replyToId)
                .single();

            if (originalMsg) {
                messageData.reply_snapshot_content = originalMsg.content;
                messageData.reply_snapshot_sender_name = originalMsg.profiles?.full_name || 'User';
                messageData.reply_snapshot_sender_role = originalMsg.profiles?.role || 'unknown';
            }
        }

        // Insert the message
        const { data: message, error: messageError } = await supabase
            .from('messages')
            .insert(messageData)
            .select()
            .single();

        if (messageError) throw messageError;

        // Upload attachments if any
        if (files && files.length > 0) {
            for (const file of files) {
                await uploadAttachment(file, conversationId, message.id);
            }
        }

        // Update conversation index
        const indexMessage = content || (files && files.length > 0 ? '📎 Attachment' : '');
        await updateConversationIndex(conversationId, indexMessage);

        // Create notifications for other participants
        const { data: members } = await supabase
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', conversationId);

        if (members && members.length > 0) {
            const notifications = members
                .filter(member => member.user_id !== userId)
                .map(member => ({
                    receiver_id: member.user_id,
                    sender_id: userId,
                    message: `New message: ${content ? (content.length > 30 ? content.substring(0, 30) + '...' : content) : '📎 Attachment'}`,
                    type: 'message',
                    is_read: false,
                    conversation_id: conversationId
                }));

            if (notifications.length > 0) {
                const { error: notifError } = await supabase
                    .from('notifications')
                    .insert(notifications);

                if (notifError) console.error('Error creating notifications:', notifError);
            }
        }

        return message;
    } catch (error) {
        console.error('Error sending message with snapshot:', error);
        throw error;
    }
};

/**
 * Promote a user to admin in a team conversation
 * @param {string} conversationId - ID of the conversation
 * @param {string} targetUserId - User to promote
 * @param {string} promoterId - User doing the promotion
 * @returns {Promise<Object>} Updated conversation
 */
export const promoteToAdmin = async (conversationId, targetUserId, promoterId) => {
    try {
        // Get current admin list
        const { data: conv, error: fetchError } = await supabase
            .from('conversations')
            .select('admin_ids, type')
            .eq('id', conversationId)
            .single();

        if (fetchError) throw fetchError;

        if (conv.type !== 'team') {
            throw new Error('Can only manage admins in team conversations');
        }

        const currentAdmins = conv.admin_ids || [];

        // Check if promoter is an admin
        if (!currentAdmins.includes(promoterId)) {
            throw new Error('Only admins can promote others');
        }

        // Add target if not already admin
        if (!currentAdmins.includes(targetUserId)) {
            currentAdmins.push(targetUserId);
        }

        const { data, error } = await supabase
            .from('conversations')
            .update({ admin_ids: currentAdmins })
            .eq('id', conversationId)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error promoting to admin:', error);
        throw error;
    }
};

/**
 * Demote a user from admin in a team conversation
 * @param {string} conversationId - ID of the conversation
 * @param {string} targetUserId - User to demote
 * @param {string} demoterId - User doing the demotion
 * @returns {Promise<Object>} Updated conversation
 */
export const demoteFromAdmin = async (conversationId, targetUserId, demoterId) => {
    try {
        const { data: conv, error: fetchError } = await supabase
            .from('conversations')
            .select('admin_ids')
            .eq('id', conversationId)
            .single();

        if (fetchError) throw fetchError;

        let currentAdmins = conv.admin_ids || [];

        if (!currentAdmins.includes(demoterId)) {
            throw new Error('Only admins can demote others');
        }

        // Prevent demoting self if last admin
        if (targetUserId === demoterId && currentAdmins.length === 1) {
            throw new Error('Cannot demote yourself when you are the only admin');
        }

        currentAdmins = currentAdmins.filter(id => id !== targetUserId);

        const { data, error } = await supabase
            .from('conversations')
            .update({ admin_ids: currentAdmins })
            .eq('id', conversationId)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error demoting from admin:', error);
        throw error;
    }
};

/**
 * Check if a user is an admin of a conversation
 * @param {string} conversationId - ID of the conversation
 * @param {string} userId - User to check
 * @returns {Promise<boolean>}
 */
export const isConversationAdmin = async (conversationId, userId) => {
    try {
        const { data, error } = await supabase
            .from('conversations')
            .select('admin_ids')
            .eq('id', conversationId)
            .single();

        if (error) throw error;
        return data?.admin_ids?.includes(userId) || false;
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
};

/**
 * Subscribe to message reactions in real-time
 * @param {string} conversationId - ID of the conversation
 * @param {Function} callback - Callback for reaction changes
 * @returns {Object} Subscription object
 */
export const subscribeToReactions = (conversationId, callback) => {
    const subscription = supabase
        .channel(`reactions:${conversationId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'message_reactions'
            },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();

    return subscription;
};

/**
 * Get user's cohort role display name
 * @param {string} dbRole - Database role (executive, manager, employee)
 * @returns {string} Display name (Tutor, Mentor, Student)
 */
export const getCohortRoleDisplay = (dbRole) => {
    const roleMap = {
        'executive': 'Tutor',
        'manager': 'Mentor',
        'team_lead': 'Project Mentor',
        'employee': 'Student'
    };
    return roleMap[dbRole] || dbRole;
};

/**
 * Check if user has moderation permissions over another user
 * @param {string} moderatorRole - Role of the moderator
 * @param {string} targetRole - Role of the target user
 * @returns {boolean}
 */
export const canModerate = (moderatorRole, targetRole) => {
    const hierarchy = {
        'executive': 100,
        'manager': 75,
        'team_lead': 50,
        'employee': 25
    };
    return (hierarchy[moderatorRole] || 0) > (hierarchy[targetRole] || 0);
};

