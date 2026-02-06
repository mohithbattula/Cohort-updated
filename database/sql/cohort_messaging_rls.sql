-- ============================================
-- Cohort Messaging Module - RLS Policies
-- ============================================
-- Role-based permissions for messaging:
-- Tutor (executive) > Mentor (manager) > Student (employee)

-- ============================================
-- 1. READ-ONLY CHANNEL ENFORCEMENT
-- ============================================
-- Only Tutors can post in read-only channels

DROP POLICY IF EXISTS "Block messages in read-only channels" ON public.messages;

CREATE POLICY "Block messages in read-only channels" ON public.messages
    FOR INSERT WITH CHECK (
        -- Allow if channel is NOT read-only
        NOT EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = conversation_id 
            AND c.is_read_only = true
        )
        OR
        -- OR if user is a Tutor (executive)
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() 
            AND p.role = 'executive'
        )
    );

-- ============================================
-- 2. MODERATION PERMISSIONS
-- ============================================
-- Higher roles can delete messages from lower roles

-- Helper function to get role hierarchy level
CREATE OR REPLACE FUNCTION get_role_level(role_name text)
RETURNS integer AS $$
BEGIN
    RETURN CASE role_name
        WHEN 'executive' THEN 100   -- Tutor: Highest
        WHEN 'manager' THEN 75      -- Mentor
        WHEN 'team_lead' THEN 50    -- Project Mentor  
        WHEN 'employee' THEN 25     -- Student: Lowest
        ELSE 0
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Allow message deletion by sender OR higher role
DROP POLICY IF EXISTS "Delete own or moderate lower role messages" ON public.messages;

CREATE POLICY "Delete own or moderate lower role messages" ON public.messages
    FOR UPDATE USING (
        -- Own message
        sender_user_id = auth.uid()
        OR
        -- Higher role moderation
        (
            get_role_level((SELECT role FROM profiles WHERE id = auth.uid()))
            > 
            get_role_level((SELECT role FROM profiles WHERE id = sender_user_id))
        )
    );

-- ============================================
-- 3. CONVERSATION MEMBER VISIBILITY
-- ============================================
-- Users can only see conversations they are members of

DROP POLICY IF EXISTS "View own conversations" ON public.conversations;

CREATE POLICY "View own conversations" ON public.conversations
    FOR SELECT USING (
        -- Is a member of the conversation
        EXISTS (
            SELECT 1 FROM conversation_members cm
            WHERE cm.conversation_id = id
            AND cm.user_id = auth.uid()
        )
        OR
        -- Or it's an org-wide channel in user's org
        (
            type = 'everyone' 
            AND org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
        )
    );

-- ============================================
-- 4. MESSAGE VISIBILITY (Soft Delete Aware)
-- ============================================
-- Hide messages deleted for the current user

DROP POLICY IF EXISTS "View messages with soft delete" ON public.messages;

CREATE POLICY "View messages with soft delete" ON public.messages
    FOR SELECT USING (
        -- Not soft-deleted for everyone
        deleted_at IS NULL
        AND
        -- Not in the deleted_for array for this user
        NOT (auth.uid()::text = ANY(deleted_for))
    );

-- ============================================
-- 5. GROUP ADMIN PERMISSIONS
-- ============================================
-- Only admins can update team conversations

DROP POLICY IF EXISTS "Admins can update team conversations" ON public.conversations;

CREATE POLICY "Admins can update team conversations" ON public.conversations
    FOR UPDATE USING (
        -- DM and org convos - no restrictions
        type IN ('dm', 'everyone')
        OR
        -- Team convos - must be admin
        (type = 'team' AND auth.uid()::text = ANY(admin_ids))
        OR
        -- Tutors can always modify
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'executive'
        )
    );

-- ============================================
-- 6. AUTO-ADD TO ORG CHANNELS ON PROFILE CREATE
-- ============================================
-- Trigger to add new users to organization channels

CREATE OR REPLACE FUNCTION add_user_to_org_channels()
RETURNS TRIGGER AS $$
DECLARE
    org_channel RECORD;
BEGIN
    -- Find all 'everyone' type channels in user's org
    FOR org_channel IN 
        SELECT id FROM conversations 
        WHERE type = 'everyone' 
        AND org_id = NEW.org_id
    LOOP
        -- Add user as member if not already
        INSERT INTO conversation_members (conversation_id, user_id)
        VALUES (org_channel.id, NEW.id)
        ON CONFLICT DO NOTHING;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_add_user_to_org_channels ON public.profiles;

CREATE TRIGGER trigger_add_user_to_org_channels
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    WHEN (NEW.org_id IS NOT NULL)
    EXECUTE FUNCTION add_user_to_org_channels();
