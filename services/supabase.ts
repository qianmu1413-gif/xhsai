
import { createClient } from '@supabase/supabase-js';

// ⚠️ SECURITY UPDATE:
// Do NOT hardcode Service Role Keys (secret) in client-side code.
// Use the Anonymous Key (public) here. 
// For Admin operations (delete user, etc.), you should technically use Supabase Edge Functions.
// For this demo, we assume the provided key is the ANON key or the user provides it via Environment Variables.

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://ohesrabpblaxboctfbes.supabase.co'; 
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || ''; 

// 创建客户端
export const supabase = (SUPABASE_URL && SUPABASE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true, // Revert to true for better UX if using Anon key
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    }) 
  : null;

export const isCloudMode = !!supabase;

if (!supabase) {
    console.warn("⚠️ Supabase Client not initialized. Missing API Key.");
}
