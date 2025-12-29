
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuration Keys
export const STORAGE_KEY_SUPABASE_URL = 'rednote_sys_sb_url';
export const STORAGE_KEY_SUPABASE_KEY = 'rednote_sys_sb_key';

// 🟢 系统配置：在此处填入 Supabase 连接信息，即可免去所有用户的初始化步骤
// 如果留空，则系统会进入“安装模式”，要求每个浏览器单独配置
const HARDCODED_URL = 'https://ohesrabpblaxboctfbes.supabase.co'; 
const HARDCODED_KEY = ''; // 在此处填入您的 Anon Key (eyJ...)

// Default / Env Configuration
const ENV_URL = process.env.REACT_APP_SUPABASE_URL || HARDCODED_URL;
const ENV_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || HARDCODED_KEY;

// Helper to get current config
const getStoredConfig = () => {
    // 优先使用硬编码配置
    if (HARDCODED_URL && HARDCODED_KEY) {
        return { url: HARDCODED_URL, key: HARDCODED_KEY };
    }
    // 其次使用本地缓存或环境变量
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
