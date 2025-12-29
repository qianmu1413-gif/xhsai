
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';
import AdminPanel from './AdminPanel';
import Workstation from './Workstation';
import SetupWizard from './SetupWizard'; // Import Wizard
import { ShieldAlert, Command, ArrowRight, Sparkles, Database, Lock, Eye, EyeOff, CheckSquare, Square } from 'lucide-react';
import { APP_NAME } from '../constants';
import { userRepo } from '../services/repository';
import { isCloudMode } from '../services/supabase';

const STORAGE_KEY_SESSION = 'rednote_user_session';
const STORAGE_KEY_REMEMBER_ME = 'rednote_remember_auth';

const App: React.FC = () => {
  // Check if system is initialized (DB Key exists)
  if (!isCloudMode) {
      return <SetupWizard />;
  }

  const [user, setUser] = useState<User | null>(null);
  
  // Admin States
  const [isAdminWorking, setIsAdminWorking] = useState(false); 
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);

  const [authInput, setAuthInput] = useState({ username: '', code: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  
  // Heartbeat Ref
  const heartbeatRef = useRef<any>(null);

  // Analytics: Record IP and start Heartbeat
  useEffect(() => {
      if (user && user.role !== UserRole.ADMIN) {
          // 1. Record Login info (Once per session load)
          fetch('https://api.ipify.org?format=json')
              .then(res => res.json())
              .then(data => {
                  userRepo.recordLogin(user.id, data.ip, 'Unknown');
              })
              .catch(() => {}); // Silent fail

          // 2. Start Heartbeat (Every 60s)
          heartbeatRef.current = setInterval(() => {
              userRepo.updateHeartbeat(user.id, 60);
          }, 60000);
      } else {
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      }

      return () => {
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      };
  }, [user?.id]);

  useEffect(() => {
    const savedSession = localStorage.getItem(STORAGE_KEY_SESSION);
    if (savedSession) {
        const parsedUser = JSON.parse(savedSession);
        if (!parsedUser.isSuspended) {
            setUser(parsedUser);
        } else {
            localStorage.removeItem(STORAGE_KEY_SESSION);
        }
    } else {
        const savedAuth = localStorage.getItem(STORAGE_KEY_REMEMBER_ME);
        if (savedAuth) {
            setAuthInput(JSON.parse(savedAuth));
        }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
        const { user: foundUser, error: loginError } = await userRepo.login(authInput.username, authInput.code);
        
        if (foundUser) {
            setUser(foundUser);
            localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(foundUser));
            
            if (rememberMe) {
                localStorage.setItem(STORAGE_KEY_REMEMBER_ME, JSON.stringify(authInput));
            } else {
                localStorage.removeItem(STORAGE_KEY_REMEMBER_ME);
            }
        } else {
            setError(loginError || '账号或密码错误');
        }
    } catch (e) {
        setError('系统异常，请重试');
    } finally {
        setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setIsAdminWorking(false);
    setImpersonatedUser(null);
    localStorage.removeItem(STORAGE_KEY_SESSION);
  };

  const exitImpersonation = () => {
      setImpersonatedUser(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-slate-800 font-sans selection:bg-rose-100 selection:text-rose-900">
        
        <div className="w-full max-w-sm animate-fade-in px-6">
          <div className="flex flex-col items-center mb-10">
            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center mb-4 text-rose-500">
               <Command size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{APP_NAME}</h1>
            <p className="text-sm text-slate-500 mt-2">专业内容创作矩阵</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">账号 (Account)</label>
                <input 
                  type="text" 
                  value={authInput.username} 
                  onChange={e => setAuthInput({...authInput, username: e.target.value})} 
                  className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 outline-none text-sm font-medium text-slate-900 transition-all placeholder:text-slate-400" 
                  placeholder="输入用户名"
                  required 
                />
              </div>
              <div className="space-y-1.5 relative">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">密码 (Password)</label>
                <input 
                  type={showPassword ? "text" : "password"}
                  value={authInput.code} 
                  onChange={e => setAuthInput({...authInput, code: e.target.value})} 
                  className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 outline-none text-sm font-medium tracking-widest text-slate-900 transition-all placeholder:text-slate-400" 
                  placeholder="••••••••"
                  required 
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              
              <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setRememberMe(!rememberMe)}>
                  {rememberMe ? <CheckSquare size={16} className="text-rose-500" /> : <Square size={16} className="text-slate-300 group-hover:text-slate-400" />}
                  <span className="text-xs text-slate-500 select-none">记住密码</span>
              </div>

              {error && (
                <div className="text-xs text-rose-600 font-medium flex items-center justify-center gap-1.5 py-1 bg-rose-50 rounded-md">
                  <ShieldAlert size={14} /> {error}
                </div>
              )}

              <button disabled={isLoading} className="w-full bg-slate-900 text-white font-semibold py-3 rounded-lg hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70">
                 {isLoading ? '验证中...' : <>登录系统 <ArrowRight size={16} /></>}
              </button>
            </form>
          </div>

          <div className="mt-8 text-center flex flex-col gap-4 items-center">
             <div className="flex gap-2">
                 {isCloudMode && (
                     <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                        <Database size={10} /> 云端安全存储
                     </div>
                 )}
             </div>

             <div className="text-[10px] text-slate-300 leading-relaxed max-w-[280px]">
                 <p className="font-bold text-slate-400 mb-1 flex items-center justify-center gap-1"><Lock size={10}/> 此为内部网站，请联系suitian6</p>
             </div>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === UserRole.ADMIN) {
    if (impersonatedUser) {
        return (
            <>
                <div className="fixed top-0 left-0 right-0 h-8 bg-amber-400 text-amber-900 z-[9999] flex items-center justify-center text-xs font-bold shadow-md">
                    <ShieldAlert size={14} className="mr-2"/> 
                    您正在以管理员身份操作【{impersonatedUser.username}】的账号
                    <button onClick={exitImpersonation} className="ml-4 bg-white/20 hover:bg-white/40 px-3 py-0.5 rounded transition-colors border border-amber-600/20">退出控制</button>
                </div>
                <div className="pt-8 h-screen">
                    <Workstation user={impersonatedUser} onUserUpdate={() => {}} onLogout={exitImpersonation} />
                </div>
            </>
        );
    }

    if (isAdminWorking) {
      return (
        <>
           <Workstation user={user} onUserUpdate={setUser} onLogout={handleLogout} />
           <div className="fixed bottom-6 left-6 z-[100]">
             <button 
               onClick={() => setIsAdminWorking(false)} 
               className="bg-slate-900 text-white px-4 py-2.5 rounded-full font-bold text-xs shadow-lg flex items-center gap-2 hover:bg-black transition-all"
             >
               <ArrowRight size={14} className="rotate-180" /> 
               返回管理后台
             </button>
           </div>
        </>
      );
    }
    return <AdminPanel onLogout={handleLogout} onEnterWorkstation={() => setIsAdminWorking(true)} onImpersonate={(u) => setImpersonatedUser(u)} />;
  }

  if (user.isSuspended) {
      handleLogout();
      return null;
  }

  return <Workstation user={user} onUserUpdate={u => { setUser(u); localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(u)); }} onLogout={handleLogout} />;
};

export default App;
