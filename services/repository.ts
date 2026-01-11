
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

// Helper: Extract Error Message safely (Fixed [object Object] issue)
export const getErrorMessage = (error: any): string => {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    
    // 优先返回 Supabase 的标准错误信息
    if (error.message) return error.message;
    if (error.error_description) return error.error_description;
    if (error.details) return error.details;
    if (error.hint) return error.hint;
    
    // 兜底：转为 JSON 字符串，避免 [object Object]
    try {
        return JSON.stringify(error, null, 2);
    } catch (e) {
        return "Internal Error (Unserializable Object)";
    }
};

// 🛡️ Safe Environment Variable Access (Prevents crash in browsers where process is undefined)
const getEnv = (key: string) => {
    try {
        // @ts-ignore
        return (typeof process !== 'undefined' && process.env) ? process.env[key] : "";
    } catch { return ""; }
};

// 默认配置 (敏感信息从环境变量加载，或者等待数据库配置)
const DEFAULT_CONFIG: SystemConfig = {
    gemini: { 
        apiKey: getEnv('API_KEY') || "", 
        // 允许通过环境变量配置中转地址，默认留空使用官方地址 (或 SDK 默认值)
        baseUrl: getEnv('GEMINI_BASE_URL') || "", 
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

// --- CONFIG REPOSITORY ---
export const configRepo = {
    getSystemConfig: async (): Promise<SystemConfig> => {
        let dbConfig: any = null;
        let localConfig: any = null;

        // 1. 优先尝试从云端数据库加载
        if (supabase) {
            try {
                const { data, error } = await supabase.from('app_config').select('value').eq('key', 'global_config').maybeSingle();
                if (!error && data?.value) {
                    dbConfig = data.value;
                    console.debug("[Config] Loaded from Database (Source of Truth)");
                }
            } catch (e) { console.warn("Cloud Config Load Warning:", e); }
        }

        // 2. 加载本地缓存 (Fallback)
        if (typeof localStorage !== 'undefined') {
            try {
                const local = localStorage.getItem('rednote_sys_config');
                if (local) {
                    localConfig = JSON.parse(local);
                }
            } catch(e) {}
        }

        // 3. 深度合并逻辑：数据库配置 > 本地配置 > 默认配置
        // 🟢 修正：确保数据库是最高优先级。如果数据库连接成功且有值，它将覆盖本地缓存。
        // 这样如果用户在数据库手动改了Key，这里一定会生效。
        const mergedGemini = { ...DEFAULT_CONFIG.gemini, ...(localConfig?.gemini || {}), ...(dbConfig?.gemini || {}) };
        const mergedXhs = { ...DEFAULT_CONFIG.xhs, ...(localConfig?.xhs || {}), ...(dbConfig?.xhs || {}) };
        const mergedPublish = { ...DEFAULT_CONFIG.publish, ...(localConfig?.publish || {}), ...(dbConfig?.publish || {}) };
        const mergedCos = { ...DEFAULT_CONFIG.cos, ...(localConfig?.cos || {}), ...(dbConfig?.cos || {}) };

        return {
            gemini: mergedGemini,
            xhs: mergedXhs,
            publish: mergedPublish,
            cos: mergedCos
        };
    },

    saveSystemConfig: async (config: SystemConfig) => {
        // 1. 总是先保存到本地作为备份
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('rednote_sys_config', JSON.stringify(config));
        }

        // 2. 尝试保存到云端
        if (!supabase) throw new Error("数据库未连接 (配置已保存至本地)");
        
        const { error } = await supabase.from('app_config').upsert({ key: 'global_config', value: config });
        
        if (error) {
            // 如果是表不存在的错误，给予友好提示，但不要阻断流程（因为本地已经保存了）
            if (error.code === '42P01') { // PostgreSQL code for undefined_table
                console.warn("Table 'app_config' missing. Configuration saved locally only.");
                throw new Error("云端保存失败：缺少配置表。但配置已在本地生效，您可以继续使用。");
            }
            throw new Error(getErrorMessage(error));
        }
    }
};

// --- USER REPOSITORY ---
export const userRepo = {
  // 记录登录信息 (管理员不记录)
  recordLogin: async (userId: string, ip: string, location: string) => {
      if (!supabase || userId === 'admin_user_001' || userId.startsWith('00000000')) return;
      try {
          const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const currentData = data?.data || {};
          const newData = { ...currentData, lastIp: ip, location: location, lastLoginAt: Date.now() };
          await supabase.from('profiles').update({ data: newData }).eq('id', userId);
      } catch (e) { console.warn("Record Login Failed", e); }
  },

  updateHeartbeat: async (userId: string, secondsToAdd: number) => {
      if (!supabase || userId === 'admin_user_001' || userId.startsWith('00000000')) return;
      try {
          const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const currentData = data?.data || {};
          const newData = { ...currentData, totalOnlineSeconds: (currentData.totalOnlineSeconds || 0) + secondsToAdd, lastActiveAt: Date.now() };
          await supabase.from('profiles').update({ data: newData }).eq('id', userId);
      } catch (e) {}
  },

  incrementInteraction: async (userId: string) => {
      if (!supabase || userId === 'admin_user_001' || userId.startsWith('00000000')) return;
      try {
          const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const currentData = data?.data || {};
          const newData = { ...currentData, interactionCount: (currentData.interactionCount || 0) + 1 };
          await supabase.from('profiles').update({ data: newData }).eq('id', userId);
      } catch (e) {}
  },

  login: async (username: string, code: string): Promise<{ user: User | null; error: string | null }> => {
    // 🛡️ SECURITY ENFORCED: Database Only Authentication
    if (!supabase) return { user: null, error: '系统未初始化 (Missing DB Key)' };

    const cleanUsername = username.trim();
    const cleanCode = code.trim();

    try {
        let rawData = null;

        // 🟢 1. 优先尝试 RPC 登录 (这是最高效的方式)
        const { data: rpcData, error: rpcError } = await supabase.rpc('login_user', { _username: cleanUsername, _password: cleanCode });
        
        // 🟢 核心修复：只要 RPC 报错，无论什么错误码，都进行降级处理
        if (rpcError) {
             const isFunctionMissing = rpcError.code === 'PGRST202' || rpcError.message?.includes('function') || rpcError.message?.includes('found');
             if (isFunctionMissing) {
                console.log(`[Info] RPC Login function not found, switching to direct query fallback.`);
             } else {
                console.warn(`[Warn] RPC Login Failed (${rpcError.code || 'Unknown'}), switching to fallback.`);
             }
             
             // 🟡 2. 降级方案: 直接查询 profiles 表
             const { data: directData, error: directError } = await supabase
                .from('profiles')
                .select('*')
                .eq('username', cleanUsername)
                .eq('password', cleanCode)
                .maybeSingle();

             if (directError) {
                 return { user: null, error: `登录服务异常: ${getErrorMessage(directError)}` };
             }
             
             if (!directData) {
                 return { user: null, error: '账号或密码错误' };
             }
             rawData = directData;
        } else {
            if (rpcData) {
                rawData = Array.isArray(rpcData) ? rpcData[0] : rpcData;
            }
        }

        if (!rawData) return { user: null, error: '账号或密码错误' };
        
        const extraData = rawData.data || {};
        if (extraData.isDeleted) return { user: null, error: '账号不存在' };
        if (extraData.isSuspended) return { user: null, error: '账号已停用' };

        return { 
            user: {
                id: rawData.id,
                username: rawData.username,
                role: rawData.role === 'admin' ? UserRole.ADMIN : UserRole.USER,
                inviteCode: cleanCode, // Store clean code in session
                totalQuota: 100,
                quotaRemaining: rawData.quota_remaining || 0,
                expiryDate: '2099-12-31',
                createdAt: new Date(rawData.created_at).getTime(),
                isSuspended: false,
                lastIp: extraData.lastIp,
                totalOnlineSeconds: extraData.totalOnlineSeconds || 0,
                interactionCount: extraData.interactionCount || 0,
                lastLoginAt: extraData.lastLoginAt,
                location: extraData.location,
                avatar: extraData.avatar
            }, 
            error: null 
        };
    } catch (e: any) { 
        console.error("Login Exception:", e);
        return { user: null, error: `请求失败: ${getErrorMessage(e)}` }; 
    }
  },

  listUsers: async (includeDeleted: boolean = false): Promise<User[]> => {
      if (!supabase) return [];
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return (data || []).map((row: any) => ({
          id: row.id,
          username: row.username,
          role: row.role === 'admin' ? UserRole.ADMIN : UserRole.USER,
          inviteCode: row.password, 
          totalQuota: 100,
          quotaRemaining: row.quota_remaining,
          expiryDate: '2099-12-31',
          createdAt: new Date(row.created_at).getTime(),
          isSuspended: row.data?.isSuspended || false,
          isDeleted: row.data?.isDeleted || false,
          lastIp: row.data?.lastIp || '-',
          totalOnlineSeconds: row.data?.totalOnlineSeconds || 0,
          interactionCount: row.data?.interactionCount || 0,
          lastLoginAt: row.data?.lastLoginAt,
          location: row.data?.location,
          avatar: row.data?.avatar
      })).filter((u: User) => includeDeleted ? true : !u.isDeleted);
  },

  createUser: async (username: string, code: string): Promise<{ success: boolean; error?: string }> => {
      if (!supabase) return { success: false, error: "DB Disconnected" };
      const cleanUsername = username.trim();
      const cleanCode = code.trim();
      
      const { data: existing } = await supabase.from('profiles').select('id, data').eq('username', cleanUsername).maybeSingle();
      
      if (existing) {
          if (existing.data?.isDeleted) {
               const { error } = await supabase.from('profiles').update({ password: cleanCode, data: { ...existing.data, isDeleted: false, isSuspended: false } }).eq('id', existing.id);
               return error ? { success: false, error: getErrorMessage(error) } : { success: true };
          }
          return { success: false, error: '用户名已存在' };
      }
      
      const { error } = await supabase.from('profiles').insert({ 
          id: safeUUID(), username: cleanUsername, password: cleanCode, role: 'user', quota_remaining: 100,
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
      const newData = { ...(data?.data || {}), isSuspended: suspend };
      await supabase.from('profiles').update({ data: newData }).eq('id', userId);
  },

  deleteUser: async (userId: string): Promise<{success: boolean, message?: string}> => {
      if (!supabase) return { success: false, message: "数据库未连接" };
      if (userId === 'admin_user_001' || userId.startsWith('00000000')) return { success: false, message: "无法删除超级管理员" };
      try {
          const { data: current } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const newData = { ...(current?.data || {}), isDeleted: true, deletedAt: Date.now() };
          const { error } = await supabase.from('profiles').update({ data: newData }).eq('id', userId);
          if (error) return { success: false, message: getErrorMessage(error) };
          return { success: true, message: "用户已移除" };
      } catch (e) { return { success: false, message: getErrorMessage(e) }; }
  },

  updateQuota: async (userId: string, newQuota: number) => {
      if (!supabase || userId === 'admin') return;
      await supabase.from('profiles').update({ quota_remaining: newQuota }).eq('id', userId);
  },
};

export const fileRepo = {
    saveUpload: async (userId: string, fileRecord: Partial<UserUpload>) => {
        if (!supabase) return;
        try { await supabase.from('user_uploads').insert({ id: safeUUID(), user_id: userId, file_url: fileRecord.file_url, file_type: fileRecord.file_type, file_name: fileRecord.file_name, file_size: fileRecord.file_size || 0, created_at: new Date().toISOString() }); } catch (e) {}
    }
};

export const linkRepo = {
    saveLink: async (userId: string, linkRecord: Partial<SavedLink>) => {
        if (!supabase) return;
        try { await supabase.from('saved_links').insert({ id: safeUUID(), user_id: userId, original_url: linkRecord.original_url, page_title: linkRecord.page_title, summary: linkRecord.summary, created_at: new Date().toISOString() }); } catch (e) {}
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
        id: finalId,
        user_id: userId, name: project.name, updated_at: new Date(project.updatedAt).toISOString(),
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
      const newData = { ...(current.data || {}), isDeleted: true };
      await supabase.from('projects').update({ data: newData }).eq('id', projectId);
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
