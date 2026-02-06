import React from 'react';
import { Reply } from 'lucide-react';
import { getCohortRoleDisplay } from '../../services/messageService';

/**
 * ReplyPreview - Shows quoted reply using snapshot data
 * Uses snapshot architecture: displays original text at time of reply,
 * not the current (potentially edited) version
 */
const ReplyPreview = ({ message, onClickReply }) => {
    // Check for snapshot data (new architecture) or fallback to live reference
    const hasSnapshot = message.reply_snapshot_content != null;

    const replyContent = hasSnapshot
        ? message.reply_snapshot_content
        : message.reply_to?.content;

    const senderName = hasSnapshot
        ? message.reply_snapshot_sender_name
        : message.reply_to?.profiles?.full_name || 'User';

    const senderRole = hasSnapshot
        ? getCohortRoleDisplay(message.reply_snapshot_sender_role)
        : getCohortRoleDisplay(message.reply_to?.profiles?.role);

    if (!replyContent && !message.reply_to_id) return null;

    // Handle deleted original message
    if (!replyContent && message.reply_to_id) {
        return (
            <div
                className="reply-preview mb-2 pl-3 border-l-2 border-gray-300 opacity-60 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={onClickReply}
            >
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Reply size={12} />
                    <span className="italic">Original message unavailable</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className="reply-preview mb-2 pl-3 border-l-2 border-indigo-400 cursor-pointer hover:bg-indigo-50/50 rounded-r transition-colors"
            onClick={onClickReply}
        >
            <div className="flex items-center gap-1.5 text-xs">
                <Reply size={12} className="text-indigo-500" />
                <span className="font-medium text-indigo-600">{senderName}</span>
                {senderRole && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium">
                        {senderRole}
                    </span>
                )}
            </div>
            <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
                {replyContent}
            </p>
        </div>
    );
};

export default ReplyPreview;
