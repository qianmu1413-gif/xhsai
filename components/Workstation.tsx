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
import { Send, FileText, Sparkles, Loader2, Plus, ChevronDown, ArrowLeft, Wand2, Archive, X, Paperclip, File as FileIcon, Trash2, User as UserIcon, Bot, LogOut, Flame, LayoutGrid, MessageSquareText, Zap, Command, SlidersHorizontal, PanelRightClose, PanelRightOpen, ArrowUpRight, BrainCircuit, ChevronLeft, ChevronRight, Cloud, UploadCloud, CheckCircle2, AlertCircle, Copy, Check, Library, Image as ImageIcon, QrCode, Search, Link as LinkIcon, Edit2, Layers, History, Settings2, Link, Download, Share2, MoreHorizontal, CheckSquare, Square, Terminal, Clock, Hash, Tag, Folder, MonitorPlay, Pencil, Heart, Info, FileQuestion, AlignLeft, DownloadCloud, Save, WifiOff, Database } from 'lucide-react';

// ... (keep PDF.js init and other helper functions)
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
    const [text, setText] = useState("正在连接 AI 大脑...");
    useEffect(() => {
        const steps = ["正在连接 AI 大脑...", "正在深度分析上下文...", "正在构思创意切入点...", "正在撰写笔记...", "即将完成..."];
        let i = 0;
        const interval = setInterval(() => {
            i = (i + 1) % steps.length;
            setText(steps[i]);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-2.5 opacity-80 bg-slate-50 border border-slate-100 px-4 py-3 rounded-xl w-fit animate-fade-in">
            <div className="relative">
                <div className="w-3 h-3 bg-rose-500 rounded-full animate-ping absolute inset-0 opacity-20"></div>
                <Loader2 size={14} className="animate-spin text-rose-500 relative z-10"/>
            </div>
            <span className="text-xs font-bold text-slate-500 animate-pulse">{text}</span>
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
            <div className="flex items-start gap-4 max-w-full lg:max-w-[95%]">
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
                            {msg.text && (
                                <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 hover:shadow-md transition-shadow relative group/card">
                                    <div className="prose prose-sm prose-slate max-w-none text-slate-700 leading-7">
                                        {renderFormattedText(msg.text)}
                                    </div>
                                    <div className="absolute top-4 right-4 opacity-0 group-hover/card:opacity-100 transition-opacity"><CopyButton text={msg.text} /></div>
                                </div>
                            )}
                            
                            {/* 🟢 优化后的批量生成卡片展示区 */}
                            {msg.bulkNotes && msg.bulkNotes.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 mt-2">
                                    {msg.bulkNotes.map((note, idx) => {
                                        const titleLen = getLength(note.title);
                                        const contentLen = getLength(note.content);
                                        const isTitleLong = titleLen > 20;
                                        return (
                                        <div key={idx} className="bg-white rounded-2xl p-0 border border-slate-200 shadow-sm hover:shadow-xl hover:border-rose-300 transition-all flex flex-col relative overflow-hidden group/option ring-1 ring-transparent hover:ring-rose-100">
                                            {/* Header Section */}
                                            <div className="bg-slate-50/50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">方案 #{idx+1}</span>
                                                </div>
                                                <button 
                                                    onClick={() => onAdopt(note)} 
                                                    className="text-[10px] bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
                                                >
                                                    <ArrowUpRight size={12}/> 填入编辑器
                                                </button>
                                            </div>

                                            {/* Metrics Dashboard */}
                                            <div className="px-4 py-2 bg-slate-50/30 border-b border-slate-50 flex gap-4 text-[10px] font-mono text-slate-500">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                                    <span>标题字数: <strong className={isTitleLong ? "text-red-500" : "text-slate-700"}>{titleLen}</strong></span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                                    <span>正文字数: <strong className="text-slate-700">{contentLen}</strong></span>
                                                </div>
                                            </div>

                                            {/* Content Preview */}
                                            <div className="p-5 flex-1 flex flex-col gap-3">
                                                <div>
                                                    <h4 className="font-bold text-sm text-slate-900 leading-snug mb-1">{cleanMarkdown(note.title)}</h4>
                                                </div>
                                                <div className="flex-1 relative">
                                                    <div className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap line-clamp-[8] font-medium opacity-80">
                                                        {cleanMarkdown(note.content)}
                                                    </div>
                                                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                                                </div>
                                            </div>
                                        </div>
                                    )})}
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

export const Workstation: React.FC<WorkstationProps> = ({ user, onUserUpdate, onLogout }) => {
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
  useEffect(() => {
    const loadProjects = async () => {
        const list = await projectRepo.listProjects(user.id);
        setProjects(list.filter(p => !p.isDeleted));
    };
    loadProjects();
    try {
        const savedPersonas = localStorage.getItem(`rednote_personas_${user.id}`);
        if (savedPersonas) setGlobalPersonas(JSON.parse(savedPersonas)); 
    } catch (e) { console.error(e); }
  }, [user.id]);

  useEffect(() => { projectRepo.aggregateUserAssets(user.id).then(setLibraryData); }, [projects, user.id]);

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
    const timer = setTimeout(saveState, 2000);
    return () => clearTimeout(timer);
  }, [contextText, attachedFiles, socialNotes, chatHistory, fidelity, wordCountLimit, generatedContent, previewState, drafts, publishedHistory, materialAnalysis]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory, isGenerating]);

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
      const proceed = () => {
          const cleanTitle = cleanMarkdown(note.title);
          const cleanContent = cleanMarkdown(note.content);
          const full = `${cleanTitle}\n\n${cleanContent}`;
          
          setGeneratedContent(full);
          setPreviewState(prev => ({ ...prev, title: cleanTitle }));
          
          setActiveItemId(null);
          setHasUnsavedChanges(true);

          setIsPreviewCollapsed(false);
          if (window.innerWidth < 1024) setActiveTab('preview');
          
          showToast("已填入编辑器 (自动清洗格式)");
      };

      if (hasUnsavedChangesRef.current) {
          setUnsavedNavModal({ show: true, action: proceed });
      } else {
          proceed();
      }
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
        
        if (result.notes && result.notes.length > 0 && bulkCount === 1) {
            adoptNote(result.notes[0]);
        }

        onUserUpdate({ ...user, quotaRemaining: Math.max(0, user.quotaRemaining - 1) });
        userRepo.incrementInteraction(user.id);
      } catch (err: any) {
        setChatHistory(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, text: `Error: ${getErrorMessage(err)}`, isError: true, isStreaming: false } : msg));
      } finally { setIsGenerating(false); }
  };

  const handleGenerateClick = () => {
      if (hasUnsavedChanges && bulkCount === 1) {
          setUnsavedNavModal({ 
              show: true, 
              action: () => executeGenerate() 
          });
      } else {
          executeGenerate();
      }
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
          showToast("人设已保存");
      }
  };

  if (showTrainer) {
      return (
          <div className="h-screen w-screen bg-white relative z-50">
              <button onClick={() => setShowTrainer(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full z-50"><X size={24} /></button>
              <PersonaTrainer 
                  initialSamples={trainerInitialSamples}
                  onAnalysisComplete={(p, source) => {
                      setEditingPersona({...p, sourceNoteId: 'trainer'});
                      setShowTrainer(false);
                  }}
                  onPersonaLocked={() => {}} 
                  onSaveToLibrary={() => {}} 
              />
          </div>
      );
  }

  return (
      <div className="flex h-screen bg-[#F8FAFC] overflow-hidden text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-900">
           {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({...toast, show: false})} />}

           {unsavedNavModal && (
               <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                   <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
                       <h3 className="text-lg font-bold text-slate-900 mb-2">未保存的更改</h3>
                       <p className="text-sm text-slate-500 mb-6">您有未保存的创作内容，离开将导致内容丢失。</p>
                       <div className="flex gap-3">
                           <button onClick={discardAndNavigate} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">放弃更改</button>
                           <button onClick={saveAndNavigate} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800">保存并离开</button>
                       </div>
                   </div>
               </div>
           )}

           <div className="w-[60px] lg:w-[70px] bg-slate-900 flex flex-col items-center py-6 shrink-0 z-30">
               <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white mb-8 shadow-lg shadow-indigo-900/50">
                   <Sparkles size={20} />
               </div>
               
               <div className="flex flex-col gap-4 w-full px-2">
                   <button onClick={() => setViewMode('dashboard')} className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center transition-all ${viewMode === 'dashboard' ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>
                       <LayoutGrid size={20} />
                   </button>
                   {currentProjectId && (
                       <button onClick={() => setViewMode('workspace')} className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center transition-all ${viewMode === 'workspace' ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>
                           <Wand2 size={20} />
                       </button>
                   )}
               </div>

               <div className="mt-auto flex flex-col gap-4">
                   <button onClick={onLogout} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-all"><LogOut size={20}/></button>
                   <img src={user.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${user.username}`} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-700" />
               </div>
           </div>

           <div className="flex-1 flex overflow-hidden relative">
               {viewMode === 'dashboard' ? (
                   <div className="flex-1 overflow-y-auto p-8 lg:p-12">
                       <div className="max-w-6xl mx-auto">
                           <div className="flex justify-between items-end mb-8">
                               <div>
                                   <h1 className="text-3xl font-bold text-slate-900 mb-2">创作中心</h1>
                                   <p className="text-slate-500">管理您的创作项目与人设资产</p>
                               </div>
                               <button onClick={() => {
                                   const newId = `temp-${Date.now()}`;
                                   const newProject = { 
                                       id: newId, 
                                       name: '新项目', 
                                       updatedAt: Date.now(), 
                                       contextText: '', 
                                       attachedFiles: [], 
                                       socialNotes: [], 
                                       chatHistory: [], 
                                       fidelity: FidelityMode.STRICT, 
                                       wordCountLimit: 300, 
                                       generatedContent: '', 
                                       previewState: { title: '', images: [getRandomCover()] }, 
                                       drafts: [], 
                                       publishedHistory: [] 
                                   };
                                   setProjects([newProject, ...projects]);
                                   setCurrentProjectId(newId);
                                   projectRepo.saveProject(user.id, newProject as Project).then(id => {
                                       if(id) setCurrentProjectId(id);
                                   });
                                   setViewMode('workspace');
                               }} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-slate-200">
                                   <Plus size={18} /> 新建项目
                               </button>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                               {projects.map(project => (
                                   <div key={project.id} onClick={() => { setCurrentProjectId(project.id); setViewMode('workspace'); }} className="group bg-white border border-slate-200 p-6 rounded-2xl hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-100/50 transition-all cursor-pointer relative overflow-hidden">
                                       <div className="flex justify-between items-start mb-4">
                                           <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                                               <Folder size={24} />
                                           </div>
                                           <button onClick={(e) => handleDeleteProject(e, project.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                       </div>
                                       <h3 className="text-lg font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">{project.name}</h3>
                                       <p className="text-xs text-slate-500 mb-4">更新于 {new Date(project.updatedAt).toLocaleDateString()}</p>
                                       <div className="flex gap-2">
                                           <span className="px-2 py-1 bg-slate-50 text-slate-500 text-[10px] rounded-md font-medium border border-slate-100">{project.drafts?.length || 0} 草稿</span>
                                           <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] rounded-md font-medium border border-emerald-100">{project.publishedHistory?.length || 0} 已发布</span>
                                       </div>
                                   </div>
                               ))}
                               {projects.length === 0 && (
                                   <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                                       <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                           <Database size={24} />
                                       </div>
                                       <p className="text-slate-500 font-medium">暂无项目，开始您的创作之旅吧</p>
                                   </div>
                               )}
                           </div>
                       </div>
                   </div>
               ) : (
                   <div className="flex-1 flex h-full">
                       <div className="w-[320px] border-r border-slate-200 bg-white flex flex-col shrink-0">
                           <div className="h-14 border-b border-slate-100 flex items-center px-4 justify-between">
                               <div className="font-bold text-slate-900 flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-2 py-1 rounded-lg" onClick={() => setShowNameModal(true)}>
                                   {projects.find(p => p.id === currentProjectId)?.name} <Edit2 size={12} className="text-slate-400"/>
                               </div>
                               <SyncStatus status={syncStatus} hasUnsavedChanges={hasUnsavedChanges} />
                           </div>
                           
                           <div className="flex p-2 gap-1 border-b border-slate-50">
                               {['design', 'assets', 'history'].map(tab => (
                                   <button key={tab} onClick={() => setActiveLeftTab(tab as any)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeLeftTab === tab ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                                       {tab === 'design' ? '设计' : tab === 'assets' ? '素材' : '历史'}
                                   </button>
                               ))}
                           </div>

                           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                               {activeLeftTab === 'design' && (
                                   <div className="space-y-6">
                                       <div>
                                           <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">当前人设</label>
                                           <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-indigo-500 transition-all group" onClick={() => setShowPersonaSelector(true)}>
                                               <div className="flex justify-between items-center mb-1">
                                                   <span className="text-sm font-bold text-slate-900">{projects.find(p => p.id === currentProjectId)?.persona?.tone || '默认风格'}</span>
                                                   <ChevronRight size={14} className="text-slate-400 group-hover:text-indigo-500"/>
                                               </div>
                                               <div className="flex flex-wrap gap-1">
                                                   {projects.find(p => p.id === currentProjectId)?.persona?.keywords?.slice(0,3).map(k => (
                                                       <span key={k} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">{k}</span>
                                                   ))}
                                               </div>
                                           </div>
                                           <button onClick={() => setShowTrainer(true)} className="w-full mt-2 py-2 border border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex items-center justify-center gap-1">
                                               <BrainCircuit size={12}/> 训练新人设
                                           </button>
                                       </div>

                                       <div>
                                           <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">项目背景</label>
                                           <textarea 
                                               value={contextText} 
                                               onChange={e => setContextText(e.target.value)} 
                                               className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none outline-none focus:border-indigo-500 transition-all"
                                               placeholder="输入产品介绍、活动信息或核心卖点..."
                                           />
                                       </div>

                                       <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">生成配置</label>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-slate-600">保真度模式</span>
                                                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                                        <button onClick={() => setFidelity(FidelityMode.STRICT)} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${fidelity === FidelityMode.STRICT ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>严谨</button>
                                                        <button onClick={() => setFidelity(FidelityMode.CREATIVE)} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${fidelity === FidelityMode.CREATIVE ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>创意</button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-slate-600">目标字数</span>
                                                    <input type="number" value={wordCountLimit} onChange={e => setWordCountLimit(Number(e.target.value))} className="w-16 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-right outline-none focus:border-indigo-500" />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-slate-600">批量生成</span>
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => setBulkCount(Math.max(1, bulkCount - 1))} className="w-5 h-5 bg-slate-100 rounded flex items-center justify-center text-slate-500 hover:bg-slate-200">-</button>
                                                        <span className="text-xs font-bold w-4 text-center">{bulkCount}</span>
                                                        <button onClick={() => setBulkCount(Math.min(5, bulkCount + 1))} className="w-5 h-5 bg-slate-100 rounded flex items-center justify-center text-slate-500 hover:bg-slate-200">+</button>
                                                    </div>
                                                </div>
                                            </div>
                                       </div>
                                   </div>
                               )}
                               
                               {activeLeftTab === 'assets' && (
                                   <div className="space-y-6">
                                       <div>
                                          <div className="flex justify-between items-center mb-3">
                                              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">参考文件</label>
                                              <div className="relative">
                                                  <input type="file" multiple onChange={handleFileUpload} className="hidden" id="asset-upload" />
                                                  <label htmlFor="asset-upload" className="p-1.5 bg-slate-100 text-slate-500 rounded-lg cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><UploadCloud size={14}/></label>
                                              </div>
                                          </div>
                                          <div className="space-y-2">
                                              {attachedFiles.map(file => (
                                                  <div key={file.id} className="group flex items-center gap-3 p-2 bg-slate-50 border border-slate-100 rounded-lg hover:border-indigo-200 transition-all relative">
                                                      <div className="w-8 h-8 bg-white rounded border border-slate-200 flex items-center justify-center shrink-0">
                                                          {file.type === 'image' ? <ImageIcon size={14} className="text-indigo-500"/> : <FileIcon size={14} className="text-amber-500"/>}
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                          <div className="text-xs font-bold text-slate-700 truncate">{file.name}</div>
                                                          <div className="text-[10px] text-slate-400">{file.type}</div>
                                                      </div>
                                                      <button onClick={(e) => removeFile(e, file.id)} className="absolute right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"><Trash2 size={12}/></button>
                                                  </div>
                                              ))}
                                              {attachedFiles.length === 0 && <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">无文件</div>}
                                          </div>
                                          {attachedFiles.length > 0 && (
                                              <button onClick={handleAnalyzeMaterials} disabled={isAnalysingFile} className="w-full mt-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all">
                                                  {isAnalysingFile ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} 智能分析素材
                                              </button>
                                          )}
                                       </div>
                                       
                                       <div>
                                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">小红书链接提取</label>
                                          <div className="flex gap-2 mb-3">
                                              <input value={batchLinkInput} onChange={e => setBatchLinkInput(e.target.value)} placeholder="粘贴笔记链接..." className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs outline-none focus:border-rose-500" />
                                              <button disabled={isBatchExtracting} className="px-3 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors">
                                                  {isBatchExtracting ? <Loader2 size={14} className="animate-spin"/> : <LinkIcon size={14}/>}
                                              </button>
                                          </div>
                                          <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                              {socialNotes.map(note => (
                                                  <div key={note.noteId} className="flex gap-2 p-2 bg-slate-50 border border-slate-100 rounded-lg group hover:border-rose-200 relative" onClick={() => handleDirectAnalysis(note)}>
                                                      <img src={note.images[0]?.url} className="w-10 h-10 object-cover rounded bg-slate-200 shrink-0"/>
                                                      <div className="min-w-0 flex-1">
                                                          <div className="text-xs font-bold text-slate-800 truncate leading-tight mb-1">{note.title}</div>
                                                          <div className="text-[10px] text-slate-400 flex items-center gap-1"><UserIcon size={10}/> {note.user.nickname}</div>
                                                      </div>
                                                      <button onClick={(e) => removeSocialNote(e, note.noteId)} className="absolute right-1 top-1 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={10}/></button>
                                                  </div>
                                              ))}
                                          </div>
                                       </div>
                                   </div>
                               )}

                               {activeLeftTab === 'history' && (
                                   <div className="space-y-2">
                                       {chatHistory.filter(m => m.role === 'model' && m.text).map((msg, i) => (
                                           <div key={i} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 line-clamp-3 hover:border-indigo-200 cursor-pointer" onClick={() => {}}>
                                               {msg.text}
                                           </div>
                                       ))}
                                       {chatHistory.length === 0 && <div className="text-center py-10 text-slate-400 text-xs">暂无历史记录</div>}
                                   </div>
                               )}
                           </div>
                       </div>

                       <div className="flex-1 flex flex-col bg-[#F8FAFC] relative">
                           <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" style={{ paddingBottom: '100px' }}>
                               {chatHistory.length === 0 ? (
                                   <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                       <Bot size={48} className="mb-4 text-slate-300"/>
                                       <p className="text-sm font-medium">输入指令，开始创作</p>
                                   </div>
                               ) : (
                                   chatHistory.map(msg => (
                                       <ChatMessageItem key={msg.id} msg={msg} onAdopt={adoptNote} />
                                   ))
                               )}
                               <div ref={chatEndRef}/>
                           </div>
                           
                           <div className="absolute bottom-6 left-6 right-6">
                               <div className="bg-white p-2 rounded-2xl shadow-xl shadow-indigo-100/50 border border-slate-200 flex flex-col gap-2 relative">
                                   <textarea 
                                       ref={textareaRef}
                                       value={currentInput}
                                       onChange={e => setCurrentInput(e.target.value)}
                                       onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerateClick(); } }}
                                       placeholder="输入创作指令..."
                                       className="w-full max-h-32 bg-transparent border-none outline-none text-sm p-2 resize-none text-slate-800 placeholder:text-slate-400"
                                       rows={1}
                                   />
                                   <div className="flex justify-between items-center px-2 pb-1">
                                       <div className="flex gap-2">
                                           <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" onClick={() => fileInputRef.current?.click()}>
                                               <Paperclip size={16}/>
                                           </button>
                                       </div>
                                       <button disabled={isGenerating} onClick={handleGenerateClick} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                                           {isGenerating ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} 生成
                                       </button>
                                   </div>
                               </div>
                           </div>
                       </div>

                       <div className="w-[375px] bg-slate-100 border-l border-slate-200 flex flex-col shrink-0 p-4 items-center justify-center relative">
                           <MobilePreview 
                              content={generatedContent}
                              onContentChange={setGeneratedContent}
                              images={previewState.images}
                              onImagesChange={(imgs) => setPreviewState(prev => ({ ...prev, images: imgs }))}
                              user={user}
                              onCopy={() => {}}
                              onSaveToLibrary={internalSaveToLibrary}
                              drafts={drafts}
                              onDeleteDraft={deleteDraft}
                              onDeleteDraftBatch={handleBatchDeleteDrafts}
                              publishedHistory={publishedHistory}
                              onSavePublished={handlePublishSuccess}
                              onDeletePublished={deletePublishedRecord}
                              onDeletePublishedBatch={batchDeletePublishedRecords}
                              onFileUpload={handleMobileFileUpload}
                              activeItemId={activeItemId}
                              setActiveItemId={handleMobileItemSelect}
                              onNewNote={handleCreateNewDraft}
                           />
                       </div>
                   </div>
               )}
           </div>

           {showNameModal && (
               <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                   <div className="bg-white rounded-xl p-6 w-80 shadow-2xl">
                       <h3 className="font-bold mb-4">重命名项目</h3>
                       <input value={tempProjectName} onChange={e => setTempProjectName(e.target.value)} placeholder="项目名称" className="w-full border border-slate-200 rounded-lg px-3 py-2 mb-4 text-sm outline-none focus:border-indigo-500" autoFocus />
                       <div className="flex gap-2">
                           <button onClick={() => setShowNameModal(false)} className="flex-1 py-2 text-slate-500 font-bold text-xs bg-slate-100 rounded-lg">取消</button>
                           <button onClick={() => {
                               setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, name: tempProjectName || '未命名项目', updatedAt: Date.now() } : p));
                               setShowNameModal(false);
                               setTempProjectName('');
                           }} className="flex-1 py-2 text-white font-bold text-xs bg-indigo-600 rounded-lg">确认</button>
                       </div>
                   </div>
               </div>
           )}
           
           {showPersonaSelector && (
               <div className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm flex items-center justify-center p-6">
                   <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-fade-in">
                       <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                           <h3 className="font-bold text-slate-900">选择人设模型</h3>
                           <button onClick={() => setShowPersonaSelector(false)}><X size={20} className="text-slate-400"/></button>
                       </div>
                       <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4">
                           <div className="p-4 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all min-h-[140px]" onClick={() => { setShowPersonaSelector(false); setShowTrainer(true); }}>
                               <Plus size={24} className="text-indigo-400"/>
                               <span className="text-sm font-bold text-indigo-500">新建/训练人设</span>
                           </div>
                           {globalPersonas.map((p, i) => (
                               <div key={i} onClick={() => handleApplyPersona(p)} className="p-4 rounded-xl border border-slate-200 cursor-pointer hover:border-indigo-500 hover:shadow-md transition-all group relative">
                                   <div className="font-bold text-slate-900 mb-2">{p.tone}</div>
                                   <div className="flex flex-wrap gap-1.5 mb-2">
                                       {p.keywords.slice(0,4).map(k => <span key={k} className="text-[10px] bg-slate-50 px-1.5 py-0.5 rounded text-slate-500">{k}</span>)}
                                   </div>
                                   <div className="text-xs text-slate-400 line-clamp-2">{p.description || "暂无描述"}</div>
                                   {p.sourceNoteId && <div className="absolute top-3 right-3 text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">{p.sourceNoteId === 'trainer' ? '训练' : '提取'}</div>}
                               </div>
                           ))}
                           <div onClick={() => handleApplyPersona(DEFAULT_MANUAL_PERSONA as PersonaAnalysis)} className="p-4 rounded-xl border border-slate-200 cursor-pointer hover:border-indigo-500 hover:shadow-md transition-all bg-slate-50/50">
                               <div className="font-bold text-slate-900 mb-2">系统默认</div>
                               <div className="text-xs text-slate-500">通用的小红书博主风格，亲切自然。</div>
                           </div>
                       </div>
                   </div>
               </div>
           )}
      </div>
  );
};

export default Workstation;