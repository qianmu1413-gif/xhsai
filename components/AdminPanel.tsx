
import React, { useState, useEffect } from 'react';
import { User, UserRole, SystemConfig, Project } from '../types';
import { Trash2, ShieldCheck, Layout, Save, Settings, Terminal, Plus, Key, Link2, Cpu, User as UserIcon, RefreshCcw, Eye, X, FileText, Database, Calendar, Loader2, Copy, CheckCircle, Globe, Send, Dice5, Edit, PauseCircle, PlayCircle, Image as ImageIcon, Sparkles, QrCode, AlertTriangle, Activity, Clock, MapPin, Zap, Lock, Skull, Ghost, Search, HardDrive, Users, Server, BarChart3, CloudLightning, LogOut, Link as LinkIcon, RotateCcw } from 'lucide-react';
import { testConnection } from '../services/geminiService';
import { userRepo, configRepo, projectRepo, getErrorMessage } from '../services/repository'; 
import Toast, { ToastState } from './Toast';

interface AdminPanelProps {
  onLogout: () => void;
  onEnterWorkstation: () => void;
  onImpersonate: (user: User) => void;
}

// Minimalist High-Tech Card
const StatCard = ({ title, value, subValue, icon: Icon, color = "text-white" }: { title: string, value: string | number, subValue?: string, icon: any, color?: string }) => (
    <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-5 flex items-start justify-between group hover:border-slate-700 transition-all shadow-lg hover:shadow-2xl hover:shadow-slate-900/50">
        <div>
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{title}</div>
            <div className={`text-2xl font-bold ${color} mb-1 tracking-tight`}>{value}</div>
            {subValue && <div className="text-[10px] text-slate-500 font-medium">{subValue}</div>}
        </div>
        <div className="p-3 bg-slate-800/50 rounded-xl text-slate-400 group-hover:text-white group-hover:bg-slate-800 transition-colors">
            <Icon size={20} />
        </div>
    </div>
);

const AdminPanel: React.FC<AdminPanelProps> = ({ onLogout, onEnterWorkstation, onImpersonate }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'graveyard'>('active');
  
  // Dashboard Metrics
  const [totalOnlineTime, setTotalOnlineTime] = useState(0);
  const [totalInteractions, setTotalInteractions] = useState(0);
  const [activeUsersToday, setActiveUsersToday] = useState(0);

  // System Config State
  const [sysConfig, setSysConfig] = useState<SystemConfig>({
      gemini: { apiKey: "", baseUrl: "", model: "gemini-3-flash-preview" },
      xhs: { apiKey: "", apiUrl: "" },
      cos: { secretId: "", secretKey: "", bucket: "", region: "" },
      publish: { apiKey: "" }
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [sysStatus, setSysStatus] = useState<{ loading: boolean; message: string; success?: boolean }>({ loading: false, message: '等待连接...', success: undefined });
  
  // Modal States
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<{show: boolean, message: string, action: () => void} | null>(null);

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      setToast({ show: true, message, type });
  };

  useEffect(() => {
    // ⚡️ 性能优化：并行加载配置和用户列表，不再串行等待
    const initData = async () => {
        setLoadingUsers(true);
        // Load Config and Users in parallel
        await Promise.all([
            loadConfig(),
            refreshUserList()
        ]);
        setLoadingUsers(false);
    };

    initData();
    const interval = setInterval(refreshUserList, 120000);
    return () => clearInterval(interval);
  }, []);

  // 🟢 确保每次打开配置面板时，都强制刷新一次配置 (以防本地缓存与云端不一致)
  useEffect(() => {
      if (showConfigModal) {
          loadConfig();
      }
  }, [showConfigModal]);

  const loadConfig = async () => {
      try {
        const cfg = await configRepo.getSystemConfig();
        setSysConfig(cfg);
      } catch (e) { console.warn("Failed to load config", e); }
  };

  const refreshUserList = async () => {
      const list = await userRepo.listUsers(true);
      setUsers(list);
      
      let totalTime = 0;
      let interactions = 0;
      let activeToday = 0;
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      list.forEach(u => {
          totalTime += u.totalOnlineSeconds || 0;
          interactions += u.interactionCount || 0;
          if (u.lastLoginAt && (now - u.lastLoginAt < oneDay)) activeToday++;
      });

      setTotalOnlineTime(totalTime);
      setTotalInteractions(interactions);
      setActiveUsersToday(activeToday);
  };

  const checkAI = async () => {
    setSysStatus({ loading: true, message: "正在握手...", success: undefined });
    // IMPORTANT: Pass current UI state (sysConfig), not database state, to test what the user just typed.
    const res = await testConnection(sysConfig);
    setSysStatus({ loading: false, message: res.message, success: res.success });
  };

  const saveConfig = async () => {
      setIsSavingConfig(true);
      try {
          await configRepo.saveSystemConfig(sysConfig);
          showToast("系统配置已更新");
      } catch (e: any) {
          const msg = getErrorMessage(e);
          showToast(`配置保存异常: ${msg}`, 'error');
      } finally {
          setIsSavingConfig(false);
          setShowConfigModal(false);
      }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let pass = '';
    for(let i=0; i<10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    setNewUser(prev => ({ ...prev, password: pass }));
  };

  const generateAccount = async () => {
    if (!newUser.username.trim() || !newUser.password.trim()) return;
    setIsCreating(true);
    try {
        const res = await userRepo.createUser(newUser.username, newUser.password);
        if (res.success) {
            await refreshUserList(); 
            showToast(`账号创建成功: ${newUser.username}`);
            navigator.clipboard.writeText(`账号:${newUser.username}\n密码:${newUser.password}`);
            showToast(`账号已创建，密码已复制到剪贴板`);
            setNewUser({ username: '', password: '' });
        } else {
            showToast(`创建失败: ${res.error}`, 'error');
        }
    } catch (e: any) { showToast(getErrorMessage(e), 'error'); } 
    finally { setIsCreating(false); }
  };

  const formatDuration = (seconds: number) => {
      if (seconds < 60) return `${seconds}秒`;
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return hours > 0 ? `${hours}小时 ${mins}分` : `${mins}分钟`;
  };

  const updateConfig = (section: keyof SystemConfig, field: string, value: string) => {
      setSysConfig(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const executeDeleteUser = async (id: string, username: string) => { 
      setDeletingIds(prev => new Set(prev).add(id));
      showToast("正在执行销毁程序...", 'info');
      try {
          const result = await userRepo.deleteUser(id);
          if (result.success) {
              await refreshUserList();
              showToast("用户已移至数据墓地");
          } else {
              showToast(`错误: ${result.message}`, 'error');
          }
      } catch (e: any) {
          showToast(`致命错误: ${getErrorMessage(e)}`, 'error');
      } finally {
          setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
          setShowConfirmModal(null);
      }
  };

  const executeRestoreUser = async (id: string, username: string) => {
      showToast("正在执行复活程序...", 'info');
      try {
          const result = await userRepo.restoreUser(id);
          if (result.success) {
              await refreshUserList();
              showToast(`用户 [${username}] 已恢复访问权限`);
          } else {
              showToast(`错误: ${result.message}`, 'error');
          }
      } catch (e: any) {
           showToast(`错误: ${getErrorMessage(e)}`, 'error');
      }
  };

  const confirmAction = (message: string, action: () => void) => {
      setShowConfirmModal({ show: true, message, action });
  };
  
  const toggleSuspend = async (u: User) => { await userRepo.toggleUserSuspension(u.id, !u.isSuspended); refreshUserList(); };
  
  // Filtered Users
  const displayUsers = users.filter(u => viewMode === 'active' ? !u.isDeleted : u.isDeleted);

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-200 font-sans p-6 overflow-hidden flex flex-col relative selection:bg-indigo-500/30 selection:text-white">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#09090b] to-black pointer-events-none"></div>
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-slate-700 to-transparent opacity-20"></div>
      
      {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({...toast, show: false})} />}
      
      {/* Confirm Modal */}
      {showConfirmModal && (
          <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
              <div className="bg-slate-900 border border-slate-700 p-6 max-w-sm w-full shadow-2xl rounded-2xl relative">
                  <div className="flex items-center gap-3 mb-4 text-amber-500">
                      <AlertTriangle size={24}/>
                      <h3 className="font-bold text-lg text-white">敏感操作确认</h3>
                  </div>
                  <p className="text-slate-400 text-sm mb-6 leading-relaxed">{showConfirmModal.message}</p>
                  <div className="flex gap-3">
                      <button onClick={() => setShowConfirmModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors text-xs font-bold">取消</button>
                      <button onClick={showConfirmModal.action} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors text-xs font-bold shadow-lg shadow-red-900/20">确认执行</button>
                  </div>
              </div>
          </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-8 relative z-10">
          <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/20 text-white">
                  <Server size={20} />
              </div>
              <div>
                  <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                      Matrix 核心控制台 <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">v3.1.2</span>
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">全域系统监控与权限管理</p>
              </div>
          </div>
          <div className="flex gap-3">
              <button onClick={() => setShowConfigModal(true)} className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-2 transition-all">
                  <Settings size={14} /> 系统配置
              </button>
              <button onClick={onEnterWorkstation} className="px-4 py-2 bg-white text-black hover:bg-slate-200 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition-all">
                  <Layout size={14} /> 进入前台
              </button>
              <button onClick={onLogout} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
                  <LogOut size={14}/> 退出
              </button>
          </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8 relative z-10">
          <StatCard title="总用户数" value={users.length} subValue={`今日活跃: ${activeUsersToday}`} icon={Users} color="text-white" />
          <StatCard title="总运行时长" value={formatDuration(totalOnlineTime)} subValue="系统累计在线" icon={Clock} color="text-indigo-400" />
          <StatCard title="AI 交互次数" value={totalInteractions.toLocaleString()} subValue="Token 消耗量级" icon={CloudLightning} color="text-amber-400" />
          
          {/* Quick Create Card */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-5 flex flex-col justify-between group hover:border-slate-700 transition-all shadow-lg">
               <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2"><Plus size={12}/> 快速分发账号</div>
               <div className="flex gap-2 mb-2">
                   <input value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} placeholder="用户名" className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-600" />
                   <input value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} placeholder="密码/密钥" className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-600" />
               </div>
               <div className="flex gap-2">
                   <button onClick={generateRandomPassword} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors" title="生成随机密码"><Dice5 size={14}/></button>
                   <button onClick={generateAccount} disabled={isCreating} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/20">
                       {isCreating ? <Loader2 size={12} className="animate-spin"/> : '创建账号'}
                   </button>
               </div>
          </div>
      </div>

      {/* User Management Section */}
      <div className="flex-1 flex flex-col min-h-0 relative z-10">
          <div className="flex justify-between items-center mb-4">
              <div className="flex gap-4">
                  <button onClick={() => setViewMode('active')} className={`text-xs font-bold flex items-center gap-2 pb-2 border-b-2 transition-colors ${viewMode === 'active' ? 'text-indigo-400 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                      <Activity size={14}/> 活跃用户
                  </button>
                  <button onClick={() => setViewMode('graveyard')} className={`text-xs font-bold flex items-center gap-2 pb-2 border-b-2 transition-colors ${viewMode === 'graveyard' ? 'text-red-400 border-red-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                      <Skull size={14}/> 数据墓地
                  </button>
              </div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl overflow-hidden flex-1 shadow-2xl flex flex-col">
              <div className="overflow-y-auto custom-scrollbar flex-1">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-950/50 text-slate-500 font-medium text-xs sticky top-0 backdrop-blur-md z-10">
                          <tr>
                              <th className="px-6 py-4">用户标识</th>
                              <th className="px-6 py-4">密钥/密码</th>
                              <th className="px-6 py-4">状态</th>
                              <th className="px-6 py-4">最后活动</th>
                              <th className="px-6 py-4 text-right">操作</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                          {loadingUsers ? (
                              <tr><td colSpan={5} className="text-center py-12 text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2"/>数据加载中...</td></tr>
                          ) : displayUsers.length === 0 ? (
                              <tr><td colSpan={5} className="text-center py-12 text-slate-600 italic">暂无数据</td></tr>
                          ) : (
                              displayUsers.map(u => (
                                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors group">
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${u.role === UserRole.ADMIN ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/10 text-indigo-400'}`}>
                                                  {u.role === UserRole.ADMIN ? <ShieldCheck size={14}/> : <UserIcon size={14}/>}
                                              </div>
                                              <div>
                                                  <div className="font-bold text-slate-200">{u.username}</div>
                                                  <div className="text-[10px] text-slate-500 font-mono">{u.id.substring(0,8)}...</div>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-2 group/key">
                                              <code className="bg-slate-950 px-2 py-1 rounded text-xs font-mono text-slate-400 group-hover:text-white transition-colors">{u.inviteCode}</code>
                                              <button onClick={() => { navigator.clipboard.writeText(`账号:${u.username}\n密码:${u.inviteCode}`); showToast("账号信息已复制"); }} className="opacity-0 group-hover/key:opacity-100 text-slate-500 hover:text-white transition-opacity"><Copy size={12}/></button>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-2">
                                              {u.isSuspended ? (
                                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20"><PauseCircle size={10}/> 已停用</span>
                                              ) : (
                                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><Activity size={10}/> 运行中</span>
                                              )}
                                              {u.totalOnlineSeconds > 3600 && <span className="text-[10px] text-indigo-400 font-medium">{formatDuration(u.totalOnlineSeconds)}</span>}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="text-xs text-slate-400">
                                              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('zh-CN', {month:'numeric', day:'numeric', hour:'numeric', minute:'numeric'}) : '从未登录'}
                                          </div>
                                          {u.location && <div className="text-[10px] text-slate-600 flex items-center gap-1 mt-0.5"><MapPin size={8}/> {u.location}</div>}
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                          <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                              {u.role !== UserRole.ADMIN && !u.isDeleted && (
                                                  <>
                                                      <button onClick={() => onImpersonate(u)} className="p-1.5 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 rounded-lg transition-colors" title="控制台接管"><Ghost size={14}/></button>
                                                      <button onClick={() => toggleSuspend(u)} className={`p-1.5 rounded-lg transition-colors ${u.isSuspended ? 'hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400' : 'hover:bg-amber-500/20 text-slate-400 hover:text-amber-400'}`} title={u.isSuspended ? "启用" : "停用"}>
                                                          {u.isSuspended ? <PlayCircle size={14}/> : <PauseCircle size={14}/>}
                                                      </button>
                                                      <button onClick={() => confirmAction(`确定要销毁用户 [${u.username}] 吗？数据将移至墓地。`, () => executeDeleteUser(u.id, u.username))} disabled={deletingIds.has(u.id)} className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors" title="销毁">
                                                          {deletingIds.has(u.id) ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
                                                      </button>
                                                  </>
                                              )}
                                              {u.isDeleted && (
                                                  <button onClick={() => executeRestoreUser(u.id, u.username)} className="px-2.5 py-1.5 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors" title="还原用户">
                                                      <RotateCcw size={12}/> 还原
                                                  </button>
                                              )}
                                          </div>
                                      </td>
                                  </tr>
                              ))
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>

      {/* Config Modal (Unchanged) */}
      {showConfigModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-fade-in">
              <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl shadow-2xl rounded-2xl overflow-hidden relative">
                  <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Settings size={18}/> 全局系统配置</h2>
                      <button onClick={() => setShowConfigModal(false)} className="text-slate-500 hover:text-white transition-colors"><X size={20}/></button>
                  </div>
                  
                  <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                      {/* Gemini Section */}
                      <div className="space-y-4">
                          <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-2"><Sparkles size={12}/> AI 模型配置 (Gemini)</h3>
                          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-4">
                              <div>
                                  <div className="flex justify-between items-center mb-1.5">
                                      <label className="text-xs font-medium text-slate-400">Gateway Status</label>
                                      {sysStatus.success === true && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-500 border border-emerald-900/30">✓ 连接成功</span>}
                                      {sysStatus.success === false && <span className="text-[10px] px-2 py-0.5 rounded bg-red-950 text-red-500 border border-red-900/30">× 连接失败</span>}
                                  </div>
                                  {sysStatus.message && (
                                    <div className={`text-[10px] px-3 py-2 rounded-lg leading-relaxed font-mono whitespace-pre-wrap ${sysStatus.success === false ? 'bg-red-950/20 text-red-400 border border-red-900/20' : 'bg-slate-900 text-slate-500'}`}>
                                        {sysStatus.message}
                                    </div>
                                  )}
                              </div>
                              
                              <div className="space-y-4">
                                  <div>
                                      <label className="text-xs font-medium text-slate-400 block mb-1.5">API Key (Gemini)</label>
                                      <input type="password" value={sysConfig.gemini.apiKey} onChange={e => updateConfig('gemini', 'apiKey', e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono transition-all placeholder:text-slate-700" placeholder="sk-..." />
                                      <p className="text-[10px] text-slate-600 mt-1">支持 Google 官方 Key 或第三方网关 Key (sk-...)</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                      <div>
                                          <label className="text-xs font-medium text-slate-400 block mb-1.5">Base URL (网关地址)</label>
                                          <input type="text" value={sysConfig.gemini.baseUrl} onChange={e => updateConfig('gemini', 'baseUrl', e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono transition-all placeholder:text-slate-700" placeholder="https://..." />
                                      </div>
                                      <div>
                                          <label className="text-xs font-medium text-slate-400 block mb-1.5">Model (模型版本)</label>
                                          <input type="text" value={sysConfig.gemini.model} onChange={e => updateConfig('gemini', 'model', e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono transition-all" />
                                      </div>
                                  </div>
                              </div>
                              
                              <div className="flex justify-end pt-2">
                                  <button onClick={checkAI} className="text-[10px] flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors border border-slate-700 hover:border-slate-500">
                                      {sysStatus.loading ? <Loader2 size={12} className="animate-spin"/> : <RefreshCcw size={12}/>} 测试连接
                                  </button>
                              </div>
                          </div>
                      </div>

                      {/* XHS Section */}
                      <div className="space-y-4 pt-4 border-t border-slate-800">
                          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-2"><LinkIcon size={12}/> 内容解析配置 (XHS)</h3>
                          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-4">
                              <div>
                                  <label className="text-xs font-medium text-slate-400 block mb-1.5">API Key (XHS/V1)</label>
                                  <input type="password" value={sysConfig.xhs.apiKey} onChange={e => updateConfig('xhs', 'apiKey', e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-rose-500 transition-all placeholder:text-slate-700" placeholder="填入你的 Key" />
                              </div>
                              <div>
                                  <label className="text-xs font-medium text-slate-400 block mb-1.5">API URL</label>
                                  <input type="text" value={sysConfig.xhs.apiUrl} onChange={e => updateConfig('xhs', 'apiUrl', e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-rose-500 transition-all placeholder:text-slate-700" placeholder="https://..." />
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="bg-slate-950/50 px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
                      <button onClick={() => setShowConfigModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-xs font-bold transition-colors">取消</button>
                      <button onClick={saveConfig} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/20 transition-all active:scale-95">
                          {isSavingConfig ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} 保存配置
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminPanel;
