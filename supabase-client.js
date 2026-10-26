import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { isSupabaseConfigured, supabaseConfig } from './supabase-config.js';

export const supabase = isSupabaseConfigured()
    ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    })
    : null;
