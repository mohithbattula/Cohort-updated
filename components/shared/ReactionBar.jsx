import React, { useState, useEffect } from 'react';
import { Smile } from 'lucide-react';
import { addReaction, removeReaction, getMessageReactions, subscribeToReactions } from '../../services/messageService';
import { supabase } from '../../lib/supabaseClient';

// Common emoji reactions
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

const ReactionBar = ({ messageId, currentUserId, conversationId }) => {
    const [reactions, setReactions] = useState({});
    const [showPicker, setShowPicker] = useState(false);
    const [loading, setLoading] = useState(false);

    // Fetch reactions on mount
    useEffect(() => {
        const fetchReactions = async () => {
            const data = await getMessageReactions(messageId);
            setReactions(data);
        };
        fetchReactions();
    }, [messageId]);

    // Real-time subscription
    useEffect(() => {
        const subscription = subscribeToReactions(conversationId, (payload) => {
            // Refresh reactions when changes occur
            getMessageReactions(messageId).then(setReactions);
        });

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [conversationId, messageId]);

    const handleReact = async (emoji) => {
        if (loading) return;
        setLoading(true);

        try {
            // Check if user already reacted with this emoji
            const userReacted = reactions[emoji]?.some(r => r.userId === currentUserId);

            if (userReacted) {
                await removeReaction(messageId, currentUserId, emoji);
                // Optimistic update
                setReactions(prev => ({
                    ...prev,
                    [emoji]: prev[emoji]?.filter(r => r.userId !== currentUserId) || []
                }));
            } else {
                await addReaction(messageId, currentUserId, emoji);
                // Optimistic update
                setReactions(prev => ({
                    ...prev,
                    [emoji]: [...(prev[emoji] || []), { userId: currentUserId, name: 'You' }]
                }));
            }
        } catch (error) {
            console.error('Reaction error:', error);
        } finally {
            setLoading(false);
            setShowPicker(false);
        }
    };

    const hasReactions = Object.keys(reactions).some(emoji => reactions[emoji]?.length > 0);

    return (
        <div className="reaction-bar flex items-center gap-1 flex-wrap mt-1">
            {/* Display existing reactions */}
            {Object.entries(reactions).map(([emoji, users]) => {
                if (!users?.length) return null;
                const userReacted = users.some(u => u.userId === currentUserId);
                const count = users.length;
                const names = users.map(u => u.name).join(', ');

                return (
                    <button
                        key={emoji}
                        onClick={() => handleReact(emoji)}
                        title={names}
                        className={`
                            inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                            transition-all duration-150 border
                            ${userReacted
                                ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                                : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                            }
                        `}
                    >
                        <span>{emoji}</span>
                        {count > 1 && <span className="font-medium">{count}</span>}
                    </button>
                );
            })}

            {/* Add reaction button */}
            <div className="relative">
                <button
                    onClick={() => setShowPicker(!showPicker)}
                    className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Add reaction"
                >
                    <Smile size={16} />
                </button>

                {/* Quick emoji picker */}
                {showPicker && (
                    <div className="absolute bottom-full left-0 mb-1 bg-white rounded-lg shadow-lg border border-gray-200 p-1 flex gap-1 z-50">
                        {QUICK_EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => handleReact(emoji)}
                                className="p-1.5 hover:bg-gray-100 rounded text-lg transition-colors"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReactionBar;
