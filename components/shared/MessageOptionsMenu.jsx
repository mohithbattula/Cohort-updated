import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Reply, SmilePlus, Trash2, Copy, Check } from 'lucide-react';
import { deleteForMe, deleteForEveryone, canModerate } from '../../services/messageService';

const MessageOptionsMenu = ({
    message,
    currentUserId,
    currentUserRole,
    onReply,
    onReact,
    onDeleted
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [copied, setCopied] = useState(false);
    const menuRef = useRef(null);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isOwnMessage = message.sender_user_id === currentUserId;
    const senderRole = message.profiles?.role || message.sender_role;

    // Check if "Delete for Everyone" is available (within 5 minutes)
    const createdAt = new Date(message.created_at).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    const canDeleteForEveryone = isOwnMessage && (now - createdAt <= fiveMinutes);

    // Check moderation permission (higher role can delete lower role's messages)
    const canModerateMessage = !isOwnMessage && canModerate(currentUserRole, senderRole);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    const handleDeleteForMe = async () => {
        if (isDeleting) return;
        setIsDeleting(true);
        try {
            await deleteForMe(message.id, currentUserId);
            setIsOpen(false);
            if (onDeleted) onDeleted('forMe');
        } catch (error) {
            console.error('Delete for me failed:', error);
            alert('Failed to delete message');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDeleteForEveryone = async () => {
        if (isDeleting) return;

        const confirmMsg = canModerateMessage
            ? 'Delete this message as a moderator? This cannot be undone.'
            : 'Delete for everyone? This cannot be undone.';

        if (!window.confirm(confirmMsg)) return;

        setIsDeleting(true);
        try {
            const result = await deleteForEveryone(message.id, currentUserId, canModerateMessage);

            if (!result.success) {
                if (result.reason === 'time_expired') {
                    alert('You can only delete messages for everyone within 5 minutes of sending.');
                } else if (result.reason === 'not_authorized') {
                    alert('You are not authorized to delete this message.');
                }
                return;
            }

            setIsOpen(false);
            if (onDeleted) onDeleted('forEveryone');
        } catch (error) {
            console.error('Delete for everyone failed:', error);
            alert('Failed to delete message');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div ref={menuRef} className="relative inline-block">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all text-gray-400 hover:text-gray-600"
            >
                <MoreVertical size={16} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] z-50">
                    {/* Reply */}
                    <button
                        onClick={() => { onReply?.(message); setIsOpen(false); }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                        <Reply size={14} />
                        Reply
                    </button>

                    {/* React */}
                    <button
                        onClick={() => { onReact?.(message); setIsOpen(false); }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                        <SmilePlus size={14} />
                        React
                    </button>

                    {/* Copy */}
                    {message.content && (
                        <button
                            onClick={handleCopy}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                            {copied ? 'Copied!' : 'Copy text'}
                        </button>
                    )}

                    <div className="border-t border-gray-100 my-1" />

                    {/* Delete for Me */}
                    <button
                        onClick={handleDeleteForMe}
                        disabled={isDeleting}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                    >
                        <Trash2 size={14} />
                        Delete for me
                    </button>

                    {/* Delete for Everyone (own message within 5 min OR moderator) */}
                    {(canDeleteForEveryone || canModerateMessage) && (
                        <button
                            onClick={handleDeleteForEveryone}
                            disabled={isDeleting}
                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                        >
                            <Trash2 size={14} />
                            {canModerateMessage ? 'Delete (Moderator)' : 'Delete for everyone'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default MessageOptionsMenu;
