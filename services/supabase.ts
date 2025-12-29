
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuration Keys
export const STORAGE_KEY_SUPABASE_URL = 'rednote_sys_sb_url';
export const STORAGE_KEY_SUPABASE_KEY = 'rednote_sys_sb_key';

// =================================================================
// 🟢 核心配置区 (分发账号必填)
// =================================================================
// 1. URL: 您的 Supabase 项目地址 (已预填)
const HARDCODED_URL = 'https://ohesrabpblaxboctfbes.supabase.co'; 

// 2. KEY: 您的 Supabase Anon Key (Public)
// ⚠️ 请去 Supabase 后台 > Settings > API > Project API keys > anon public 复制
// ⚠️ 填入下方引号中，例如: 'eyJhbGciOiJIUzI1NiIsInR5cCI...'
const HARDCODED_KEY = ''; 
// =================================================================

// Default / Env Configuration
const ENV_URL = process.env.REACT_APP_SUPABASE_URL || HARDCODED_URL;
const ENV_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || HARDCODED_KEY;

// Helper to get current config
const getStoredConfig = () => {
    // 1. 优先使用代码硬编码的配置 (适合分发给用户)
    if (HARDCODED_URL && HARDCODED_KEY) {
        return { url: HARDCODED_URL, key: HARDCODED_KEY };
    }
    // 2. 其次使用本地缓存 (适合开发或通过向导配置)
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
