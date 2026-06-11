import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured = supabaseUrl && supabaseAnonKey && 
                     !supabaseUrl.includes('your-project-id') && 
                     !supabaseAnonKey.includes('your-anon-key');

if (!isConfigured) {
  console.warn(
    'Supabase credentials are not configured yet. ' +
    'Please copy .env.example to .env and fill in your Supabase project URL and public anon key.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project-id.supabase.co', 
  supabaseAnonKey || 'placeholder-anon-key'
);

export { isConfigured };
