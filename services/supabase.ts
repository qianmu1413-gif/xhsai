
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuration Keys
export const STORAGE_KEY_SUPABASE_URL = 'rednote_sys_sb_url';
export const STORAGE_KEY_SUPABASE_KEY = 'rednote_sys_sb_key';

// Default / Env Configuration
// 🔴 SECURITY UPDATE: Removed hardcoded keys. 
// Uses environment variables or Setup Wizard input.
const ENV_URL = process.env.REACT_APP_SUPABASE_URL || '';
const ENV_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

// Helper to get current config
const getStoredConfig = () => {
    return {
        url: localStorage.getItem(STORAGE_KEY_SUPABASE_URL) || ENV_URL,
        key: localStorage.getItem(STORAGE_KEY_SUPABASE_KEY) || ENV_KEY
    };
};

// Singleton Client
let supabaseInstance: SupabaseClient | null = null;

export const initSupabase = (): SupabaseClient | null => {
    if (supabaseInstance) return supabaseInstance;

    const { url, key } = getStoredConfig();

    if (url && key) {
        try {
            supabaseInstance = createClient(url, key, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false
                }
            });
            return supabaseInstance;
        } catch (e) {
            console.error("Supabase Init Failed", e);
            return null;
        }
    }
    return null;
};

// Initialize on load
export const supabase = initSupabase();

export const isCloudMode = !!supabase;

// Setup Function for the Wizard
export const setupSystemConnection = (url: string, key: string) => {
    if (!url || !key) return false;
    localStorage.setItem(STORAGE_KEY_SUPABASE_URL, url);
    localStorage.setItem(STORAGE_KEY_SUPABASE_KEY, key);
    // Force reload to re-init modules
    window.location.reload();
    return true;
};

// Reset Function
export const resetSystemConnection = () => {
    localStorage.removeItem(STORAGE_KEY_SUPABASE_URL);
    localStorage.removeItem(STORAGE_KEY_SUPABASE_KEY);
    window.location.reload();
};
