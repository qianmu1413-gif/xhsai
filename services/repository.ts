
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

// Helper: Extract Error Message safely
export const getErrorMessage = (error: any): string => {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    return error.message || error.details || error.hint || (typeof error === 'object' ? JSON.stringify(error) : String(error));
};

// 默认配置 - 移除硬编码的 API Key，确保安全
const DEFAULT_CONFIG: SystemConfig = {
    gemini: { 
        apiKey: "", // ⚠️ User must configure this in Admin Panel
        baseUrl: "https://api.vectorengine.ai", 
        model: "gemini-3-flash-preview" 
    },
    xhs: { apiKey: "", apiUrl: "https://xiaohongshu.day/api/v1/note" },
    cos: { secretId: "", secretKey: "", bucket: "", region: "ap-shanghai" },
    publish: { apiKey: "" }
};

// --- CONFIG REPOSITORY ---
export const configRepo = {
    getSystemConfig: async (): Promise<SystemConfig> => {
        if (!supabase) return DEFAULT_CONFIG;
        try {
            const { data } = await supabase.from('app_config').select('value').eq('key', 'global_config').maybeSingle();
            if (data?.value) {
                const loaded = data.value;
                return {
                    gemini: { ...DEFAULT_CONFIG.gemini, ...(loaded.gemini || {}) },
                    xhs: { ...DEFAULT_CONFIG.xhs, ...(loaded.xhs || {}) },
                    publish: { ...DEFAULT_CONFIG.publish, ...(loaded.publish || {}) },
                    cos: { ...DEFAULT_CONFIG.cos, ...(loaded.cos || {}) }
                };
            }
        } catch (e) { console.error("Config Load Error", e); }
        return DEFAULT_CONFIG;
    },

    saveSystemConfig: async (config: SystemConfig) => {
        if (!supabase) throw new Error("请先连接 Supabase 数据库");
        const { error } = await supabase.from('app_config').upsert({ key: 'global_config', value: config });
        if (error) throw new Error(getErrorMessage(error));
    }
};

// --- USER REPOSITORY ---
export const userRepo = {
  // 记录登录信息（IP等）
  recordLogin: async (userId: string, ip: string, location: string) => {
      if (!supabase || userId === 'admin') return;
      try {
          const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const currentData = data?.data || {};
          const newData = {
              ...currentData,
              lastIp: ip,
              location: location,
              lastLoginAt: Date.now()
          };
          await supabase.from('profiles').update({ data: newData }).eq('id', userId);
      } catch (e) { console.warn("Record Login Failed", e); }
  },

  // 心跳更新在线时长 (每分钟调用一次)
  updateHeartbeat: async (userId: string, secondsToAdd: number) => {
      if (!supabase || userId === 'admin') return;
      try {
          const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const currentData = data?.data || {};
          const currentTotal = currentData.totalOnlineSeconds || 0;
          const newData = {
              ...currentData,
              totalOnlineSeconds: currentTotal + secondsToAdd,
              lastActiveAt: Date.now()
          };
          await supabase.from('profiles').update({ data: newData }).eq('id', userId);
      } catch (e) {}
  },

  // 增加交互次数
  incrementInteraction: async (userId: string) => {
      if (!supabase || userId === 'admin') return;
      try {
          const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const currentData = data?.data || {};
          const currentCount = currentData.interactionCount || 0;
          const newData = {
              ...currentData,
              interactionCount: currentCount + 1
          };
          await supabase.from('profiles').update({ data: newData }).eq('id', userId);
      } catch (e) {}
  },

  login: async (username: string, code: string): Promise<{ user: User | null; error: string | null }> => {
    // 🔴 Updated Admin Credentials as requested
    if (username === 'bazhongjiu' && code === 'BZJ20040428') {
        return { 
            user: {
                id: 'admin', username: 'SuperAdmin', role: UserRole.ADMIN, inviteCode: 'SUPER',
                totalQuota: 99999, quotaRemaining: 99999, expiryDate: '2099-12-31', createdAt: Date.now()
            }, 
            error: null 
        };
    }

    if (!supabase) return { user: null, error: '数据库未连接' };

    try {
        const { data, error } = await supabase.from('profiles').select('*').eq('username', username).eq('password', code).maybeSingle();
        
        if (error) {
            return { user: null, error: `DB Error: ${getErrorMessage(error)}` };
        }
        if (!data) return { user: null, error: '账号或密码错误' };
        
        const extraData = data.data || {};
        
        // 用户登录时检查软删除状态
        if (extraData.isDeleted) return { user: null, error: '账号不存在' };
        if (extraData.isSuspended) return { user: null, error: '账号已停用' };

        return { 
            user: {
                id: data.id,
                username: data.username,
                role: data.role === 'admin' ? UserRole.ADMIN : UserRole.USER,
                inviteCode: 'CLOUD', 
                totalQuota: 100,
                quotaRemaining: data.quota_remaining || 0,
                expiryDate: '2099-12-31',
                createdAt: new Date(data.created_at).getTime(),
                isSuspended: false,
                // Analytics
                lastIp: extraData.lastIp,
                totalOnlineSeconds: extraData.totalOnlineSeconds || 0,
                interactionCount: extraData.interactionCount || 0,
                lastLoginAt: extraData.lastLoginAt,
                location: extraData.location,
                avatar: extraData.avatar
            }, 
            error: null 
        };
    } catch (e) { return { user: null, error: '登录请求失败' }; }
  },

  // 获取所有用户
  listUsers: async (includeDeleted: boolean = false): Promise<User[]> => {
      if (!supabase) return [];
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return (data || [])
          .map((row: any) => ({
              id: row.id,
              username: row.username,
              role: row.role === 'admin' ? UserRole.ADMIN : UserRole.USER,
              inviteCode: row.password, 
              totalQuota: 100,
              quotaRemaining: row.quota_remaining,
              expiryDate: '2099-12-31',
              createdAt: new Date(row.created_at).getTime(),
              isSuspended: row.data?.isSuspended || false,
              isDeleted: row.data?.isDeleted || false, // 软删除标记
              // Analytics
              lastIp: row.data?.lastIp || '-',
              totalOnlineSeconds: row.data?.totalOnlineSeconds || 0,
              interactionCount: row.data?.interactionCount || 0,
              lastLoginAt: row.data?.lastLoginAt,
              location: row.data?.location,
              avatar: row.data?.avatar
          }))
          .filter((u: User) => includeDeleted ? true : !u.isDeleted);
  },

  createUser: async (username: string, code: string): Promise<{ success: boolean; error?: string }> => {
      if (!supabase) return { success: false, error: "DB Disconnected" };
      const { data: existing } = await supabase.from('profiles').select('id, data').eq('username', username).maybeSingle();
      
      if (existing) {
          if (existing.data?.isDeleted) {
               const { error } = await supabase.from('profiles').update({ 
                   password: code, 
                   data: { ...existing.data, isDeleted: false, isSuspended: false } 
               }).eq('id', existing.id);
               return error ? { success: false, error: getErrorMessage(error) } : { success: true };
          }
          return { success: false, error: '用户名已存在' };
      }
      
      const { error } = await supabase.from('profiles').insert({ 
          id: safeUUID(), username: username, password: code, role: 'user', quota_remaining: 100,
          data: { isDeleted: false, isSuspended: false, interactionCount: 0, totalOnlineSeconds: 0 }
      });
      return { success: !error, error: error ? getErrorMessage(error) : undefined };
  },

  updateUserCredentials: async (userId: string, newUsername: string, newPassword: string) => {
      if (!supabase) return;
      await supabase.from('profiles').update({ username: newUsername, password: newPassword }).eq('id', userId);
  },

  toggleUserSuspension: async (userId: string, suspend: boolean) => {
      if (!supabase) return;
      const { data } = await supabase.from('profiles').select('data').eq('id', userId).single();
      const newData = { ...(data?.data || {}), isSuspended: suspend };
      await supabase.from('profiles').update({ data: newData }).eq('id', userId);
  },

  // 软删除用户
  deleteUser: async (userId: string): Promise<{success: boolean, message?: string}> => {
      if (!supabase) return { success: false, message: "数据库未连接" };
      if (userId === 'admin') return { success: false, message: "无法删除超级管理员" };
      
      try {
          const { data: current } = await supabase.from('profiles').select('data').eq('id', userId).single();
          const newData = { ...(current?.data || {}), isDeleted: true, deletedAt: Date.now() };

          const { error: softError } = await supabase.from('profiles').update({ 
              data: newData
          }).eq('id', userId);
          
          if (softError) {
              return { success: false, message: `Delete failed: ${getErrorMessage(softError)}` };
          }
          
          return { success: true, message: "用户已移除 (进入数据墓地)" };
      } catch (e) {
          return { success: false, message: getErrorMessage(e) };
      }
  },

  updateQuota: async (userId: string, newQuota: number) => {
      if (!supabase || userId === 'admin') return;
      await supabase.from('profiles').update({ quota_remaining: newQuota }).eq('id', userId);
  },
};

// --- FILE REPOSITORY ---
export const fileRepo = {
    saveUpload: async (userId: string, fileRecord: Partial<UserUpload>) => {
        if (!supabase) return;
        try {
            await supabase.from('user_uploads').insert({
                id: safeUUID(), user_id: userId, 
                file_url: fileRecord.file_url, file_type: fileRecord.file_type, 
                file_name: fileRecord.file_name, file_size: fileRecord.file_size || 0, 
                created_at: new Date().toISOString()
            });
        } catch (e) {}
    }
};

// --- LINK REPOSITORY ---
export const linkRepo = {
    saveLink: async (userId: string, linkRecord: Partial<SavedLink>) => {
        if (!supabase) return;
        try {
            await supabase.from('saved_links').insert({
                id: safeUUID(), user_id: userId, 
                original_url: linkRecord.original_url, page_title: linkRecord.page_title, 
                summary: linkRecord.summary, created_at: new Date().toISOString()
            });
        } catch (e) {}
    }
};

// --- PROJECT REPOSITORY ---
export const projectRepo = {
  listProjects: async (userId: string, includeDeleted: boolean = false): Promise<Project[]> => {
    if (!supabase) return [];
    
    const { data: cloudData, error } = await supabase.from('projects').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
    
    if (error || !cloudData) return [];

    return cloudData.map((row: any) => {
        const p = row.data || {};
        if (!includeDeleted && p.isDeleted === true) return null;
        
        return {
            id: row.id, 
            name: row.name, 
            updatedAt: new Date(row.updated_at).getTime(),
            contextText: p.contextText || '', 
            persona: p.persona, 
            fidelity: p.fidelity || FidelityMode.STRICT, 
            chatHistory: p.chatHistory || [], 
            attachedFiles: p.attachedFiles || [], 
            socialNotes: p.socialNotes || [],
            generatedContent: p.generatedContent || '', 
            previewState: p.previewState || { title: '', images: [] },
            drafts: p.drafts || [], 
            publishedHistory: p.publishedHistory || [], 
            wordCountLimit: p.wordCountLimit || 400,
            isDeleted: p.isDeleted || false,
            materialAnalysis: p.materialAnalysis 
        };
    }).filter(p => p !== null) as Project[];
  },

  saveProject: async (userId: string, project: Project): Promise<string | null> => {
    if (!supabase) return null;

    const dbPayload = {
        id: project.id.startsWith('temp-') ? undefined : project.id,
        user_id: userId,
        name: project.name,
        updated_at: new Date(project.updatedAt).toISOString(),
        data: {
            contextText: project.contextText, 
            persona: project.persona, 
            fidelity: project.fidelity, 
            chatHistory: project.chatHistory, 
            attachedFiles: project.attachedFiles, 
            socialNotes: project.socialNotes,
            generatedContent: project.generatedContent, 
            previewState: project.previewState, 
            drafts: project.drafts,
            publishedHistory: project.publishedHistory, 
            wordCountLimit: project.wordCountLimit, 
            isDeleted: project.isDeleted || false,
            materialAnalysis: project.materialAnalysis 
        }
    };

    const { data, error } = await supabase.from('projects').upsert(dbPayload).select('id').single();
    if (error) {
        console.error("Save Project Error:", error);
        throw new Error(getErrorMessage(error));
    }
    return data.id;
  },

  deleteProject: async (userId: string, projectId: string) => {
      if (!supabase) throw new Error("数据库未连接");
      try {
          const { data: current, error: fetchError } = await supabase.from('projects').select('data').eq('id', projectId).single();
          if (fetchError || !current) return; 

          const newData = { ...(current.data || {}), isDeleted: true };
          const { error: softError } = await supabase.from('projects').update({ data: newData }).eq('id', projectId);
          
          if (softError) throw new Error(getErrorMessage(softError));

      } catch (e: any) {
          throw new Error(`Deletion Error: ${getErrorMessage(e)}`);
      }
  },

  aggregateUserAssets: async (userId: string, includeDeleted: boolean = false): Promise<{ personas: any[]; assets: any[]; finished: any[]; }> => {
      const projects = await projectRepo.listProjects(userId, includeDeleted);
      
      const personas = projects.filter(p => p.persona && p.persona.tone).map(p => ({ ...p.persona, sourceProject: p.name, projectId: p.id }));
      
      const assets = projects.flatMap(p => {
             const notes = (p.socialNotes || [])
                .filter(n => includeDeleted ? true : !n.isDeleted)
                .map(note => ({ ...note, type: 'note', sourceProject: p.name, projectId: p.id } as any));
             
             const files = (p.attachedFiles || [])
                .filter(f => f.type === 'image')
                .filter(f => includeDeleted ? true : !f.isDeleted)
                .map(img => ({ ...img, type: 'image', sourceProject: p.name, projectId: p.id } as any));
             
             return [...notes, ...files];
      });
      
      const finished = projects.flatMap(p => {
              const drafts = (p.drafts || [])
                .filter(d => includeDeleted ? true : !d.isDeleted)
                .map(d => ({ ...d, type: 'draft', sourceProject: p.name, projectId: p.id }));
              
              const pubs = (p.publishedHistory || [])
                .filter(pub => includeDeleted ? true : !pub.isDeleted)
                .map(pub => ({ ...pub, type: 'published', sourceProject: p.name, projectId: p.id }));
              
              return [...drafts, ...pubs];
      });
      return { personas, assets, finished };
  }
};
