
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =================================================================
// 🟢 系统核心配置 (已内置)
// =================================================================

// 1. URL: 您的 Supabase 项目地址
const HARDCODED_URL = 'https://ohesrabpblaxboctfbes.supabase.co'; 

// 2. KEY: 您的 Supabase Anon Key (Public)
// ⚠️ 必填：请将您的 key 粘贴在下方的引号中，保存后即可生效
const HARDCODED_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oZXNyYWJwYmxheGJvY3RmYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NTkxMzcsImV4cCI6MjA4MjIzNTEzN30.ZTxvJ2zKPc6DqGzHjcetkXh6tn07juCiUWhAoi8F93c'; 

// =================================================================

// Singleton Client
let supabaseInstance: SupabaseClient | null = null;

export const initSupabase = (): SupabaseClient | null => {
    if (supabaseInstance) return supabaseInstance;

    // 只有当 Key 被填入时才初始化
    if (HARDCODED_URL && HARDCODED_KEY && HARDCODED_KEY.length > 20) {
        try {
            supabaseInstance = createClient(HARDCODED_URL, HARDCODED_KEY, {
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
    } else {
        console.warn("⚠️ 警告: Supabase Anon Key 未配置，无法连接数据库。请在 services/supabase.ts 中填入 Key。");
    }
    return null;
};

// Initialize on load
export const supabase = initSupabase();

// 强制标记为云端模式，跳过所有初始化向导
export const isCloudMode = true;
