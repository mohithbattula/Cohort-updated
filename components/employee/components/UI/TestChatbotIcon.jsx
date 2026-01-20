import React from 'react';
import { MessageSquare } from 'lucide-react';

/**
 * Simple Test Chatbot Icon
 * This is a minimal version to test if the icon appears
 */
const TestChatbotIcon = () => {
    console.log('🤖 TestChatbotIcon component is rendering!');
    
    return (
        <div
            style={{
                position: 'fixed',
                bottom: '30px',
                right: '30px',
                zIndex: 9999,
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 30px rgba(124, 58, 237, 0.5)',
                cursor: 'pointer',
                border: '3px solid white'
            }}
            onClick={() => alert('Test chatbot icon clicked! The icon is visible and working.')}
            title="Test Chatbot Icon"
        >
            <MessageSquare size={28} />
        </div>
    );
};

export default TestChatbotIcon;
