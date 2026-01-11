
import { supabase } from './supabase';
import { Project, User, UserRole, FidelityMode, SystemConfig, UserUpload, SavedLink } from '../types';

// Helper: Safe UUID Generator
const safeUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const getErrorMessage = (error: any): string => {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.error_description) return error.error_description;
    if (error.details) return error.details;
    try { return JSON.stringify(error, null, 2); } catch (e) { return "Internal Error"; }
};

const getEnv = (key: string) => {
    try {
        // @ts-ignore
        return (typeof process !== 'undefined' && process.env) ? process.env[key] : "";
    } catch { return ""; }
};

const DEFAULT_CONFIG: SystemConfig = {
    gemini: { 
        apiKey: getEnv('API_KEY') || "", 
        // 🟢 Updated: Default to VectorEngine as requested
        baseUrl: getEnv('GEMINI_BASE_URL') || "https://api.vectorengine.ai/v1", 
        model: "gemini-3-flash-preview" 
    },
    xhs: { 
        apiKey: getEnv('XHS_API_KEY') || "", 
        apiUrl: "https://xiaohongshu.day/api/v1/note" 
    },
    cos: { 
        secretId: getEnv('COS_SECRET_ID') || "", 
        secretKey: getEnv('COS_SECRET_KEY') || "", 
        bucket: getEnv('COS_BUCKET') || "", 
        region: getEnv('COS_REGION') || "" 
    },
    publish: { 
        apiKey: getEnv('PUBLISH_API_KEY') || "",
        targetUrl: "https://www.myaibot.vip/api/rednote/publish"
    }
};

const LOCAL_STORAGE_CONFIG_KEY = 'rednote_system_config_v1';

// --- CONFIG REPOSITORY ---
export const configRepo = {
    getSystemConfig: async (): Promise<SystemConfig> => {
        let dbConfig: any = null;
        let localConfig: any = null;

        // 1. 获取 LocalStorage 配置 (作为最新编辑的备份)
        try {
            const localStr = localStorage.getItem(LOCAL_STORAGE_CONFIG_KEY);
            if (localStr) {
                localConfig = JSON.parse(localStr);
            }
        } catch (e) {}

        // 2. 尝试从 Supabase 获取配置
        if (supabase) {
            try {
                const { data, error } = await supabase.from('app_config').select('value').eq('key', 'global_config').maybeSingle();
                if (!error && data?.value) {
                    dbConfig = data.value;
                }
            } catch (e) { console.warn("[Config] DB Error:", e); }
        }

        const baseGemini = dbConfig?.gemini || {};
        const localGemini = localConfig?.gemini || {};

        let apiKey = (localGemini.apiKey || baseGemini.apiKey || DEFAULT_CONFIG.gemini.apiKey || "").trim();
        let baseUrl = (localGemini.baseUrl || baseGemini.baseUrl || DEFAULT_CONFIG.gemini.baseUrl || "").trim();
        let model = (localGemini.model || baseGemini.model || DEFAULT_CONFIG.gemini.model || "").trim();

        // 🚨 强制纠错逻辑：
        // 如果用户使用的是 sk- 开头的 Key（第三方中转 Key），
        // 但 Base URL 却是空的，或者是 Google 官方地址 (googleapis.com)，
        // 则强制修正为 VectorEngine 地址。这能防止因为缓存了旧配置导致请求发往 Google 而报错。
        if (apiKey.startsWith('sk-')) {
            if (!baseUrl || baseUrl.includes('googleapis.com')) {
                console.warn("Detected 'sk-' key with invalid/google base URL. Forcing update to VectorEngine.");
                baseUrl = "https://api.vectorengine.ai/v1";
            }
        }

        const mergedGemini = { apiKey, baseUrl, model };

        const mergedXhs = { ...DEFAULT_CONFIG.xhs, ...(dbConfig?.xhs || {}), ...(localConfig?.xhs || {}) };
        const mergedPublish = { ...DEFAULT_CONFIG.publish, ...(dbConfig?.publish || {}), ...(localConfig?.publish || {}) };
        const mergedCos = { ...DEFAULT_CONFIG.cos, ...(dbConfig?.cos || {}), ...(localConfig?.cos || {}) };

        return {
            gemini: mergedGemini,
            xhs: mergedXhs,
            publish: mergedPublish,
            cos: mergedCos
        };
    },

    saveSystemConfig: async (config: SystemConfig) => {
        // 1. 总是先保存到 LocalStorage
        try {
            localStorage.setItem(LOCAL_STORAGE_CONFIG_KEY, JSON.stringify(config));
        } catch (e) { console.error("LocalStorage Save Failed", e); }

        // 2. 尝试同步到 Supabase
        if (!supabase) return; 
        
        const { error } = await supabase.from('app_config').upsert({ key: 'global_config', value: config });
        if (error) {
            // 如果表不存在，仅警告
            if (error.code === '42P01') {
                console.warn("Table 'app_config' missing. Config saved locally only.");
                return;
            }
            throw new Error(getErrorMessage(error));
        }
    }
};

// --- USER REPOSITORY (Unchanged) ---
export const userRepo = {
  recordLogin: async (userId: string, ip: string, location: string) => {
      if (!supabase || userId === 'admin_user_001' || userId.startsWith('00000000')) return;
      try {
          const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const newData = { ...(data?.data || {}), lastIp: ip, location: location, lastLoginAt: Date.now() };
          await supabase.from('profiles').update({ data: newData }).eq('id', userId);
      } catch (e) {}
  },
  updateHeartbeat: async (userId: string, secondsToAdd: number) => {
      if (!supabase || userId === 'admin_user_001' || userId.startsWith('00000000')) return;
      try {
          const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const newData = { ...(data?.data || {}), totalOnlineSeconds: (data?.data?.totalOnlineSeconds || 0) + secondsToAdd, lastActiveAt: Date.now() };
          await supabase.from('profiles').update({ data: newData }).eq('id', userId);
      } catch (e) {}
  },
  incrementInteraction: async (userId: string) => {
      if (!supabase || userId === 'admin_user_001' || userId.startsWith('00000000')) return;
      try {
          const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const newData = { ...(data?.data || {}), interactionCount: (data?.data?.interactionCount || 0) + 1 };
          await supabase.from('profiles').update({ data: newData }).eq('id', userId);
      } catch (e) {}
  },
  login: async (username: string, code: string): Promise<{ user: User | null; error: string | null }> => {
    if (!supabase) return { user: null, error: 'DB Disconnected' };
    const cleanUsername = username.trim();
    const cleanCode = code.trim();
    try {
        let rawData = null;
        const { data: rpcData, error: rpcError } = await supabase.rpc('login_user', { _username: cleanUsername, _password: cleanCode });
        if (rpcError) {
             const { data: directData } = await supabase.from('profiles').select('*').eq('username', cleanUsername).eq('password', cleanCode).maybeSingle();
             if (!directData) return { user: null, error: '账号或密码错误' };
             rawData = directData;
        } else {
            rawData = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        }
        if (!rawData) return { user: null, error: '账号或密码错误' };
        const extraData = rawData.data || {};
        if (extraData.isDeleted) return { user: null, error: '账号不存在' };
        if (extraData.isSuspended) return { user: null, error: '账号已停用' };
        return { 
            user: {
                id: rawData.id, username: rawData.username, role: rawData.role === 'admin' ? UserRole.ADMIN : UserRole.USER,
                inviteCode: cleanCode, totalQuota: 100, quotaRemaining: rawData.quota_remaining || 0, expiryDate: '2099-12-31',
                createdAt: new Date(rawData.created_at).getTime(), isSuspended: false, lastIp: extraData.lastIp,
                totalOnlineSeconds: extraData.totalOnlineSeconds || 0, interactionCount: extraData.interactionCount || 0,
                lastLoginAt: extraData.lastLoginAt, location: extraData.location, avatar: extraData.avatar
            }, error: null 
        };
    } catch (e: any) { return { user: null, error: `Login Error: ${getErrorMessage(e)}` }; }
  },
  listUsers: async (includeDeleted: boolean = false): Promise<User[]> => {
      if (!supabase) return [];
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return (data || []).map((row: any) => ({
          id: row.id, username: row.username, role: row.role === 'admin' ? UserRole.ADMIN : UserRole.USER,
          inviteCode: row.password, totalQuota: 100, quotaRemaining: row.quota_remaining, expiryDate: '2099-12-31',
          createdAt: new Date(row.created_at).getTime(), isSuspended: row.data?.isSuspended || false,
          isDeleted: row.data?.isDeleted || false, lastIp: row.data?.lastIp || '-',
          totalOnlineSeconds: row.data?.totalOnlineSeconds || 0, interactionCount: row.data?.interactionCount || 0,
          lastLoginAt: row.data?.lastLoginAt, location: row.data?.location, avatar: row.data?.avatar
      })).filter((u: User) => includeDeleted ? true : !u.isDeleted);
  },
  createUser: async (username: string, code: string): Promise<{ success: boolean; error?: string }> => {
      if (!supabase) return { success: false, error: "DB Disconnected" };
      const { data: existing } = await supabase.from('profiles').select('id, data').eq('username', username.trim()).maybeSingle();
      if (existing) {
          if (existing.data?.isDeleted) {
               await supabase.from('profiles').update({ password: code.trim(), data: { ...existing.data, isDeleted: false, isSuspended: false } }).eq('id', existing.id);
               return { success: true };
          }
          return { success: false, error: '用户名已存在' };
      }
      const { error } = await supabase.from('profiles').insert({ 
          id: safeUUID(), username: username.trim(), password: code.trim(), role: 'user', quota_remaining: 100,
          data: { isDeleted: false, isSuspended: false, interactionCount: 0, totalOnlineSeconds: 0 }
      });
      return { success: !error, error: error ? getErrorMessage(error) : undefined };
  },
  updateUserCredentials: async (userId: string, newUsername: string, newPassword: string) => {
      if (!supabase) return;
      await supabase.from('profiles').update({ username: newUsername.trim(), password: newPassword.trim() }).eq('id', userId);
  },
  toggleUserSuspension: async (userId: string, suspend: boolean) => {
      if (!supabase) return;
      const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
      await supabase.from('profiles').update({ data: { ...(data?.data || {}), isSuspended: suspend } }).eq('id', userId);
  },
  deleteUser: async (userId: string): Promise<{success: boolean, message?: string}> => {
      if (!supabase) return { success: false, message: "数据库未连接" };
      if (userId === 'admin_user_001') return { success: false, message: "无法删除超级管理员" };
      try {
          const { data: current } = await supabase.from('profiles').select('data').eq('id', userId).single();
          await supabase.from('profiles').update({ data: { ...(current?.data || {}), isDeleted: true, deletedAt: Date.now() } }).eq('id', userId);
          return { success: true, message: "用户已移除" };
      } catch (e) { return { success: false, message: getErrorMessage(e) }; }
  },
  restoreUser: async (userId: string): Promise<{success: boolean, message?: string}> => {
      if (!supabase) return { success: false, message: "数据库未连接" };
      try {
          const { data: current } = await supabase.from('profiles').select('data').eq('id', userId).single();
          await supabase.from('profiles').update({ data: { ...(current?.data || {}), isDeleted: false } }).eq('id', userId);
          return { success: true, message: "用户已还原" };
      } catch (e) { return { success: false, message: getErrorMessage(e) }; }
  },
  updateQuota: async (userId: string, newQuota: number) => {
      if (!supabase) return;
      await supabase.from('profiles').update({ quota_remaining: newQuota }).eq('id', userId);
  },
};

export const fileRepo = {
    saveUpload: async (userId: string, fileRecord: Partial<UserUpload>) => {
        if (!supabase) return;
        try { await supabase.from('user_uploads').insert({ id: safeUUID(), user_id: userId, ...fileRecord, created_at: new Date().toISOString() }); } catch (e) {}
    }
};

export const linkRepo = {
    saveLink: async (userId: string, linkRecord: Partial<SavedLink>) => {
        if (!supabase) return;
        try { await supabase.from('saved_links').insert({ id: safeUUID(), user_id: userId, ...linkRecord, created_at: new Date().toISOString() }); } catch (e) {}
    }
};

export const projectRepo = {
  listProjects: async (userId: string, includeDeleted: boolean = false): Promise<Project[]> => {
    if (!supabase) return [];
    const { data: cloudData, error } = await supabase.from('projects').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
    if (error || !cloudData) return [];
    return cloudData.map((row: any) => {
        const p = row.data || {};
        if (!includeDeleted && p.isDeleted === true) return null;
        return {
            id: row.id, name: row.name, updatedAt: new Date(row.updated_at).getTime(),
            contextText: p.contextText || '', persona: p.persona, fidelity: p.fidelity || FidelityMode.STRICT, 
            chatHistory: p.chatHistory || [], attachedFiles: p.attachedFiles || [], socialNotes: p.socialNotes || [],
            generatedContent: p.generatedContent || '', previewState: p.previewState || { title: '', images: [] }, 
            drafts: p.drafts || [], publishedHistory: p.publishedHistory || [], wordCountLimit: p.wordCountLimit || 400,
            isDeleted: p.isDeleted || false, materialAnalysis: p.materialAnalysis 
        };
    }).filter(p => p !== null) as Project[];
  },

  saveProject: async (userId: string, project: Project): Promise<string | null> => {
    if (!supabase) return null;
    const isNew = project.id.startsWith('temp-');
    const finalId = isNew ? safeUUID() : project.id;
    const dbPayload = {
        id: finalId, user_id: userId, name: project.name, updated_at: new Date(project.updatedAt).toISOString(),
        data: {
            contextText: project.contextText, persona: project.persona, fidelity: project.fidelity, 
            chatHistory: project.chatHistory, attachedFiles: project.attachedFiles, socialNotes: project.socialNotes,
            generatedContent: project.generatedContent, previewState: project.previewState, drafts: project.drafts,
            publishedHistory: project.publishedHistory, wordCountLimit: project.wordCountLimit, 
            isDeleted: project.isDeleted || false, materialAnalysis: project.materialAnalysis 
        }
    };
    const { data, error } = await supabase.from('projects').upsert(dbPayload).select('id').single();
    if (error) throw new Error(getErrorMessage(error));
    return data.id;
  },

  deleteProject: async (userId: string, projectId: string) => {
      if (!supabase) throw new Error("数据库未连接");
      const { data: current } = await supabase.from('projects').select('data').eq('id', projectId).single();
      if (!current) return; 
      await supabase.from('projects').update({ data: { ...(current.data || {}), isDeleted: true } }).eq('id', projectId);
  },

  aggregateUserAssets: async (userId: string, includeDeleted: boolean = false): Promise<{ personas: any[]; assets: any[]; finished: any[]; }> => {
      const projects = await projectRepo.listProjects(userId, includeDeleted);
      const personas = projects.filter(p => p.persona && p.persona.tone).map(p => ({ ...p.persona, sourceProject: p.name, projectId: p.id }));
      const assets = projects.flatMap(p => {
             const notes = (p.socialNotes || []).filter(n => includeDeleted ? true : !n.isDeleted).map(note => ({ ...note, type: 'note', sourceProject: p.name, projectId: p.id } as any));
             const files = (p.attachedFiles || []).filter(f => f.type === 'image').filter(f => includeDeleted ? true : !f.isDeleted).map(img => ({ ...img, type: 'image', sourceProject: p.name, projectId: p.id } as any));
             return [...notes, ...files];
      });
      const finished = projects.flatMap(p => {
              const drafts = (p.drafts || []).filter(d => includeDeleted ? true : !d.isDeleted).map(d => ({ ...d, type: 'draft', sourceProject: p.name, projectId: p.id }));
              const pubs = (p.publishedHistory || []).filter(pub => includeDeleted ? true : !pub.isDeleted).map(pub => ({ ...pub, type: 'published', sourceProject: p.name, projectId: p.id }));
              return [...drafts, ...pubs];
      });
      return { personas, assets, finished };
  }
};
