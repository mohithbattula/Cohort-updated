-- ============================================
-- Cohort Messaging Module - Schema Enhancement
-- ============================================
-- This script adds new tables and columns for:
-- 1. Message Reactions (emoji)
-- 2. Snapshot Reply Architecture
-- 3. Read-only Channels
-- 4. Group Admin Management
-- 5. Soft Delete (Delete for Everyone)
-- 6. Organization Channels (#announcements, #general, #resources)

-- ============================================
-- 1. MESSAGE REACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.message_reactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reactions" ON public.message_reactions
    FOR SELECT USING (true);

CREATE POLICY "Add own reactions" ON public.message_reactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Remove own reactions" ON public.message_reactions
    FOR DELETE USING (auth.uid() = user_id);

-- Add realtime support
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

-- ============================================
-- 2. SNAPSHOT REPLY COLUMNS (messages table)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'reply_snapshot_content') THEN
        ALTER TABLE public.messages ADD COLUMN reply_snapshot_content text;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'reply_snapshot_sender_name') THEN
        ALTER TABLE public.messages ADD COLUMN reply_snapshot_sender_name text;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'reply_snapshot_sender_role') THEN
        ALTER TABLE public.messages ADD COLUMN reply_snapshot_sender_role text;
    END IF;
END $$;

-- ============================================
-- 3. READ-ONLY & ADMIN COLUMNS (conversations table)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'is_read_only') THEN
        ALTER TABLE public.conversations ADD COLUMN is_read_only boolean DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'admin_ids') THEN
        ALTER TABLE public.conversations ADD COLUMN admin_ids uuid[] DEFAULT ARRAY[]::uuid[];
    END IF;
END $$;

-- ============================================
-- 4. SOFT DELETE COLUMNS (messages table)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'deleted_at') THEN
        ALTER TABLE public.messages ADD COLUMN deleted_at timestamptz;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'deleted_by') THEN
        ALTER TABLE public.messages ADD COLUMN deleted_by uuid REFERENCES public.profiles(id);
    END IF;
END $$;

-- ============================================
-- 5. INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON public.message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON public.conversations(org_id);

-- ============================================
-- 6. HELPER FUNCTION: Get Cohort Role Display Name
-- ============================================
CREATE OR REPLACE FUNCTION get_cohort_role_display(db_role text)
RETURNS text AS $$
BEGIN
    RETURN CASE db_role
        WHEN 'executive' THEN 'Tutor'
        WHEN 'manager' THEN 'Mentor'
        WHEN 'team_lead' THEN 'Project Mentor'
        WHEN 'employee' THEN 'Student'
        ELSE db_role
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 7. CREATE DEFAULT ORGANIZATION CHANNELS
-- ============================================
-- This creates the three standard channels for any org that doesn't have them yet
-- Run on demand or set up as a trigger

CREATE OR REPLACE FUNCTION create_org_channels(target_org_id uuid)
RETURNS void AS $$
DECLARE
    channel_names text[] := ARRAY['#announcements', '#general', '#resources'];
    channel_name text;
    existing_id text;
BEGIN
    FOREACH channel_name IN ARRAY channel_names
    LOOP
        -- Check if channel already exists
        SELECT id INTO existing_id FROM public.conversations 
        WHERE org_id = target_org_id 
        AND type = 'everyone' 
        AND name = channel_name;
        
        IF existing_id IS NULL THEN
            INSERT INTO public.conversations (org_id, type, name, is_read_only, created_at)
            VALUES (
                target_org_id, 
                'everyone', 
                channel_name,
                CASE WHEN channel_name = '#announcements' THEN true ELSE false END,
                now()
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create channels for existing org
SELECT create_org_channels('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid);
