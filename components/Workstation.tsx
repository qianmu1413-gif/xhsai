
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { PersonaAnalysis, FidelityMode, ChatMessage, Project, NoteDraft, User, BulkNote, AttachedFile, SocialNote, PublishedRecord, PreviewState } from '../types';
import { streamExpertGeneration, streamPersonaAnalysis, analyzeMaterials } from '../services/geminiService';
import { fetchXhsNote, extractXhsUrls } from '../services/xhsService';
import { projectRepo, fileRepo, linkRepo, userRepo, getErrorMessage } from '../services/repository'; 
import { uploadToCOS, deleteFromCOS } from '../services/cosService'; 
import { publishToXHS } from '../services/publishService';
import { DEFAULT_MANUAL_PERSONA, DEFAULT_CONTENT_PLACEHOLDER } from '../constants';
import MobilePreview from './MobilePreview';
import PersonaTrainer from './PersonaTrainer';
import Toast, { ToastState } from './Toast';
import { Send, FileText, Sparkles, Loader2, Plus, ChevronDown, ArrowLeft, Wand2, Archive, X, Paperclip, File as FileIcon, Trash2, User as UserIcon, Bot, LogOut, Flame, LayoutGrid, MessageSquareText, Zap, Command, SlidersHorizontal, PanelRightClose, PanelRightOpen, ArrowUpRight, BrainCircuit, ChevronLeft, ChevronRight, Cloud, UploadCloud, CheckCircle2, AlertCircle, Copy, Check, Library, Image as ImageIcon, QrCode, Search, Link as LinkIcon, Edit2, Layers, History, Settings2, Link, Download, Share2, MoreHorizontal, CheckSquare, Square, Terminal, Clock, Hash, Tag, Folder, MonitorPlay, Pencil, Heart, Info, FileQuestion, AlignLeft, DownloadCloud, Save, WifiOff, Type, ArrowRight } from 'lucide-react';

if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const RANDOM_COVERS = [
  "https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1463797221720-6b07e6426c24?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1493612276216-ee3925520721?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1485627658391-1365e4e0dbfe?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1531297461137-81f997d23311?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1523961131990-5ea7c61b2107?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1483058712412-4245e9b90334?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1516961642265-531546e84af2?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1499916078039-922301b0eb9b?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1502082553048-f009c37129b9?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1501949997128-2fdb9f6428f1?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1550859492-d5da9d8e45f3?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1501696461415-6bd6660c6742?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=1000&auto=format&fit=crop"
];

const getRandomCover = () => RANDOM_COVERS[Math.floor(Math.random() * RANDOM_COVERS.length)];

const getTagColor = (tag: string) => {
  const colors = [
    'bg-red-50 text-red-600 border-red-100',
    'bg-orange-50 text-orange-600 border-orange-100',
    'bg-amber-50 text-amber-600 border-amber-100',
    'bg-green-50 text-green-600 border-green-100',
    'bg-emerald-50 text-emerald-600 border-emerald-100',
    'bg-teal-50 text-teal-600 border-teal-100',
    'bg-cyan-50 text-cyan-600 border-cyan-100',
    'bg-blue-50 text-blue-600 border-blue-100',
    'bg-indigo-50 text-indigo-600 border-indigo-100',
    'bg-violet-50 text-violet-600 border-violet-100',
    'bg-purple-50 text-purple-600 border-purple-100',
    'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100',
    'bg-pink-50 text-pink-600 border-pink-100',
    'bg-rose-50 text-rose-600 border-rose-100',
  ];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

interface WorkstationProps {
  user: User;
  onUserUpdate: (updatedUser: User) => void;
  onLogout: () => void;
}

const cleanMarkdown = (text: string) => {
  if (!text) return "";
  return text
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^#+\s/gm, "")
    .replace(/###/g, "")
    .replace(/`/g, "")
    .trim();
};

const renderFormattedText = (text: string) => {
  if (!text) return null;
  const cleanText = text.replace(/\[话题\]/g, '').replace(/#话题/g, ''); 
  
  const parts = cleanText.split(/(\*\*|#[^\s#]+)/g);
  return (
    <div className="whitespace-pre-wrap leading-relaxed text-justify">
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index} className="font-bold text-slate-900 mx-0.5">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('#')) {
            return <span key={index} className="text-blue-600 font-medium mr-1 cursor-pointer hover:underline">{part}</span>;
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
};

// 🟢 Helper to render BulkNote card content with blue hashtags
const renderCardContent = (text: string) => {
    if (!text) return null;
    const clean = cleanMarkdown(text);
    const parts = clean.split(/(#[\p{L}\p{N}_]+)/u);
    return (
        <span className="whitespace-pre-wrap">
            {parts.map((part, index) => {
                if (part.startsWith('#')) {
                    return <span key={index} className="text-blue-600 font-medium">{part}</span>;
                }
                return <span key={index}>{part}</span>;
            })}
        </span>
    );
};

const SyncStatus: React.FC<{ status: 'saved' | 'saving' | 'error', hasUnsavedChanges: boolean }> = ({ status, hasUnsavedChanges }) => {
    if (status === 'saving') return <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full"><Loader2 size={10} className="animate-spin" /> 云同步中...</div>;
    if (status === 'error') return <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full"><AlertCircle size={10} /> 同步失败</div>;
    if (hasUnsavedChanges) return <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full animate-pulse"><Edit2 size={10} /> 未保存</div>;
    return <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><CheckCircle2 size={10} /> 已保存</div>;
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(cleanMarkdown(text));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all active:scale-90" title="复制内容">
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
    );
};

const getLength = (str: string) => {
  if (!str) return 0;
  const cleanStr = cleanMarkdown(str);
  let len = 0;
  for (let i = 0; i < cleanStr.length; i++) {
    const code = cleanStr.charCodeAt(i);
    if (code >= 0 && code <= 127) {
      len += 0.5;
    } else {
      len += 1;
    }
  }
  return Math.ceil(len);
};

const ThinkingIndicator = () => {
    const [step, setStep] = useState(0);
    const steps = [
        "正在建立神经连接 (Neural Handshake)...",
        "正在解构上下文语境 (Context Analysis)...",
        "正在检索风格记忆库 (Style Retrieval)...",
        "正在构建思维链 (Chain of Thought)...",
        "正在拟定创意切入点 (Creative Spark)...",
        "正在优化表达措辞 (Polishing)..."
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setStep((prev) => (prev + 1) % steps.length);
        }, 800);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-3 bg-gradient-to-r from-violet-50 to-fuchsia-50 border border-violet-100 px-4 py-3 rounded-xl w-fit animate-fade-in select-none shadow-sm shadow-violet-100/50">
            <div className="relative flex items-center justify-center w-5 h-5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-20"></span>
                <BrainCircuit size={16} className="text-violet-600 relative z-10 animate-pulse" />
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-0.5 leading-none">AI Neural Process</span>
                <span className="text-xs font-medium text-slate-700 min-w-[180px] transition-all duration-300">
                    {steps[step]}
                </span>
            </div>
        </div>
    );
};

const ErrorDisplay = ({ error }: { error: string }) => {
    let friendlyError = error;
    if (error.includes('Failed to fetch')) {
        friendlyError = "无法连接到 AI 服务器。请检查您的网络设置，或联系管理员在后台配置正确的代理地址 (Base URL)。";
    }

    return (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-xs font-medium flex items-start gap-3 shadow-sm animate-fade-in max-w-lg">
            <WifiOff size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
                <div className="font-bold mb-1">连接中断</div>
                <div className="opacity-90 leading-relaxed">{friendlyError}</div>
            </div>
        </div>
    );
};

const ChatMessageItem = memo(({ msg, onAdopt }: { msg: ChatMessage, onAdopt: (n: BulkNote) => void }) => {
    return (
        <div className={`flex w-full animate-fade-in group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
            <div className="flex flex-row-reverse items-start gap-3 max-w-[80%]">
                <div className="w-8 h-8 rounded-full bg-slate-200 border border-white shadow-sm flex items-center justify-center shrink-0"><UserIcon size={14} className="text-slate-500" /></div>
                <div className="flex flex-col items-end">
                    <div className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl rounded-tr-sm shadow-md text-sm leading-relaxed selection:bg-rose-500 selection:text-white">{msg.text}</div>
                    <span className="text-[10px] text-slate-300 mt-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            </div>
            ) : (
            <div className="flex items-start gap-4 max-w-full lg:max-w-[90%]">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg shrink-0 mt-1 ${msg.isError ? 'bg-red-100 text-red-500 shadow-red-100' : 'bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-200'}`}>
                    {msg.isError ? <AlertCircle size={16}/> : <Sparkles size={14} className="text-white" />}
                </div>
                <div className="flex-1 flex flex-col gap-3 min-w-0">
                    {msg.isStreaming && !msg.text && !msg.isError && (
                        <ThinkingIndicator />
                    )}
                    
                    {msg.isError ? (
                        <ErrorDisplay error={msg.text} />
                    ) : (
                        <>
                            {/* ALWAYS RENDER TEXT BUBBLE */}
                            {msg.text && (
                                <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 hover:shadow-md transition-shadow relative group/card">
                                    <div className="prose prose-sm prose-slate max-w-none text-slate-700 leading-7">
                                        {renderFormattedText(msg.text)}
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-slate-50 flex justify-end items-center gap-3">
                                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                            <span>标题:</span> 
                                            <span className={`font-bold ${getLength(msg.text.split('\n')[0]) > 20 ? 'text-red-500' : 'text-slate-700'}`}>{getLength(msg.text.split('\n')[0])}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                            <span>总字数:</span> 
                                            <span className="font-bold text-slate-700">{getLength(msg.text)}</span>
                                        </div>
                                    </div>
                                    <div className="absolute top-4 right-4 opacity-0 group-hover/card:opacity-100 transition-opacity"><CopyButton text={msg.text} /></div>
                                </div>
                            )}

                            {/* RENDER CARDS IF AVAILABLE */}
                            {msg.bulkNotes && msg.bulkNotes.length > 0 && (
                                <div className="mt-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
                                        {msg.bulkNotes.map((note, idx) => {
                                            const titleLen = getLength(note.title);
                                            const contentLen = getLength(note.content);
                                            return (
                                            <div key={idx} className="bg-white rounded-xl border border-slate-200 hover:border-rose-300 hover:shadow-lg transition-all flex flex-col overflow-hidden group/option relative ring-1 ring-transparent hover:ring-rose-100">
                                                {/* Header with Stats */}
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50 bg-slate-50/50">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-white bg-slate-400 px-1.5 py-0.5 rounded shadow-sm">方案 {idx+1}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-mono font-bold ${titleLen > 20 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-black border-slate-100'}`} title="标题字数 (建议<20)">
                                                            <span className="text-[8px] text-slate-400 scale-90 opacity-70">T</span> {titleLen}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border bg-white border-slate-100 text-[9px] font-mono font-bold text-black" title="正文字数">
                                                            <span className="text-[8px] text-slate-400 scale-90 opacity-70">C</span> {contentLen}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Content Preview */}
                                                <div className="p-4 flex-1 flex flex-col gap-2">
                                                    <h4 className="font-bold text-sm text-slate-900 leading-snug line-clamp-2" title={cleanMarkdown(note.title)}>{cleanMarkdown(note.title)}</h4>
                                                    <div className="text-xs text-slate-500 leading-relaxed line-clamp-4 min-h-[4.5em]">{renderCardContent(note.content)}</div>
                                                </div>

                                                {/* Action Footer */}
                                                <div className="p-3 pt-0 mt-auto">
                                                    <button onClick={() => onAdopt(note)} className="w-full py-2 bg-slate-50 hover:bg-rose-500 hover:text-white text-slate-600 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 group/btn border border-slate-100 hover:border-rose-500 hover:shadow-md">
                                                        <ArrowUpRight size={14} className="text-slate-400 group-hover/btn:text-white transition-colors"/> 
                                                        使用此方案
                                                    </button>
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            )}
        </div>
    );
}, (prev, next) => {
    return prev.msg.text === next.msg.text && prev.msg.thought === next.msg.thought && prev.msg.id === next.msg.id && prev.msg.isError === next.msg.isError && prev.msg.isStreaming === next.msg.isStreaming;
});

const Workstation: React.FC<WorkstationProps> = ({ user, onUserUpdate, onLogout }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [viewMode, setViewMode] = useState<'dashboard' | 'workspace'>('dashboard'); 
  const [showNameModal, setShowNameModal] = useState(false);
  const [tempProjectName, setTempProjectName] = useState('');
  const [globalPersonas, setGlobalPersonas] = useState<PersonaAnalysis[]>([]);
  
  const [showTrainer, setShowTrainer] = useState(false); 
  const [trainerInitialSamples, setTrainerInitialSamples] = useState<string[]>([]); 

  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      setToast({ show: true, message, type });
  };

  const [confirmModal, setConfirmModal] = useState<{show: boolean, msg: string, action: () => void} | null>(null);
  const showConfirm = (msg: string, action: () => void) => {
      setConfirmModal({ show: true, msg, action });
  };

  const [analysisResult, setAnalysisResult] = useState<{show: boolean, content: string, title: string} | null>(null);
  const [isAnalysingFile, setIsAnalysingFile] = useState(false);
  const [editingPersona, setEditingPersona] = useState<PersonaAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'libraries' | 'chat' | 'preview'>('chat');
  const [activeLeftTab, setActiveLeftTab] = useState<'design' | 'assets' | 'history'>('design');
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  
  const [qrModalRecord, setQrModalRecord] = useState<PublishedRecord | null>(null);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const [unsavedNavModal, setUnsavedNavModal] = useState<{show: boolean, action: () => void} | null>(null);

  const isResizingRef = useRef(false);

  const [batchLinkInput, setBatchLinkInput] = useState('');
  const [isBatchExtracting, setIsBatchExtracting] = useState(false);
  const [isMaterialSelectionMode, setIsMaterialSelectionMode] = useState(false);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [analyzingNoteId, setAnalyzingNoteId] = useState<string | null>(null); 
  const [libraryData, setLibraryData] = useState<{ personas: any[], assets: any[], finished: any[] }>({ personas: [], assets: [], finished: [] });
  const [contextText, setContextText] = useState('');
  const [materialAnalysis, setMaterialAnalysis] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]); 
  const [socialNotes, setSocialNotes] = useState<SocialNote[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [fidelity, setFidelity] = useState<FidelityMode>(FidelityMode.STRICT);
  const [wordCountLimit, setWordCountLimit] = useState<number>(300); 
  const [generatedContent, setGeneratedContent] = useState('');
  const [previewState, setPreviewState] = useState<PreviewState>({ title: '', images: [getRandomCover()] }); 
  const [drafts, setDrafts] = useState<NoteDraft[]>([]);
  const [publishedHistory, setPublishedHistory] = useState<PublishedRecord[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false); 
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [currentInput, setCurrentInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const [bulkCount, setBulkCount] = useState<number>(1); 
  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedSocialNote, setSelectedSocialNote] = useState<SocialNote | null>(null);
  const [currentModalImgIdx, setCurrentModalImgIdx] = useState(0);
  const [showAnalysisArea, setShowAnalysisArea] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { hasUnsavedChangesRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 320 && newWidth < 800) {
        setRightPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      setIsUploadingFile(true);
      showToast("文件正在上传中，请稍后...", "info");
      const newFiles: AttachedFile[] = [];
      let successCount = 0;
      for (let i = 0; i < e.target.files.length; i++) {
          const file = e.target.files[i];
          try {
              const url = await uploadToCOS(file);
              const isImage = file.type.startsWith('image/');
              newFiles.push({
                  id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                  name: file.name,
                  type: isImage ? 'image' : 'file',
                  mimeType: file.type,
                  data: url,
                  isUrl: true,
                  file: file
              });
              successCount++;
          } catch (err) { showToast(`上传失败: ${file.name}`, 'error'); }
      }
      setAttachedFiles(prev => [...prev, ...newFiles]);
      setIsUploadingFile(false);
      if (successCount > 0) showToast(`成功上传 ${successCount} 个文件`);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMobileFileUpload = async (files: File[]): Promise<string[]> => {
        const urls: string[] = [];
        for (const file of files) {
            try { const url = await uploadToCOS(file); urls.push(url); } 
            catch (e) { console.error(e); }
        }
        return urls;
  };

  const handleAnalyzeMaterials = async () => {
      if (attachedFiles.length === 0) return;
      if (isAnalysingFile) return;
      setIsAnalysingFile(true);
      showToast(`正在综合分析 ${attachedFiles.length} 份资料...`, "info");
      try {
          const result = await analyzeMaterials(attachedFiles);
          setMaterialAnalysis(result);
          setShowAnalysisArea(true);
          showToast("资料分析已完成，结果已保存");
      } catch (e: any) { showToast(`分析失败: ${getErrorMessage(e)}`, 'error'); } 
      finally { setIsAnalysingFile(false); }
  };

  useEffect(() => { handleInputResize(); }, [currentInput]);
  
  // 🟢 核心提速优化：项目列表加载策略 (修复：智能合并，防止丢失本地 Blob)
  useEffect(() => {
    const CACHE_KEY = `rednote_projects_cache_v2_${user.id}`;

    const loadProjects = async () => {
        // 1. 立即加载本地缓存 (Stale First)
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                setProjects(parsed);
            }
        } catch (e) { console.error("Cache read error", e); }

        // 2. 后台静默更新 (Revalidate in Background)
        try {
            const list = await projectRepo.listProjects(user.id);
            const activeProjects = list.filter(p => !p.isDeleted);
            
            // 🚨 CRITICAL FIX: Merge remote data with local 'File' objects (blobs)
            // Background: Remote data only has URLs. If we just replace state, 
            // any recently uploaded 'File' objects (which are not in DB) are lost.
            // This forces the app to fetch the URL, which might fail due to CORS.
            setProjects(prevProjects => {
                // Create a map of existing local File objects
                const localFilesMap = new Map<string, Record<string, File>>();
                prevProjects.forEach(p => {
                    if (p.attachedFiles) {
                        p.attachedFiles.forEach(f => {
                            if (f.file) {
                                if (!localFilesMap.has(p.id)) localFilesMap.set(p.id, {});
                                localFilesMap.get(p.id)![f.id] = f.file as File;
                            }
                        });
                    }
                });

                // Merge these Files back into the fresh data from server
                return activeProjects.map(remoteProj => {
                    const localFiles = localFilesMap.get(remoteProj.id);
                    if (!localFiles) return remoteProj;

                    const mergedFiles = remoteProj.attachedFiles.map(rf => {
                        // If we have a local File object for this attachment ID, use it
                        if (localFiles[rf.id]) {
                            return { ...rf, file: localFiles[rf.id] };
                        }
                        return rf;
                    });
                    
                    return { ...remoteProj, attachedFiles: mergedFiles };
                });
            });
            
            // Update Cache (store strict serializable data)
            localStorage.setItem(CACHE_KEY, JSON.stringify(activeProjects));
        } catch (e) {
            console.warn("Failed to fetch fresh projects", e);
        }
    };

    loadProjects();

    try {
        const savedPersonas = localStorage.getItem(`rednote_personas_${user.id}`);
        if (savedPersonas) setGlobalPersonas(JSON.parse(savedPersonas)); 
    } catch (e) { console.error(e); }
  }, [user.id]);

  useEffect(() => { projectRepo.aggregateUserAssets(user.id).then(setLibraryData); }, [projects, user.id]);

  // ... (Other functions: handleNavigationAttempt, handleMobileItemSelect, etc. remain unchanged)
  // ... (Omitting redundant implementation details for brevity as requested by XML format constraints, only showing modified parts or key context)
  
  const handleNavigationAttempt = (action: () => void) => {
      if (hasUnsavedChanges) {
          setUnsavedNavModal({ show: true, action });
      } else {
          action();
      }
  };

  const handleMobileItemSelect = (id: string) => {
      handleNavigationAttempt(() => {
          const draft = drafts.find(d => String(d.id) === String(id));
          if (draft) {
              setGeneratedContent(draft.content);
              setPreviewState({ title: draft.title, images: draft.images || [] });
              setActiveItemId(String(draft.id));
          } else {
              const pub = publishedHistory.find(p => String(p.id) === String(id));
              if (pub) {
                  setGeneratedContent(pub.content || '');
                  setPreviewState({ title: pub.title, images: pub.imageUrls || [] });
                  setActiveItemId(String(pub.id));
              }
          }
          setHasUnsavedChanges(false);
      });
  };

  const handleCreateNewDraft = () => {
      handleNavigationAttempt(() => {
          setGeneratedContent('');
          setPreviewState({ title: '', images: [getRandomCover()] });
          setActiveItemId(null);
          setHasUnsavedChanges(false);
          if (window.innerWidth < 1024) setActiveTab('preview');
          showToast("已新建空白笔记 (随机配图)");
      });
  };
  
  const handlePublishSuccess = (record: PublishedRecord) => {
      savePublishedRecord(record);
      setHasUnsavedChanges(false);
      setActiveItemId(record.id);
  };
  
  // ... (internalSaveToLibrary, saveAndNavigate, etc.) ...
  
  const internalSaveToLibrary = async (t: string, c: string, type: 'prompt' | 'note', existingId?: string, folder?: string) => {
      if (!c.trim() && !t.trim()) {
          showToast("内容为空，无法保存", "error");
          return;
      }

      const pName = projects.find(p => p.id === currentProjectId)?.persona?.tone || '默认风格';
      let isDraftUpdated = false;
      let isPublishedUpdated = false;
      
      let newDrafts = [...drafts];
      let newPublishedHistory = [...publishedHistory];
      let finalItemId = existingId;

      if (existingId) {
          const draftIndex = newDrafts.findIndex(d => String(d.id) === String(existingId));
          if (draftIndex !== -1) {
              newDrafts[draftIndex] = { 
                  ...newDrafts[draftIndex], 
                  title: t, 
                  content: c, 
                  images: previewState.images, 
                  createdAt: Date.now(), 
                  folder: folder || newDrafts[draftIndex].folder 
              };
              isDraftUpdated = true;
              showToast("草稿已更新");
          } else {
              const pubIndex = newPublishedHistory.findIndex(p => String(p.id) === String(existingId));
              if (pubIndex !== -1) {
                  newPublishedHistory[pubIndex] = {
                      ...newPublishedHistory[pubIndex],
                      title: t,
                      content: c,
                      imageUrls: previewState.images,
                      coverImage: previewState.images[0] || newPublishedHistory[pubIndex].coverImage,
                      folder: folder || newPublishedHistory[pubIndex].folder
                  };
                  isPublishedUpdated = true;
                  showToast("笔记内容已更新");
              }
          }
      } 
      
      if (!isDraftUpdated && !isPublishedUpdated) {
          const newId = `draft-${Date.now()}`;
          finalItemId = newId;
          const newDraft = { id: newId, title: t, content: c, personaName: pName, images: previewState.images, createdAt: Date.now(), folder: folder };
          newDrafts = [newDraft, ...newDrafts];
          showToast("已保存到草稿箱");
      }

      if (isDraftUpdated || (!isDraftUpdated && !isPublishedUpdated)) {
          setDrafts(newDrafts);
      }
      if (isPublishedUpdated) {
          setPublishedHistory(newPublishedHistory);
      }
      
      if (finalItemId && finalItemId !== activeItemId) {
          setActiveItemId(finalItemId);
      }
      setHasUnsavedChanges(false);

      const currentP = projects.find(p => p.id === currentProjectId);
      if (currentP) {
          setSyncStatus('saving');
          const updatedProject = { 
              ...currentP, 
              drafts: newDrafts, 
              publishedHistory: newPublishedHistory,
              updatedAt: Date.now() 
          };
          setProjects(prev => prev.map(p => p.id === currentProjectId ? updatedProject : p));
          try {
              await projectRepo.saveProject(user.id, updatedProject);
              setSyncStatus('saved');
          } catch(e) {
              setSyncStatus('error');
              console.error("Force Save Failed", e);
          }
      }
  };

  const saveAndNavigate = () => {
      const title = generatedContent.split('\n')[0] || '未命名';
      internalSaveToLibrary(title, generatedContent, 'note', activeItemId || undefined);
      if (unsavedNavModal) {
          unsavedNavModal.action();
          setUnsavedNavModal(null);
      }
  };

  const discardAndNavigate = () => {
      setHasUnsavedChanges(false);
      if (unsavedNavModal) {
          unsavedNavModal.action();
          setUnsavedNavModal(null);
      }
  };

  const savePublishedRecord = (record: PublishedRecord) => {
      setPublishedHistory(prev => {
          const exists = prev.some(p => p.id === record.id);
          let newHistory;
          if (exists) {
              newHistory = prev.map(p => p.id === record.id ? record : p);
          } else {
              newHistory = [record, ...prev];
          }
          setProjects(currentProjs => currentProjs.map(p => {
              if (p.id === currentProjectId) { return { ...p, publishedHistory: newHistory, updatedAt: Date.now() }; }
              return p;
          }));
          return newHistory;
      });
  };

  const deletePublishedRecord = (id: string) => {
      const sid = String(id);
      showConfirm("确定要删除这条发布记录吗？", () => {
          setPublishedHistory(prev => {
              const newHistory = prev.filter(r => String(r.id) !== sid);
              setProjects(currentProjs => currentProjs.map(p => {
                  if (p.id === currentProjectId) { return { ...p, publishedHistory: newHistory, updatedAt: Date.now() }; }
                  return p;
              }));
              return newHistory;
          });
          setConfirmModal(null);
          showToast("成品笔记已删除");
      });
  };

  const batchDeletePublishedRecords = (ids: string[]) => {
      const idSet = new Set(ids.map(String));
      setPublishedHistory(prev => {
          const newHistory = prev.filter(r => !idSet.has(String(r.id)));
          setProjects(currentProjs => currentProjs.map(p => {
              if (p.id === currentProjectId) { return { ...p, publishedHistory: newHistory, updatedAt: Date.now() }; }
              return p;
          }));
          return newHistory;
      });
  };

  const downloadQrImage = async (url: string, filename: string) => {
      try {
          const response = await fetch(url);
          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
          showToast("二维码已保存");
      } catch (e) {
          showToast("下载失败", "error");
      }
  };

  useEffect(() => {
      if (!batchLinkInput) return;
      const urls = extractXhsUrls(batchLinkInput);
      if (urls.length > 0 && !isBatchExtracting) {
          const newUrls = urls.filter(u => !socialNotes.some(n => u.includes(n.noteId)));
          if (newUrls.length > 0) { handleBatchExtractInternal(newUrls); }
      }
  }, [batchLinkInput]);

  const handleInputResize = () => {
      if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
      }
  };
  
  // ... (Other useEffects for saveState, scrollIntoView) ...

  useEffect(() => {
    if (!currentProjectId) { setViewMode('dashboard'); return; }
    const project = projects.find(p => p.id === currentProjectId);
    if (project) {
        setContextText(project.contextText || '');
        setAttachedFiles(project.attachedFiles || []);
        setSocialNotes(project.socialNotes || []);
        setChatHistory(project.chatHistory || []);
        setFidelity(project.fidelity || FidelityMode.STRICT);
        setWordCountLimit(project.wordCountLimit || 300);
        setGeneratedContent(project.generatedContent || '');
        setPreviewState(project.previewState || { title: '', images: [getRandomCover()] }); 
        setDrafts(project.drafts || []);
        setPublishedHistory(project.publishedHistory || []);
        setMaterialAnalysis(project.materialAnalysis || '');
        if (project.materialAnalysis) setShowAnalysisArea(true);
        setViewMode('workspace');
    }
  }, [currentProjectId]);

  useEffect(() => {
    if (!currentProjectId) return;
    if (currentProjectId.startsWith('temp-')) return;
    const saveState = async () => {
      setSyncStatus('saving');
      const currentP = projects.find(p => p.id === currentProjectId);
      if (!currentP) return;
      const updatedProject: Project = { 
          ...currentP, 
          updatedAt: Date.now(), 
          contextText, 
          attachedFiles, 
          socialNotes, 
          chatHistory, 
          fidelity, 
          wordCountLimit, 
          generatedContent, 
          previewState, 
          drafts, 
          publishedHistory, 
          materialAnalysis 
      };
      setProjects(prev => prev.map(p => p.id === currentProjectId ? updatedProject : p));
      try {
          const savedId = await projectRepo.saveProject(user.id, updatedProject);
          if (savedId && savedId !== currentProjectId) {
              setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, id: savedId } : p));
              setCurrentProjectId(savedId);
          }
          setSyncStatus('saved');
      } catch (e: any) { setSyncStatus('error'); }
    };
    const timer = setTimeout(saveState, 5000); 
    return () => clearTimeout(timer);
  }, [contextText, attachedFiles, socialNotes, chatHistory, fidelity, wordCountLimit, generatedContent, previewState, drafts, publishedHistory, materialAnalysis]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory, isGenerating]);

  // ... (Rest of event handlers: batchDelete, removeFile, etc.) ...
  
  const handleBatchDeleteDrafts = (ids: string[]) => {
      const idSet = new Set(ids.map(String));
      setDrafts(prev => prev.filter(d => !idSet.has(String(d.id))));
  };

  const handleBatchExtractInternal = async (urls: string[]) => {
      if (urls.length === 0) return;
      const newUrls = urls.filter(u => !socialNotes.some(n => u.includes(n.noteId)));
      if (newUrls.length === 0) return;
      setIsBatchExtracting(true);
      showToast("正在解析链接并提取笔记，请稍候...", "info");
      const newNotes: SocialNote[] = [];
      let failCount = 0;
      for (const url of newUrls) {
          try {
              const data = await fetchXhsNote(url);
              newNotes.push({ ...data, addedAt: Date.now() });
              await linkRepo.saveLink(user.id, { original_url: url, page_title: data.title, summary: data.desc.substring(0, 100) });
          } catch(e) { failCount++; }
      }
      if (newNotes.length > 0) {
          setSocialNotes(prev => [...newNotes, ...prev]);
          setBatchLinkInput(''); 
          showToast(`成功提取 ${newNotes.length} 篇笔记${failCount > 0 ? ` (${failCount} 失败)` : ''}`);
      } else if (failCount > 0) { showToast("提取失败，请检查链接是否有效", "error"); }
      setIsBatchExtracting(false);
  };
  
  // ... (Other methods: removeSocialNote, removeFile, deleteDraft, etc.) ...

  const toggleMaterialSelection = (e: React.MouseEvent, noteId: string) => {
      e.stopPropagation();
      setSelectedMaterialIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(noteId)) newSet.delete(noteId);
          else newSet.add(noteId);
          return newSet;
      });
  };

  const removeSocialNote = (e: React.MouseEvent, noteId: string) => {
      e.stopPropagation(); 
      showConfirm("确定移除这条笔记素材吗？", () => {
          setSocialNotes(prev => [...prev.filter(n => n.noteId !== noteId)]);
          setSelectedMaterialIds(prev => { const n = new Set(prev); n.delete(noteId); return n; });
          showToast("素材已移除");
          setConfirmModal(null);
      });
  };

  const removeFile = (e: React.MouseEvent, fileId: string) => { 
      e.stopPropagation();
      showConfirm("确定移除这个附件吗？", async () => {
          const fileToRemove = attachedFiles.find(f => f.id === fileId);
          if (fileToRemove?.data && !fileToRemove.data.startsWith('data:') && !fileToRemove.data.startsWith('blob:')) {
              deleteFromCOS(fileToRemove.data).catch(console.warn);
          }
          setAttachedFiles(prev => prev.filter(f => f.id !== fileId)); 
          showToast("附件已移除");
          setConfirmModal(null);
      });
  };
  
  const deleteDraft = (draftId: string) => { 
      const sid = String(draftId);
      setDrafts(prev => prev.filter(d => String(d.id) !== sid)); 
      showToast("草稿已从库中移除");
  };

  const handleBatchDeleteMaterials = () => {
      if (selectedMaterialIds.size === 0) return;
      showConfirm(`确定删除选中的 ${selectedMaterialIds.size} 条素材吗？`, () => {
          setSocialNotes(prev => prev.filter(n => !selectedMaterialIds.has(n.noteId)));
          setSelectedMaterialIds(new Set());
          setIsMaterialSelectionMode(false);
          showToast('已批量删除素材');
          setConfirmModal(null);
      });
  };

  const handleDeleteProject = (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      showConfirm("⚠️ 确定要彻底删除这个项目吗？", async () => {
          const originalProjects = [...projects];
          setProjects(prev => prev.filter(p => p.id !== projectId));
          try { await projectRepo.deleteProject(user.id, projectId); showToast("项目已删除"); } 
          catch (error: any) { showToast(`删除失败: ${getErrorMessage(error)}`, 'error'); setProjects(originalProjects); }
          setConfirmModal(null);
      });
  };

  // ... (handleBatchPersonaAnalysis, handleDirectAnalysis) ...

  const handleBatchPersonaAnalysis = async () => {
      if (selectedMaterialIds.size === 0) return;
      showConfirm(`确定要综合分析选中的 ${selectedMaterialIds.size} 篇笔记的风格吗？`, async () => {
          setConfirmModal(null);
          const selectedNotes = socialNotes.filter(n => selectedMaterialIds.has(n.noteId));
          const combinedContent = selectedNotes.map(n => `【标题】${n.title}\n【正文】${n.desc}`).join('\n\n----------------\n\n');
          setIsBatchAnalyzing(true);
          try {
              const persona = await streamPersonaAnalysis(combinedContent, () => {});
              setEditingPersona({
                  ...persona,
                  category: '批量提取',
                  tags: ['批量', ...selectedMaterialIds.size > 1 ? ['混合'] : []],
                  sourceNoteId: 'batch-selection',
                  avatar: user.avatar,
                  description: `来自${selectedMaterialIds.size}篇笔记的综合提取`
              });
              setIsMaterialSelectionMode(false);
              setSelectedMaterialIds(new Set());
          } catch (e: any) { showToast(`分析失败: ${getErrorMessage(e)}`, 'error'); } 
          finally { setIsBatchAnalyzing(false); }
      });
  };

  const handleDirectAnalysis = async (note: SocialNote) => {
      if (analyzingNoteId) return;
      setAnalyzingNoteId(note.noteId);
      try {
          const content = `${note.title}\n\n${note.desc}`;
          const persona = await streamPersonaAnalysis(content, () => {}); 
          setEditingPersona({
              ...persona,
              category: '单篇分析',
              tags: [note.user.nickname],
              sourceNoteId: note.title,
              avatar: note.user.avatar,
              description: `提取自: ${note.title.substring(0,10)}...`
          });
      } catch (e: any) { showToast(`❌ 分析失败: ${getErrorMessage(e)}`, 'error'); } 
      finally { setAnalyzingNoteId(null); setSelectedSocialNote(null); }
  };

  const adoptNote = useCallback((note: BulkNote) => {
      const cleanTitle = cleanMarkdown(note.title);
      const cleanContent = cleanMarkdown(note.content);
      const full = `${cleanTitle}\n\n${cleanContent}`;
      
      setGeneratedContent(full);
      setPreviewState(prev => ({ ...prev, title: cleanTitle }));
      
      setActiveItemId(null);
      setHasUnsavedChanges(true);

      setIsPreviewCollapsed(false);
      if (window.innerWidth < 1024) setActiveTab('preview');
      
      showToast("已填入编辑器");
  }, []);

  const executeGenerate = async () => {
      if (isGenerating) return;
      if (!currentInput.trim() && !contextText.trim() && attachedFiles.length === 0) return;
      const instruction = currentInput || "开始生成";
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: currentInput || '基于上下文生成', timestamp: Date.now() };
      const aiMsgId = (Date.now() + 1).toString();
      const aiPlaceholder: ChatMessage = { id: aiMsgId, role: 'model', text: '', isStreaming: true, timestamp: Date.now() };
      setChatHistory(prev => [...prev, userMsg, aiPlaceholder]);
      setCurrentInput('');
      setIsGenerating(true);
      
      try {
        const project = projects.find(p => p.id === currentProjectId);
        const persona = project?.persona?.writerPersonaPrompt || DEFAULT_MANUAL_PERSONA.writerPersonaPrompt;
        let analysisContext = "";
        if (materialAnalysis && materialAnalysis.trim()) {
            analysisContext = `\n\n【深度资料分析与营销洞察】(请基于此分析进行撰写):\n${materialAnalysis}`;
        }
        const fullContext = contextText ? `【背景】: ${contextText}${analysisContext}\n【指令】: ${instruction}` : `${analysisContext}\n【指令】: ${instruction}`;
        const result = await streamExpertGeneration(fullContext, attachedFiles, persona, fidelity, bulkCount, wordCountLimit, 
            (token, thought) => { setChatHistory(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, text: token, thought: thought } : msg)); }
        );
        setChatHistory(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, text: result.dialogueText, thought: result.thought, bulkNotes: result.notes, isStreaming: false } : msg));
        
        // 🟢 核心修改：生成后自动填入第一个方案 (满足“默认生成的第一个笔记，自动填入”)
        if (result.notes && result.notes.length > 0) {
            adoptNote(result.notes[0]);
        } else if (result.dialogueText) {
            // Fallback: adopt the whole text as content, first line as title
            const lines = result.dialogueText.split('\n');
            adoptNote({ title: lines[0] || '未命名', content: result.dialogueText });
        }

        onUserUpdate({ ...user, quotaRemaining: Math.max(0, user.quotaRemaining - 1) });
        userRepo.incrementInteraction(user.id);
      } catch (err: any) {
        setChatHistory(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, text: `Error: ${getErrorMessage(err)}`, isError: true, isStreaming: false } : msg));
      } finally { setIsGenerating(false); }
  };

  const handleGenerateClick = () => {
      executeGenerate();
  };

  const handleApplyPersona = (p: PersonaAnalysis) => {
      setProjects(prev => prev.map(proj => proj.id === currentProjectId ? { ...proj, persona: p } : proj));
      setShowPersonaSelector(false);
      showToast(`已应用人设: ${p.tone}`);
  };

  const handleSaveEditedPersona = async () => {
      if (editingPersona) {
          const updatedGlobal = [...globalPersonas, editingPersona];
          setGlobalPersonas(updatedGlobal);
          localStorage.setItem(`rednote_personas_${user.id}`, JSON.stringify(updatedGlobal));
          handleApplyPersona(editingPersona);
          const refresh = await projectRepo.aggregateUserAssets(user.id);
          setLibraryData(refresh);
          setEditingPersona(null);
          showToast("人设已保存并同步至云端");
      }
  };

  const createNewProject = async (name: string) => {
      const cleanName = name.trim();
      if (!cleanName) return;
      if (isCreatingProject) return;
      if (projects.some(p => p.name.trim() === cleanName)) { showToast("❌ 项目名称已存在，请使用其他名称", 'error'); return; }
      setIsCreatingProject(true);
      const tempId = `temp-${Date.now()}`;
      const newP: Project = { 
          id: tempId, name: cleanName, updatedAt: Date.now(), 
          contextText: '', attachedFiles: [], socialNotes: [], chatHistory: [], 
          fidelity: FidelityMode.STRICT, wordCountLimit: 400, generatedContent: '', 
          previewState: { title: '', images: [getRandomCover()] }, drafts: [], publishedHistory: [], isDeleted: false
      };
      setProjects(prev => [newP, ...prev]);
      setCurrentProjectId(tempId);
      setShowNameModal(false);
      setTempProjectName('');
      try {
          const realId = await projectRepo.saveProject(user.id, newP);
          if (realId && realId !== tempId) {
              setProjects(prev => prev.map(p => p.id === tempId ? { ...p, id: realId } : p));
              setCurrentProjectId(realId);
          }
      } catch (e) { 
          showToast("创建项目时同步云端失败，请检查网络", 'error'); 
          setProjects(prev => prev.filter(p => p.id !== tempId));
          setCurrentProjectId(null);
      } finally { setIsCreatingProject(false); }
  };

  const getPersonaUsageCount = (tone: string) => {
      return libraryData.finished.filter(item => {
          if (!item) return false;
          if (item.type === 'draft') return (item as NoteDraft).personaName === tone;
          return false;
      }).length;
  };

  // ... (View mode switching: dashboard vs workspace, same as original but using updated state) ...
  if (viewMode === 'dashboard') {
     return (
        <div className="h-screen bg-[#F0F2F5] flex flex-col relative font-sans text-slate-800 overflow-hidden">
             {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({...toast, show: false})} />}
             {confirmModal && (
                 <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
                     <div className="bg-white p-6 rounded-2xl shadow-xl max-w-xs w-full text-center">
                         <h3 className="font-bold text-lg mb-2">确认操作</h3>
                         <p className="text-slate-500 mb-6 text-sm">{confirmModal.msg}</p>
                         <div className="flex gap-3">
                             <button onClick={() => setConfirmModal(null)} className="flex-1 py-2 border rounded-xl text-sm font-bold text-slate-500 active:scale-95 transition-transform">取消</button>
                             <button onClick={confirmModal.action} className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg active:scale-95 transition-transform">确认</button>
                         </div>
                     </div>
                 </div>
             )}
             <div className="h-16 px-8 flex items-center justify-between bg-white/70 backdrop-blur-md border-b border-white/50 z-50 shadow-sm">
                 <div className="flex items-center gap-2">
                     <div className="w-8 h-8 bg-rose-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-rose-200">
                         <Command size={18} />
                     </div>
                     <h1 className="text-lg font-bold text-slate-800">创作中心</h1>
                 </div>
                 <div className="flex items-center gap-4">
                     <span className="text-xs font-medium text-slate-500">Hi, {user.username}</span>
                     <button onClick={onLogout} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-rose-600 transition-all active:scale-90" title="退出">
                         <LogOut size={16} />
                     </button>
                 </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-8">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-10 animate-fade-in">
                        <h2 className="text-3xl font-bold text-slate-900 mb-2">准备好创作了吗？</h2>
                        <p className="text-slate-500 font-medium">选择一个项目开始，或开启新的创作旅程。</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in delay-75">
                        <div onClick={() => setShowNameModal(true)} className="aspect-[4/3] rounded-3xl border-2 border-dashed border-slate-300 hover:border-rose-400 bg-slate-50 hover:bg-white hover:shadow-xl hover:shadow-rose-100/50 transition-all cursor-pointer flex flex-col items-center justify-center group relative overflow-hidden active:scale-95">
                             <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-rose-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                             <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform group-hover:bg-rose-500 group-hover:text-white text-slate-400 z-10">
                                 {isCreatingProject ? <Loader2 size={28} className="animate-spin"/> : <Plus size={28} />}
                             </div>
                             <span className="font-bold text-slate-500 group-hover:text-rose-600 z-10">新建项目</span>
                        </div>
                        {projects.map(p => (
                            <div key={p.id} onClick={() => setCurrentProjectId(p.id)} className="aspect-[4/3] bg-white rounded-3xl p-5 border border-slate-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_10px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden active:scale-95">
                                <button onClick={(e) => handleDeleteProject(e, p.id)} className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-all z-20 shadow-sm border border-slate-100 active:scale-90"><Trash2 size={14} /></button>
                                <div className="z-10"><div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 mb-4 group-hover:bg-slate-900 group-hover:text-white transition-colors"><Folder size={18} /></div><h3 className="font-bold text-lg text-slate-800 line-clamp-1 mb-1">{p.name}</h3><p className="text-xs text-slate-400 font-medium">{new Date(p.updatedAt).toLocaleString('zh-CN', { hour12: false })}</p></div>
                                <div className="flex items-center gap-2 mt-4 z-10"><div className="px-2 py-1 bg-slate-50 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-100 flex items-center gap-1"><FileText size={10} /> {p.drafts?.length || 0}</div><div className="px-2 py-1 bg-slate-50 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-100 flex items-center gap-1"><Hash size={10} /> {p.socialNotes?.length || 0}</div></div>
                                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-gradient-to-tl from-slate-100 to-transparent rounded-full opacity-50 group-hover:scale-125 transition-transform duration-500 pointer-events-none"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {showNameModal && (
                <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[100] flex items-center justify-center animate-fade-in p-4">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl ring-1 ring-white/50">
                        <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">给新项目起个名字</h2>
                        <input type="text" value={tempProjectName} onChange={e => setTempProjectName(e.target.value)} placeholder="例如：8月防晒霜种草..." className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 mb-6 font-bold text-center text-lg outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all placeholder:text-slate-300" autoFocus />
                        <div className="flex gap-3"><button onClick={() => setShowNameModal(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors active:scale-95">取消</button><button onClick={() => { if(!tempProjectName) return; createNewProject(tempProjectName); }} disabled={isCreatingProject} className="flex-[2] py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-colors shadow-lg shadow-slate-200 active:scale-95 flex justify-center items-center gap-2">{isCreatingProject && <Loader2 size={16} className="animate-spin"/>} 开始创作</button></div>
                    </div>
                </div>
            )}
        </div>
     );
  }

  // ... (Workstation main return, same as before) ...
  return (
    <div className="flex h-screen w-screen bg-[#F8FAFC] overflow-hidden font-sans text-slate-900">
      {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({...toast, show: false})} />}
      
      {confirmModal && (
         <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-2xl shadow-xl max-w-xs w-full text-center">
                 <h3 className="font-bold text-lg mb-2">确认操作</h3>
                 <p className="text-slate-500 mb-6 text-sm">{confirmModal.msg}</p>
                 <div className="flex gap-3">
                     <button onClick={() => setConfirmModal(null)} className="flex-1 py-2 border rounded-xl text-sm font-bold text-slate-500 active:scale-95 transition-transform">取消</button>
                     <button onClick={confirmModal.action} className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg active:scale-95 transition-transform">确认</button>
                 </div>
             </div>
         </div>
      )}

      {unsavedNavModal && (
          <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
              <div className="bg-white p-6 rounded-2xl shadow-xl max-w-xs w-full text-center">
                  <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-500">
                      <AlertCircle size={24} />
                  </div>
                  <h3 className="font-bold text-lg mb-2 text-slate-900">编辑器内容未保存</h3>
                  <p className="text-slate-500 mb-6 text-sm">生成新内容或切换笔记将会覆盖当前编辑器的内容，是否保存？</p>
                  <div className="flex flex-col gap-2.5">
                      <button onClick={saveAndNavigate} className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg active:scale-95 transition-transform">保存并继续</button>
                      <div className="flex gap-2">
                          <button onClick={() => setUnsavedNavModal(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold active:scale-95 transition-transform">取消</button>
                          <button onClick={discardAndNavigate} className="flex-1 py-3 bg-red-50 text-red-500 rounded-xl text-sm font-bold active:scale-95 transition-transform">不保存 (覆盖)</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
      
      {/* ... Left Panel, Chat Panel, Right Panel code ... (Same as original, ensuring structure is maintained) */}
      <div className={`flex-col bg-[#F8FAFC] border-r border-slate-200 z-30 transition-all duration-300 ${activeTab === 'libraries' ? 'flex w-full absolute inset-0 bg-[#F8FAFC]' : 'hidden'} lg:flex lg:w-[320px] lg:static lg:shrink-0`}>
         {/* ... (Left Sidebar Content) ... */}
         <div className="h-14 flex items-center px-5 border-b border-slate-200 shrink-0 bg-white">
             <button onClick={() => handleNavigationAttempt(() => setCurrentProjectId(null))} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors mr-3 active:scale-90"><ArrowLeft size={16} /></button>
             <span className="font-bold text-sm truncate flex-1 text-slate-800">{projects.find(p => p.id === currentProjectId)?.name}</span>
         </div>
         {/* ... Rest of Sidebar ... */}
         <div className="flex bg-white border-b border-slate-200 px-2 pt-2">
             {['design', 'assets', 'history'].map(t => (
                 <button key={t} onClick={() => setActiveLeftTab(t as any)} className={`flex-1 pb-2 text-[11px] font-bold border-b-2 transition-all active:opacity-70 ${activeLeftTab === t ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-400'}`}>
                     {t === 'design' ? '设定' : t === 'assets' ? '库' : '成品'}
                 </button>
             ))}
         </div>
         <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
            {/* ... Sidebar Panels Implementation ... */}
            {activeLeftTab === 'design' && (
                <>
                  {/* ... Design Panel ... */}
                   <section className="space-y-3 relative z-50">
                         <div className="flex justify-between items-center">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><UserIcon size={12}/> 当前人设</h3>
                            <button onClick={() => { setTrainerInitialSamples([]); setShowTrainer(true); }} className="text-[10px] text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1 active:scale-95"><BrainCircuit size={10}/> 训练新风格</button>
                         </div>
                         <div className="flex gap-2 items-center relative z-50">
                             <div className="flex-1 bg-gradient-to-br from-white to-slate-50 rounded-xl border border-slate-200 p-4 relative group cursor-pointer hover:border-rose-200 transition-all active:scale-[0.98]" onClick={() => setShowPersonaSelector(!showPersonaSelector)}>
                                 <div className="flex items-center gap-3 mb-2 pointer-events-none">
                                     <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center shrink-0"><UserIcon size={16} /></div>
                                     <div className="min-w-0">
                                         <div className="text-xs font-bold text-slate-800 truncate pr-2">{projects.find(p => p.id === currentProjectId)?.persona?.tone || '默认风格'}</div>
                                         <div className="text-[10px] text-slate-400 truncate pr-2">{projects.find(p => p.id === currentProjectId)?.persona?.description || '点击切换风格模型'}</div>
                                     </div>
                                     <ChevronDown size={14} className="ml-auto text-slate-300" />
                                 </div>
                                 {showPersonaSelector && (
                                     <>
                                        <div className="fixed inset-0 z-[90] cursor-default" onClick={(e) => { e.stopPropagation(); setShowPersonaSelector(false); }} />
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 p-2 max-h-60 overflow-y-auto custom-scrollbar animate-fade-in z-[100]" onClick={e => e.stopPropagation()}>
                                            {(libraryData.personas.length > 0 ? libraryData.personas : globalPersonas).map((p, i) => (
                                                <div key={i} onClick={() => { handleApplyPersona(p); }} className="p-2 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between group/item active:scale-95 z-[100]">
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-xs font-medium text-slate-700 block truncate">{p.tone}</span>
                                                        {p.description && <span className="text-[10px] text-slate-400 block truncate">{p.description}</span>}
                                                        {p.tags && <div className="flex gap-1 mt-1">{p.tags.slice(0,2).map(t => <span key={t} className="text-[8px] bg-slate-100 text-slate-500 px-1 rounded">{t}</span>)}</div>}
                                                    </div>
                                                    <Check size={12} className="text-rose-500 opacity-0 group-hover/item:opacity-100" />
                                                </div>
                                            ))}
                                        </div>
                                     </>
                                 )}
                             </div>
                             <button onClick={() => { const curr = projects.find(p => p.id === currentProjectId)?.persona; if(curr) setEditingPersona(curr); }} className="p-3 h-full bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-colors active:scale-95"><Pencil size={16} /></button>
                         </div>
                     </section>
                     <section className="space-y-3 z-10 relative">
                         <div className="flex justify-between items-center">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><FileText size={12}/> 核心背景</h3>
                            <div className="flex gap-1">
                                <button onClick={handleAnalyzeMaterials} disabled={attachedFiles.length === 0 || isAnalysingFile} className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 px-2 py-1 rounded-md transition-colors flex items-center gap-1 active:scale-95 disabled:opacity-50">
                                    {isAnalysingFile ? <Loader2 size={10} className="animate-spin"/> : <Wand2 size={10}/>} 深度分析
                                </button>
                            </div>
                         </div>
                         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 transition-shadow hover:shadow-md focus-within:shadow-md focus-within:border-rose-200 relative">
                            <textarea value={contextText} onChange={e => setContextText(e.target.value)} placeholder="在此输入产品卖点、活动信息或任何背景资料..." className="w-full h-24 text-xs bg-transparent border-none outline-none resize-none placeholder:text-slate-300 leading-relaxed custom-scrollbar" />
                            <div className="mt-3 pt-3 border-t border-slate-50 grid grid-cols-3 gap-2">
                                {attachedFiles.map(f => (
                                    <div key={f.id} className="relative group aspect-square rounded-lg border border-slate-100 bg-slate-50 overflow-hidden cursor-pointer active:scale-95 transition-transform" title={f.name}>
                                        {f.type === 'image' ? (
                                            <div className="w-full h-full relative">
                                                <img src={f.preview || f.data} className="w-full h-full object-cover"/>
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1">
                                                    <span className="text-[8px] text-white truncate w-full block">{f.name}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center p-2 relative">
                                                <div className="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center mb-1">
                                                    <FileIcon size={16}/>
                                                </div>
                                                <span className="text-[8px] text-slate-500 text-center w-full truncate leading-tight px-1">{f.name}</span>
                                            </div>
                                        )}
                                        <div onClick={(e) => removeFile(e, f.id)} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-[1px] z-10">
                                            <Trash2 size={16} className="text-white drop-shadow-sm hover:scale-110 transition-transform"/>
                                        </div>
                                    </div>
                                ))}
                                <div onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-lg border-2 border-dashed border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 group text-slate-300 hover:text-rose-500">
                                    <Plus size={20} />
                                    <span className="text-[9px] font-bold mt-1">添加</span>
                                </div>
                            </div>
                            <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.docx,.ppt,.pptx,.txt,.md" />
                         </div>
                         {materialAnalysis && (
                             <div className="mt-2">
                                <button onClick={() => setShowAnalysisArea(!showAnalysisArea)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-600 transition-colors w-full active:scale-95">
                                    {showAnalysisArea ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                                    已生成的资料分析 {showAnalysisArea ? '(可编辑)' : '(点击展开)'}
                                </button>
                                {showAnalysisArea && (
                                    <div className="mt-2 bg-indigo-50/50 rounded-xl border border-indigo-100 p-3 animate-fade-in relative group/analysis">
                                        <textarea value={materialAnalysis} onChange={e => setMaterialAnalysis(e.target.value)} className="w-full h-40 text-xs bg-transparent border-none outline-none resize-none text-slate-700 leading-relaxed custom-scrollbar placeholder:text-indigo-300" placeholder="分析结果..."/>
                                        <div className="absolute top-2 right-2 opacity-0 group-hover/analysis:opacity-100 transition-opacity flex gap-1">
                                            <button onClick={() => { setMaterialAnalysis(''); setShowAnalysisArea(false); }} className="p-1 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded shadow-sm border border-slate-100 active:scale-90" title="清除分析"><Trash2 size={12}/></button>
                                        </div>
                                    </div>
                                )}
                             </div>
                         )}
                     </section>
                     <section className="space-y-3 pt-2 border-t border-slate-100">
                         <div className="flex justify-between items-center">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><LinkIcon size={12}/> 素材库 ({socialNotes.length})</h3>
                            <div className="flex gap-1">
                                {isMaterialSelectionMode && (
                                    <>
                                        <button onClick={() => setSelectedMaterialIds(selectedMaterialIds.size === socialNotes.length ? new Set() : new Set(socialNotes.map(n => n.noteId)))} className="text-[10px] text-blue-600 font-bold px-1.5 active:scale-95">{selectedMaterialIds.size === socialNotes.length ? '全不选' : '全选'}</button>
                                        <button onClick={() => { setIsMaterialSelectionMode(false); setSelectedMaterialIds(new Set()); }} className="text-[10px] text-slate-400 px-1.5 active:scale-95">取消</button>
                                    </>
                                )}
                                {!isMaterialSelectionMode && <button onClick={() => setIsMaterialSelectionMode(true)} className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-md transition-colors active:scale-95">批量管理</button>}
                            </div>
                         </div>
                         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 relative">
                             <textarea value={batchLinkInput} onChange={e => setBatchLinkInput(e.target.value)} placeholder="粘贴链接，自动识别提取..." className="w-full h-16 text-xs bg-transparent border-none outline-none resize-none placeholder:text-slate-300 leading-relaxed custom-scrollbar" />
                             <div className="absolute bottom-2 right-2 text-[10px] text-slate-400">
                                {isBatchExtracting ? <span className="flex items-center gap-1 text-blue-500"><Loader2 size={10} className="animate-spin"/> 解析中...</span> : '自动检测'}
                             </div>
                         </div>
                         <div className="grid grid-cols-2 gap-1.5 mt-2">
                            {socialNotes.map(note => (
                                <div key={note.noteId} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-white shadow-sm cursor-pointer group active:scale-[0.98] transition-transform" onClick={(e) => isMaterialSelectionMode ? toggleMaterialSelection(e, note.noteId) : setSelectedSocialNote(note)}>
                                    <img src={note.images[0]?.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" referrerPolicy="no-referrer" />
                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                                        <div className="text-white text-[10px] font-bold line-clamp-2 leading-tight">{note.title}</div>
                                    </div>
                                    {isMaterialSelectionMode && (
                                        <div className="absolute top-1.5 right-1.5">
                                            {selectedMaterialIds.has(note.noteId) ? (
                                                <div className="w-5 h-5 rounded-full bg-[#FF2442] border border-white flex items-center justify-center shadow-sm"><Check size={12} className="text-white" strokeWidth={3}/></div>
                                            ) : ( <div className="w-5 h-5 rounded-full border-[1.5px] border-white/90 bg-black/10 shadow-sm backdrop-blur-sm"></div> )}
                                        </div>
                                    )}
                                    {!isMaterialSelectionMode && ( <button onClick={(e) => removeSocialNote(e, note.noteId)} className="absolute top-1.5 right-1.5 bg-black/40 hover:bg-red-500/80 text-white/80 hover:text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm active:scale-90"><Trash2 size={12}/></button> )}
                                </div>
                            ))}
                         </div>
                         {isMaterialSelectionMode && (
                             <div className="sticky bottom-0 bg-white border-t border-slate-100 p-2 flex gap-2 animate-fade-in shadow-lg z-20">
                                 <button onClick={handleBatchDeleteMaterials} disabled={selectedMaterialIds.size === 0} className="flex-1 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-500 rounded-lg text-xs font-bold transition-colors active:scale-95">删除 ({selectedMaterialIds.size})</button>
                                 <button onClick={handleBatchPersonaAnalysis} disabled={selectedMaterialIds.size === 0 || isBatchAnalyzing} className="flex-[2] py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-slate-200 active:scale-95">{isBatchAnalyzing ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} 提取人设</button>
                             </div>
                         )}
                     </section>
                </>
            )}
            {activeLeftTab === 'assets' && (
                 <section className="space-y-6">
                     <div>
                         <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><UserIcon size={12}/> 所有人设 ({libraryData.personas.length})</h3>
                         <div className="grid grid-cols-2 gap-2.5">
                             {libraryData.personas.map((p, i) => (
                                 <div key={i} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group relative active:scale-[0.98] flex flex-col h-full">
                                     <div className="flex justify-between items-start mb-2">
                                         <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 overflow-hidden shrink-0">{p.avatar ? <img src={p.avatar} className="w-full h-full object-cover"/> : <UserIcon size={16}/>}</div>
                                         <button onClick={() => setEditingPersona(p)} className="p-1.5 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"><Edit2 size={12}/></button>
                                     </div>
                                     <div className="font-bold text-xs text-slate-800 line-clamp-1 mb-1">{p.tone}</div>
                                     <div className="mt-auto flex items-center justify-between border-t border-slate-50 pt-2">
                                         <span className="text-[9px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">创作了 {getPersonaUsageCount(p.tone)} 篇</span>
                                         <button className="text-rose-500 hover:bg-rose-50 p-1 rounded transition-colors active:scale-90" onClick={() => handleApplyPersona(p)} title="应用"><Plus size={14}/></button>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>
                 </section>
             )}
             {activeLeftTab === 'history' && (
                 <section className="space-y-6">
                      <button onClick={handleCreateNewDraft} className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg border border-emerald-100 flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 mb-2 shadow-sm">
                          <Plus size={14}/> 新建空白草稿
                      </button>
                      <div>
                          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Archive size={12}/> 草稿箱 ({drafts.length})</h3>
                          <div className="space-y-2">
                              {drafts.map(d => {
                                  const didStr = String(d.id);
                                  return (
                                    <div key={didStr} className={`bg-white p-2.5 rounded-lg border transition-colors shadow-sm group relative active:scale-[0.98] cursor-pointer ${String(activeItemId) === didStr ? 'border-emerald-500' : 'border-slate-100 hover:border-emerald-300'}`} onClick={() => handleMobileItemSelect(didStr)}>
                                        <div className="font-medium text-xs text-slate-700 truncate pr-4">{d.title || '未命名草稿'}</div>
                                        <div className="text-[9px] text-slate-400 mt-0.5 flex justify-between"><span>{new Date(d.createdAt).toLocaleDateString()}</span><span>{d.personaName}</span></div>
                                        <button onClick={(e) => { e.stopPropagation(); deleteDraft(d.id); }} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 active:scale-90"><Trash2 size={12} /></button>
                                    </div>
                                  );
                              })}
                          </div>
                      </div>
                      <div>
                          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Send size={12}/> 已发布 ({publishedHistory.length})</h3>
                          <div className="space-y-2">
                              {publishedHistory.map(p => (
                                <div key={p.id} onClick={() => handleMobileItemSelect(p.id)} className="group relative bg-white p-2 rounded-xl border border-slate-100 hover:border-rose-200 hover:shadow-md transition-all cursor-pointer flex gap-3 items-center active:scale-[0.98]">
                                    <div className="w-12 h-16 shrink-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-50 relative group/cover cursor-pointer">
                                        <img src={p.coverImage || p.imageUrls?.[0]} className="w-full h-full object-cover" />
                                        <div 
                                            className="absolute bottom-0 right-0 p-1 bg-black/40 backdrop-blur-sm rounded-tl-lg cursor-pointer hover:bg-rose-500 transition-colors"
                                            onClick={(e) => { e.stopPropagation(); setQrModalRecord(p); }}
                                            title="获取发布码"
                                        >
                                            <QrCode size={10} className="text-white"/>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0 py-1">
                                        <div className="font-bold text-xs text-slate-800 line-clamp-1 mb-1">{p.title || '未命名'}</div>
                                        <div className="text-[10px] text-slate-400">{new Date(p.publishedAt).toLocaleDateString()}</div>
                                    </div>
                                    <div className="flex items-center gap-1 pr-1">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); deletePublishedRecord(p.id); }} 
                                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                            title="删除"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                              ))}
                          </div>
                      </div>
                 </section>
             )}
         </div>
      </div>
      
      {/* ... Chat Panel and Right Panel (Preview) remain mostly the same ... */}
      <div className={`flex-1 flex flex-col bg-white relative min-w-0 z-20 ${activeTab === 'chat' ? 'flex' : 'hidden'} lg:flex`}>
          <div className="h-14 border-b border-slate-100 flex items-center justify-between px-6 bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div><span className="text-sm font-bold text-slate-900">AI 创作助手</span></div>
              <div className="flex items-center gap-4">
                 <SyncStatus status={syncStatus} hasUnsavedChanges={hasUnsavedChanges} />
                 <div className="h-4 w-[1px] bg-slate-200 mx-2"></div>
                 <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500"><Zap size={10} fill="currentColor" className="text-yellow-500" />{user.quotaRemaining}</div>
                 <button onClick={() => setIsPreviewCollapsed(!isPreviewCollapsed)} className="hidden lg:block text-slate-400 hover:text-slate-800 active:scale-95 transition-transform">{isPreviewCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}</button>
              </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:px-16 space-y-10 scroll-smooth pb-40">
              {chatHistory.length === 0 && <div className="h-full flex flex-col items-center justify-center pb-20 opacity-50"><div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-6"><Sparkles size={32} className="text-slate-300" /></div><h3 className="text-sm font-medium text-slate-400">准备好创作爆款了吗？</h3></div>}
              {chatHistory.map((msg) => ( <ChatMessageItem key={msg.id} msg={msg} onAdopt={adoptNote} /> ))}
              <div ref={chatEndRef} />
          </div>
          <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
              <div className="w-full max-w-2xl bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-200 p-2 flex flex-col gap-2 transition-all ring-1 ring-slate-100 focus-within:ring-2 focus-within:ring-rose-500/20 focus-within:border-rose-400">
                  <textarea ref={textareaRef} value={currentInput} onChange={(e) => setCurrentInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleGenerateClick()} placeholder="输入创作指令..." className="w-full max-h-32 bg-transparent border-none outline-none text-sm font-medium px-3 py-2 resize-none placeholder:text-slate-400 text-slate-900" rows={1} />
                  <div className="flex justify-between items-center px-2 pb-1">
                      <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                              <button onClick={() => setFidelity(FidelityMode.CREATIVE)} className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all active:scale-95 ${fidelity === FidelityMode.CREATIVE ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>创意</button>
                              <button onClick={() => setFidelity(FidelityMode.STRICT)} className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all active:scale-95 ${fidelity === FidelityMode.STRICT ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>严谨</button>
                          </div>
                          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1 border border-slate-100 ml-2">
                             <span className="text-[10px] font-bold text-slate-400 w-12 text-center">{wordCountLimit}字</span>
                             <input type="range" min="100" max="2000" step="50" value={wordCountLimit} onChange={(e) => setWordCountLimit(Number(e.target.value))} className="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"/>
                          </div>
                          <div className="flex gap-1 ml-2">
                             {[1,3,5].map(n => <button key={n} onClick={() => setBulkCount(n)} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition-colors active:scale-90 ${bulkCount === n ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-100'}`}>{n}</button>)}
                          </div>
                      </div>
                      <button onClick={handleGenerateClick} disabled={isGenerating || (!currentInput && attachedFiles.length === 0)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${isGenerating ? 'bg-slate-100 text-slate-300' : 'bg-slate-900 text-white hover:bg-black hover:scale-105 shadow-md'}`}>
                          {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                  </div>
              </div>
          </div>
      </div>

      <div style={{ width: window.innerWidth >= 1024 ? rightPanelWidth : '100%' }} className={`flex-col bg-[#F8FAFC] z-20 transition-all border-l border-slate-200 relative ${activeTab === 'preview' ? 'flex w-full absolute inset-0' : 'hidden'} lg:flex lg:shrink-0 lg:static ${isPreviewCollapsed ? 'hidden' : ''}`}>
          <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-rose-500/50 z-50 transition-colors" onMouseDown={() => { isResizingRef.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}></div>
          <div className="h-14 flex items-center justify-between px-6 border-b border-slate-200 shrink-0 bg-[#F8FAFC]">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">效果预览</span>
                <button onClick={() => setActiveTab('chat')} className="lg:hidden p-2 text-slate-400 active:scale-90"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex justify-center items-start">
              <MobilePreview 
                content={generatedContent} 
                onContentChange={(c) => { setGeneratedContent(c); setHasUnsavedChanges(true); }}
                onCopy={() => { navigator.clipboard.writeText(generatedContent); showToast("已复制"); }} 
                drafts={drafts} 
                onDeleteDraft={deleteDraft} 
                onDeleteDraftBatch={handleBatchDeleteDrafts}
                images={previewState.images}
                onImagesChange={(imgs) => { setPreviewState(prev => ({ ...prev, images: imgs })); setHasUnsavedChanges(true); }}
                onSaveToLibrary={internalSaveToLibrary} 
                publishedHistory={publishedHistory} 
                onSavePublished={handlePublishSuccess} 
                onDeletePublished={deletePublishedRecord} 
                onDeletePublishedBatch={batchDeletePublishedRecords} 
                onFileUpload={handleMobileFileUpload} 
                user={user} 
                activeItemId={activeItemId}
                setActiveItemId={handleMobileItemSelect}
                onNewNote={handleCreateNewDraft}
              />
          </div>
      </div>

      {selectedSocialNote && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-fade-in" onClick={() => setSelectedSocialNote(null)}>
               <div className="w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex overflow-hidden" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setSelectedSocialNote(null)} className="absolute top-4 left-4 p-2 bg-black/50 text-white rounded-full z-50 active:scale-90"><X size={20}/></button>
                    <div className="w-[60%] bg-black flex items-center justify-center relative group">
                        <img src={selectedSocialNote.images[currentModalImgIdx]?.url} className="max-h-full max-w-full"/>
                    </div>
                    <div className="w-[40%] bg-white p-8 overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">{selectedSocialNote.title}</h2>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedSocialNote.desc}</p>
                        <button onClick={() => handleDirectAnalysis(selectedSocialNote)} disabled={analyzingNoteId === selectedSocialNote.noteId} className={`mt-8 w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${ analyzingNoteId === selectedSocialNote.noteId ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-black active:scale-[0.98]' }`}>
                            {analyzingNoteId === selectedSocialNote.noteId ? ( <> <Loader2 size={18} className="animate-spin" /> 正在深度分析... </> ) : ( <> <Sparkles size={18} /> 提取人设 </> )}
                        </button>
                    </div>
               </div>
          </div>
      )}

      {editingPersona && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[250] flex items-center justify-center p-6 animate-fade-in" onClick={() => setEditingPersona(null)}>
              <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
                  <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800"><Settings2 size={20}/> 编辑人设</h3>
                  <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">人设名称 (Tone)</label>
                      <input value={editingPersona.tone} onChange={e => setEditingPersona({...editingPersona, tone: e.target.value})} className="w-full border border-slate-200 p-3 rounded-xl text-sm font-bold text-indigo-900 bg-slate-50 focus:bg-white focus:border-indigo-300 outline-none transition-all"/>
                  </div>
                  <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">分类 & 标签</label>
                      <div className="flex flex-col gap-2">
                          <input value={editingPersona.category || ''} onChange={e => setEditingPersona({...editingPersona, category: e.target.value})} placeholder="分类" className="w-full border border-slate-200 p-2.5 rounded-xl text-sm bg-slate-50 focus:bg-white outline-none"/>
                          <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100 min-h-[42px]">
                              {editingPersona.tags?.map((tag, idx) => ( <span key={idx} className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center gap-1 ${getTagColor(tag)}`}>{tag} <button onClick={() => setEditingPersona({...editingPersona, tags: editingPersona.tags?.filter((_, i) => i !== idx)})} className="opacity-50 hover:opacity-100 ml-1">×</button> </span> ))}
                              <input placeholder="+ 标签" onKeyDown={(e) => { if (e.key === 'Enter') { const val = e.currentTarget.value.trim(); if (val) { setEditingPersona({...editingPersona, tags: [...(editingPersona.tags || []), val]}); e.currentTarget.value = ''; } } }} className="text-xs bg-transparent outline-none flex-1 min-w-[60px]"/>
                          </div>
                      </div>
                  </div>
                  <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">系统指令 (System Prompt)</label>
                      <textarea value={editingPersona.writerPersonaPrompt} onChange={e => setEditingPersona({...editingPersona, writerPersonaPrompt: e.target.value})} className="w-full h-40 border border-slate-200 p-3 rounded-xl text-[11px] font-mono leading-relaxed resize-none bg-slate-900 text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500/30 custom-scrollbar"/>
                  </div>
                  <div className="flex gap-3 pt-2">
                      <button onClick={() => setEditingPersona(null)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors active:scale-95">取消</button>
                      <button onClick={handleSaveEditedPersona} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 active:scale-95"><CheckCircle2 size={16}/> 保存并应用</button>
                  </div>
              </div>
          </div>
      )}

      {qrModalRecord && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md animate-fade-in" onClick={() => setQrModalRecord(null)}>
              <div className="relative w-full max-w-[320px] rounded-[24px] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="relative aspect-[3/4] w-full">
                       <img src={qrModalRecord.coverImage || qrModalRecord.imageUrls?.[0]} className="absolute inset-0 w-full h-full object-cover" />
                       <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
                       <div className="absolute bottom-4 left-4 right-4 bg-white rounded-[16px] p-4 flex justify-between items-end shadow-lg">
                          <div className="flex-1 mr-4 min-w-0">
                              <h3 className="text-[16px] font-bold text-slate-900 mb-3 line-clamp-2 leading-snug">{qrModalRecord.title || '笔记分享'}</h3>
                              <div className="flex items-center gap-2"><span className="text-[#ff2442] font-bold text-xs">小红书 App</span></div>
                              <div className="text-[10px] text-slate-400 mt-1 scale-95 origin-left">长按扫码查看笔记</div>
                          </div>
                          <div className="w-16 h-16 shrink-0 bg-slate-50 border border-slate-100 rounded-lg p-1 flex items-center justify-center">
                              {qrModalRecord.qrCodeUrl ? <img src={qrModalRecord.qrCodeUrl} className="w-full h-full object-contain mix-blend-multiply" /> : <QrCode size={24} className="text-slate-300"/>}
                          </div>
                       </div>
                  </div>
                  <div className="bg-transparent mt-4 flex flex-col gap-3">
                      <button onClick={() => downloadQrImage(qrModalRecord.qrCodeUrl || '', `xhs-card-${qrModalRecord.title || 'share'}.png`)} className="w-full py-3.5 bg-[#ff2442] hover:bg-[#e01d3a] text-white rounded-full font-bold text-sm shadow-lg shadow-rose-900/20 active:scale-95 transition-all flex items-center justify-center gap-2"><DownloadCloud size={18}/> 保存到相册</button>
                      <button onClick={() => setQrModalRecord(null)} className="w-full py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold text-sm backdrop-blur-md border border-white/20 active:scale-95 transition-all">关闭</button>
                  </div>
              </div>
          </div>
      )}

      {showTrainer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white w-full h-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden relative flex flex-col">
                 <button onClick={() => setShowTrainer(false)} className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full z-50 transition-colors"><X size={20}/></button>
                 <PersonaTrainer 
                    initialSamples={trainerInitialSamples} 
                    onPersonaLocked={() => {}} 
                    onSaveToLibrary={() => {}}
                    onAnalysisComplete={(p, source) => {
                        setEditingPersona({
                             ...p,
                             category: 'AI训练',
                             tags: ['AI提取'],
                             sourceNoteId: 'trainer',
                             avatar: user.avatar,
                             description: '通过风格实验室提取'
                        });
                        setShowTrainer(false);
                    }}
                 />
             </div>
        </div>
      )}
    </div>
  );
};

export default memo(Workstation);
