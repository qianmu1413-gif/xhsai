
import React, { useState } from 'react';
import { Database, ShieldCheck, ArrowRight, Loader2, Server, Lock, Code2 } from 'lucide-react';
import { setupSystemConnection } from '../services/supabase';

const SetupWizard: React.FC = () => {
    const [url, setUrl] = useState('https://ohesrabpblaxboctfbes.supabase.co');
    const [key, setKey] = useState('');
    const [loading, setLoading] = useState(false);

    const handleConnect = () => {
        if (!key.trim()) return;
        setLoading(true);
        setTimeout(() => {
            const success = setupSystemConnection(url, key);
            if (!success) setLoading(false);
        }, 800);
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white font-mono flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Matrix Background Effect */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black"></div>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

            <div className="max-w-md w-full relative z-10 animate-fade-in">
                <div className="flex justify-center mb-8">
                    <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)]">
                        <Server size={32} className="text-white" />
                    </div>
                </div>

                <div className="text-center mb-10">
                    <h1 className="text-2xl font-bold tracking-tight mb-2">系统初始化</h1>
                    <p className="text-slate-500 text-sm">Matrix Core 需要连接至 Supabase 数据库</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm shadow-2xl space-y-5">
                    <div>
                        <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 block">Database URL</label>
                        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-3">
                            <Database size={14} className="text-slate-500" />
                            <input 
                                value={url} 
                                onChange={e => setUrl(e.target.value)}
                                className="bg-transparent border-none outline-none text-xs text-slate-300 w-full font-mono"
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 block">Anon Key</label>
                        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-3 relative group focus-within:border-indigo-500/50 transition-colors">
                            <ShieldCheck size={14} className="text-slate-500" />
                            <input 
                                type="password" 
                                value={key} 
                                onChange={e => setKey(e.target.value)}
                                className="bg-transparent border-none outline-none text-xs text-white w-full font-mono tracking-widest placeholder:tracking-normal"
                                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
                            />
                            <div className="absolute right-3 top-3 text-[10px] text-slate-600 border border-slate-700 px-1.5 rounded">REQUIRED</div>
                        </div>
                        <p className="text-[10px] text-slate-600 mt-2 flex items-center gap-1">
                            <Lock size={10}/> 密钥将仅保存在您的本地浏览器中，不会上传。
                        </p>
                    </div>

                    <button 
                        onClick={handleConnect}
                        disabled={loading || !key}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-[0_0_20px_-5px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_-5px_rgba(79,70,229,0.6)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                        建立安全连接
                    </button>
                    
                    <div className="pt-4 border-t border-white/5 text-center">
                         <div className="text-[10px] text-slate-500 mb-1">
                             <Code2 size={10} className="inline mr-1"/>
                             开发者提示
                         </div>
                         <p className="text-[10px] text-slate-600">
                             若要免去所有用户的配置步骤，请在 <span className="text-slate-400 font-mono">services/supabase.ts</span> 中填入 <span className="text-indigo-400">HARDCODED_KEY</span>。
                         </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SetupWizard;
