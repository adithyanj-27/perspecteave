-- ===================================================================
-- Supabase RLS Policies Setup for PerspecTEAve (Targeted Admin Delete Only)
-- Copy and run this script in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> Paste & Run)
-- ===================================================================

-- 1. Ensure Row Level Security is active on comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 2. Drop the policy if it already exists to prevent duplicate errors
DROP POLICY IF EXISTS "Allow admin to delete comments" ON public.comments;

-- 3. Create the specific delete policy for the admin
CREATE POLICY "Allow admin to delete comments" 
ON public.comments 
FOR DELETE 
TO authenticated
USING (auth.jwt() ->> 'email' = 'teaboy27@perspecteave.com');
