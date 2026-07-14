-- ===================================================================
-- Supabase Database Setup & RLS Policies for PerspecTEAve
-- Copy and run this script in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> Paste & Run)
-- ===================================================================

-- ===================================================================
-- 1. Enable Row Level Security (RLS) on all tables
-- ===================================================================
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- 2. Policies for comments table
-- ===================================================================
-- SELECT: Anyone can read comments
DROP POLICY IF EXISTS "Allow anyone to read comments" ON public.comments;
CREATE POLICY "Allow anyone to read comments" ON public.comments
    FOR SELECT TO anon, authenticated
    USING (true);

-- INSERT: Anyone can insert comments
DROP POLICY IF EXISTS "Allow anyone to insert comments" ON public.comments;
CREATE POLICY "Allow anyone to insert comments" ON public.comments
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- UPDATE: Anyone can edit comments (visitors edit their comments client-side via local storage checks)
DROP POLICY IF EXISTS "Allow anyone to update comments" ON public.comments;
CREATE POLICY "Allow anyone to update comments" ON public.comments
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- DELETE: Only the admin (teaboy27@perspecteave.com) can delete comments
DROP POLICY IF EXISTS "Allow admin to delete comments" ON public.comments;
CREATE POLICY "Allow admin to delete comments" ON public.comments
    FOR DELETE TO authenticated
    USING (auth.jwt() ->> 'email' = 'teaboy27@perspecteave.com');


-- ===================================================================
-- 3. Policies for topic_requests table (Suggestions / Critique Threads)
-- ===================================================================
-- SELECT: Anyone can view topic requests
DROP POLICY IF EXISTS "Allow anyone to read topic requests" ON public.topic_requests;
CREATE POLICY "Allow anyone to read topic requests" ON public.topic_requests
    FOR SELECT TO anon, authenticated
    USING (true);

-- INSERT: Anyone can insert suggestions/responses
DROP POLICY IF EXISTS "Allow anyone to insert topic requests" ON public.topic_requests;
CREATE POLICY "Allow anyone to insert topic requests" ON public.topic_requests
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- DELETE: Only the admin can delete suggestions or clean up orphans
DROP POLICY IF EXISTS "Allow admin to delete topic requests" ON public.topic_requests;
CREATE POLICY "Allow admin to delete topic requests" ON public.topic_requests
    FOR DELETE TO authenticated
    USING (auth.jwt() ->> 'email' = 'teaboy27@perspecteave.com');


-- ===================================================================
-- 4. Policies for posts table
-- ===================================================================
-- SELECT: Anyone can read posts
DROP POLICY IF EXISTS "Allow anyone to read posts" ON public.posts;
CREATE POLICY "Allow anyone to read posts" ON public.posts
    FOR SELECT TO anon, authenticated
    USING (true);

-- UPDATE: Anyone can update posts (so visitors can cast agree/disagree votes)
DROP POLICY IF EXISTS "Allow anyone to update posts" ON public.posts;
CREATE POLICY "Allow anyone to update posts" ON public.posts
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- INSERT / DELETE: Only the admin can create or delete posts
DROP POLICY IF EXISTS "Allow admin full access to posts" ON public.posts;
CREATE POLICY "Allow admin full access to posts" ON public.posts
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'email' = 'teaboy27@perspecteave.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'teaboy27@perspecteave.com');


-- ===================================================================
-- 5. Policies for visits table (Analytics / Guest numbering)
-- ===================================================================
-- SELECT: Anyone can select visits to get visitor count
DROP POLICY IF EXISTS "Allow anyone to read visits" ON public.visits;
CREATE POLICY "Allow anyone to read visits" ON public.visits
    FOR SELECT TO anon, authenticated
    USING (true);

-- INSERT: Anyone can log a visit
DROP POLICY IF EXISTS "Allow anyone to insert visits" ON public.visits;
CREATE POLICY "Allow anyone to insert visits" ON public.visits
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);


-- ===================================================================
-- 6. Policies for notifications table (Realtime alerts)
-- ===================================================================
-- INSERT: Anyone can insert notifications (to alert the admin when they interact)
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.notifications;
CREATE POLICY "Allow anonymous insert" ON public.notifications
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- ALL ACCESS (SELECT/UPDATE/DELETE): Only the admin can view or modify notifications
DROP POLICY IF EXISTS "Allow admin full access to notifications" ON public.notifications;
CREATE POLICY "Allow admin full access to notifications" ON public.notifications
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'email' = 'teaboy27@perspecteave.com');


-- ===================================================================
-- 7. Enable Supabase Realtime for the notifications table safely
-- ===================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        WHERE p.pubname = 'supabase_realtime' 
          AND c.relname = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

-- ===================================================================
-- 8. Setup post_views table and RLS policies
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.post_views (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id INTEGER REFERENCES public.posts(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (post_id, visitor_id)
);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anyone to read post views" ON public.post_views;
CREATE POLICY "Allow anyone to read post views" ON public.post_views
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow anyone to insert post views" ON public.post_views;
CREATE POLICY "Allow anyone to insert post views" ON public.post_views
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- ===================================================================
-- 9. Add private column to posts table
-- ===================================================================
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS private BOOLEAN DEFAULT false;

