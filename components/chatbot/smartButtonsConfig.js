/**
 * Smart Buttons Configuration and Utilities
 * Handles fetching and managing chatbot smart buttons
 */

const CHATBOT_BASE_URL = import.meta.env.VITE_CHATBOT_API_URL || 'http://localhost:8035';

/**
 * Fetch smart button suggestions from backend
 * @param {string} userId - User ID
 * @param {string} route - Current route/path
 * @param {object} context - Page context data
 * @param {string} role - User role
 * @returns {Promise<object>} Categorized buttons
 */
export async function fetchSmartButtons(userId, route, context, role) {
    try {
        const response = await fetch(`${CHATBOT_BASE_URL}/slm/suggest-buttons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                route: route,
                context: context,
                role: role
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.buttons || {};
    } catch (error) {
        console.error('Error fetching smart buttons:', error);
        return {};
    }
}

/**
 * Track button click analytics
 * @param {string} userId - User ID
 * @param {string} buttonLabel - Button label text
 * @param {string} buttonQuery - Query text
 * @param {string} category - Button category
 * @param {string} route - Current route
 */
export async function trackButtonClick(userId, buttonLabel, buttonQuery, category, route) {
    try {
        await fetch(`${CHATBOT_BASE_URL}/slm/track-button-click`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                button_label: buttonLabel,
                button_query: buttonQuery,
                button_category: category,
                route: route
            })
        });
    } catch (error) {
        console.error('Error tracking button click:', error);
    }
}

/**
 * Extract page context from current location and state
 * @param {string} pathname - Current pathname
 * @param {object} state - Optional page state
 * @returns {object} Context object
 */
export function extractPageContext(pathname, state = {}) {
    const context = {};

    // Extract project ID and name if on project page
    const projectMatch = pathname.match(/\/projects\/([^/]+)/);
    if (projectMatch) {
        context.project_id = projectMatch[1];
        if (state.projectName) {
            context.project_name = state.projectName;
        }
    }

    // Extract task info if on task page
    const taskMatch = pathname.match(/\/tasks\/([^/]+)/);
    if (taskMatch) {
        context.task_id = taskMatch[1];
        if (state.taskTitle) {
            context.task_title = state.taskTitle;
        }
    }

    // Extract user info if viewing someone's profile/tasks
    if (state.viewingUserName) {
        context.viewing_user_name = state.viewingUserName;
    }

    return context;
}
