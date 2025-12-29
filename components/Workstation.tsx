
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { PersonaAnalysis, FidelityMode, ChatMessage, Project, NoteDraft, User, BulkNote, AttachedFile, SocialNote, PublishedRecord, PreviewState } from '../types';
import { streamExpertGeneration, streamPersonaAnalysis, analyzeMaterials } from '../services/geminiService';
import { fetchXhsNote, extractXhsUrls } from '../services/xhsService';
import { projectRepo, fileRepo, linkRepo, userRepo, getErrorMessage } from '../services/repository'; 
import { uploadToCOS, deleteFromCOS } from '../services/cosService'; 
import { publishToXHS } from '../services/publishService';
import { DEFAULT_MANUAL_PERSONA } from '../constants';
import MobilePreview from './MobilePreview';
import PersonaTrainer from './PersonaTrainer';
import Toast, { ToastState } from './Toast';
import { Send, FileText, Sparkles, Loader2, Plus, ChevronDown, ArrowLeft, Wand2, Archive, X, Paperclip, File as FileIcon, Trash2, User as UserIcon, Bot, LogOut, Flame, LayoutGrid, MessageSquareText, Zap, Command, SlidersHorizontal, PanelRightClose, PanelRightOpen, ArrowUpRight, BrainCircuit, ChevronLeft, ChevronRight, Cloud, UploadCloud, CheckCircle2, AlertCircle, Copy, Check, Library, Image as ImageIcon, QrCode, Search, Link as LinkIcon, Edit2, Layers, History, Settings2, Link, Download, Share2, MoreHorizontal, CheckSquare, Square, Terminal, Clock, Hash, Tag, Folder, MonitorPlay, Pencil, Heart, Info, FileQuestion, AlignLeft } from 'lucide-react';
import { isCloudMode } from '../services/supabase';

// Initialize PDF.js
if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Helper: Consistent Color Generator for Tags
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

// ... (Formatted Text Renderer & Helpers)
const renderFormattedText = (text: string) => {
  if (!text) return null;
  // Clean up "[话题]" artifacts commonly found in copy-paste
  // Also remove #话题 suffix
  const cleanText = text.replace(/\[话题\]/g, '').replace(/#话题/g, ''); 
  
  // Split by bold (**text**) or tags (#tag)
  const parts = cleanText.split(/(\*\*.*?\*\*|#[^\s#]+)/g);
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

const SyncStatus: React.FC<{ status: 'saved' | 'saving' | 'error' }> = ({ status }) => {
    if (status === 'saving') return <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full"><Loader2 size={10} className="animate-spin" /> 云同步中...</div>;
    if (status === 'error') return <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full"><AlertCircle size={10} /> 同步失败</div>;
    return <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><CheckCircle2 size={10} /> 已保存</div>;
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all active:scale-90" title="复制内容">
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
    );
};

// --- MEMOIZED CHAT MESSAGE COMPONENT ---
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
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-200 shrink-0 mt-1"><Sparkles size={14} className="text-white" /></div>
                <div className="flex-1 flex flex-col gap-3 min-w-0">
                    {(msg.thought || msg.isStreaming) && (
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs font-mono text-slate-500 leading-relaxed shadow-sm relative overflow-hidden">
                            <div className="flex items-center gap-2 mb-2 text-slate-400 text-[10px] font-bold uppercase tracking-wider"><BrainCircuit size={12} /> 深度思考</div>
                            {msg.thought ? <div className="opacity-80 whitespace-pre-wrap">{msg.thought}</div> : <div className="flex items-center gap-2 opacity-50"><span>正在分析上下文...</span><div className="flex gap-1"><div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></div></div></div>}
                        </div>
                    )}
                    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 hover:shadow-md transition-shadow relative group/card">
                        <div className="prose prose-sm prose-slate max-w-none text-slate-700 leading-7">
                            {renderFormattedText(msg.text)}
                        </div>
                        <div className="absolute top-4 right-4 opacity-0 group-hover/card:opacity-100 transition-opacity"><CopyButton text={msg.text} /></div>
                    </div>
                    {msg.bulkNotes && msg.bulkNotes.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                            {msg.bulkNotes.map((note, idx) => (
                                <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 hover:border-rose-400 hover:shadow-lg transition-all cursor-pointer group/option relative overflow-hidden active:scale-[0.98]" onClick={() => onAdopt(note)}>
                                    <div className="absolute top-0 right-0 p-2 opacity-0 group-hover/option:opacity-100 transition-opacity"><span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg shadow-rose-200">使用此方案</span></div>
                                    <div className="flex items-center gap-2 mb-3"><span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">Option #{idx+1}</span></div>
                                    <h4 className="font-bold text-sm text-slate-900 mb-2 line-clamp-1 group-hover/option:text-rose-600 transition-colors">{renderFormattedText(note.title)}</h4>
                                    <div className="text-xs text-slate-500 leading-relaxed max-h-[150px] overflow-hidden relative">{renderFormattedText(note.content)}<div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none"></div></div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            )}
        </div>
    );
}, (prev, next) => {
    return prev.msg.text === next.msg.text && prev.msg.thought === next.msg.thought && prev.msg.id === next.msg.id;
});

// --- Main Component ---

const Workstation: React.FC<WorkstationProps> = ({ user, onUserUpdate, onLogout }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'dashboard' | 'workspace'>('dashboard'); 
  const [showNameModal, setShowNameModal] = useState(false);
  const [tempProjectName, setTempProjectName] = useState('');
  const [globalPersonas, setGlobalPersonas] = useState<PersonaAnalysis[]>([]);
  
  const [showTrainer, setShowTrainer] = useState(false); 
  const [trainerInitialSamples, setTrainerInitialSamples] = useState<string[]>([]); 

  // Toast System
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      setToast({ show: true, message, type });
  };

  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState<{show: boolean, msg: string, action: () => void} | null>(null);
  
  // Analysis Result Modal State
  const [analysisResult, setAnalysisResult] = useState<{show: boolean, content: string, title: string} | null>(null);
  const [isAnalysingFile, setIsAnalysingFile] = useState(false);

  // Edit Persona State
  const [editingPersona, setEditingPersona] = useState<PersonaAnalysis | null>(null);

  const [activeTab, setActiveTab] = useState<'libraries' | 'chat' | 'preview'>('chat');
  const [activeLeftTab, setActiveLeftTab] = useState<'design' | 'assets' | 'history'>('design');
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const isResizingRef = useRef(false);

  const [batchLinkInput, setBatchLinkInput] = useState('');
  const [isBatchExtracting, setIsBatchExtracting] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  
  // -- NEW: Material Selection State --
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
  const [wordCountLimit, setWordCountLimit] = useState<number>(300); // Default to recommended
  const [generatedContent, setGeneratedContent] = useState('');
  const [previewState, setPreviewState] = useState<PreviewState>({ title: '', images: [] }); 
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
  const [showAnalysisArea, setShowAnalysisArea] = useState(false); // Toggle analysis text area
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ... (Effects and Helper functions mostly unchanged, just removing confirm())

  // Auto-Extract Effect
  useEffect(() => {
      if (!batchLinkInput) return;
      
      const urls = extractXhsUrls(batchLinkInput);
      if (urls.length > 0 && !isBatchExtracting) {
          // Check if detected URLs are already new ones
          const newUrls = urls.filter(u => !socialNotes.some(n => u.includes(n.noteId)));
          if (newUrls.length > 0) {
              handleBatchExtractInternal(newUrls);
          }
      }
  }, [batchLinkInput]);

  // Handler Definitions
  const handleInputResize = () => {
      if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      setIsUploadingFile(true);
      showToast("正在上传文件...", "info");
      
      const newFiles: AttachedFile[] = [];
      let successCount = 0;
      
      for (let i = 0; i < e.target.files.length; i++) {
          const file = e.target.files[i];
          try {
              // Upload to COS (or fallback)
              const url = await uploadToCOS(file);
              const isImage = file.type.startsWith('image/');
              
              newFiles.push({
                  id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                  name: file.name,
                  type: isImage ? 'image' : 'file',
                  mimeType: file.type,
                  data: url,
                  isUrl: true 
              });
              successCount++;
          } catch (err) {
              showToast(`上传失败: ${file.name}`, 'error');
          }
      }
      
      setAttachedFiles(prev => [...prev, ...newFiles]);
      setIsUploadingFile(false);
      if (successCount > 0) showToast(`成功上传 ${successCount} 个文件`);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMobileFileUpload = async (files: File[]): Promise<string[]> => {
        const urls: string[] = [];
        for (const file of files) {
            try {
                const url = await uploadToCOS(file);
                urls.push(url);
            } catch (e) {
                console.error(e);
            }
        }
        return urls;
  };

  // 综合分析所有文件
  const handleAnalyzeMaterials = async () => {
      if (attachedFiles.length === 0) return;
      if (isAnalysingFile) return;
      
      setIsAnalysingFile(true);
      showToast(`正在综合分析 ${attachedFiles.length} 份资料...`, "info");
      
      try {
          // Use multi-file analysis service
          const result = await analyzeMaterials(attachedFiles);
          // Save result to project state
          setMaterialAnalysis(result);
          setShowAnalysisArea(true); // Auto-open the analysis area
          showToast("资料分析已完成，结果已保存");
      } catch (e: any) {
          showToast(`分析失败: ${getErrorMessage(e)}`, 'error');
      } finally {
          setIsAnalysingFile(false);
      }
  };

  // ... (Other effects for resize, loadProjects, syncState - omit for brevity as they are unchanged)
  useEffect(() => { handleInputResize(); }, [currentInput]);
  useEffect(() => {
    const loadProjects = async () => {
        const list = await projectRepo.listProjects(user.id);
        setProjects(list.filter(p => !p.isDeleted)); // Only show non-deleted
    };
    loadProjects();
    try {
        const savedPersonas = localStorage.getItem(`rednote_personas_${user.id}`);
        if (savedPersonas) setGlobalPersonas(JSON.parse(savedPersonas)); 
    } catch (e) { console.error(e); }
  }, [user.id]);

  useEffect(() => {
      projectRepo.aggregateUserAssets(user.id).then(setLibraryData);
  }, [projects, user.id]);

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
        setPreviewState(project.previewState || { title: '', images: [] }); 
        setDrafts(project.drafts || []);
        setPublishedHistory(project.publishedHistory || []);
        // Load material analysis
        setMaterialAnalysis(project.materialAnalysis || '');
        if (project.materialAnalysis) setShowAnalysisArea(true);
        
        setViewMode('workspace');
    }
  }, [currentProjectId]);

  useEffect(() => {
    if (!currentProjectId) return;
    // 关键修复：临时项目ID (temp-) 不触发自动保存，避免与创建过程冲突导致重复
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
          materialAnalysis // Save this new field
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

  // --- Handlers ---

  const showConfirm = (msg: string, action: () => void) => {
      setConfirmModal({ show: true, msg, action });
  };

  const handleDeleteProject = (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      showConfirm("⚠️ 确定要删除这个项目吗？", async () => {
          const originalProjects = [...projects];
          setProjects(prev => prev.filter(p => p.id !== projectId));
          try { await projectRepo.deleteProject(user.id, projectId); showToast("已删除"); } 
          catch (error: any) { showToast(`删除失败: ${getErrorMessage(error)}`, 'error'); setProjects(originalProjects); }
          setConfirmModal(null);
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
      showConfirm("确定移除这个附件吗？", () => {
          const targetFile = attachedFiles.find(f => f.id === fileId);
          setAttachedFiles(prev => prev.filter(f => f.id !== fileId)); 
          if (targetFile && targetFile.isUrl && targetFile.data.startsWith('http')) {
               // Background delete logic usually here
          }
          showToast("附件已移除");
          setConfirmModal(null);
      });
  };
  
  const deleteDraft = (draftId: string) => { 
      showConfirm("确定删除这篇草稿吗？", () => {
          setDrafts(prev => prev.filter(d => d.id !== draftId)); 
          showToast("草稿已删除");
          setConfirmModal(null);
      });
  };

  const handleBatchExtractInternal = async (urls: string[]) => {
      if (urls.length === 0) return;
      const newUrls = urls.filter(u => !socialNotes.some(n => u.includes(n.noteId)));
      if (newUrls.length === 0) return;

      setIsBatchExtracting(true);
      // Removed overlay, just set state and show toast.
      // UI below uses isBatchExtracting to show inline spinner.
      
      const newNotes: SocialNote[] = [];
      let failCount = 0;

      for (const url of newUrls) {
          try {
              const data = await fetchXhsNote(url);
              newNotes.push({ ...data, addedAt: Date.now() });
              await linkRepo.saveLink(user.id, { original_url: url, page_title: data.title, summary: data.desc.substring(0, 100) });
          } catch(e) { 
              console.error(`Failed to extract ${url}`, e); 
              failCount++;
          }
      }
      
      if (newNotes.length > 0) {
          setSocialNotes(prev => [...newNotes, ...prev]);
          setBatchLinkInput(''); 
          showToast(`成功提取 ${newNotes.length} 篇笔记${failCount > 0 ? ` (${failCount} 失败)` : ''}`);
      } else if (failCount > 0) {
          showToast("提取失败，请检查链接是否有效", "error");
      }
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
          } catch (e: any) {
              showToast(`分析失败: ${getErrorMessage(e)}`, 'error');
          } finally {
              setIsBatchAnalyzing(false);
          }
      });
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
              sourceNoteId: note.title, // Store Title for reference
              avatar: note.user.avatar,
              description: `提取自: ${note.title.substring(0,10)}...`
          });
          
      } catch (e: any) { showToast(`❌ 分析失败: ${getErrorMessage(e)}`, 'error'); } 
      finally { setAnalyzingNoteId(null); setSelectedSocialNote(null); }
  };

  // ... (handleCopyLink, processFileUpload, handleFileUpload, handleMobileFileUpload same)
  
  const handleGenerate = async () => {
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
      
      // Inject Material Analysis if available and not empty
      let analysisContext = "";
      if (materialAnalysis && materialAnalysis.trim()) {
          analysisContext = `\n\n【深度资料分析与营销洞察】(请基于此分析进行撰写):\n${materialAnalysis}`;
      }

      const fullContext = contextText ? `【背景】: ${contextText}${analysisContext}\n【指令】: ${instruction}` : `${analysisContext}\n【指令】: ${instruction}`;
      
      const result = await streamExpertGeneration(fullContext, attachedFiles, persona, fidelity, bulkCount, wordCountLimit, 
          (token, thought) => { setChatHistory(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, text: token, thought: thought } : msg)); }
      );
      setChatHistory(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, text: result.dialogueText, thought: result.thought, bulkNotes: result.notes, isStreaming: false } : msg));
      
      onUserUpdate({ ...user, quotaRemaining: Math.max(0, user.quotaRemaining - 1) });
      userRepo.incrementInteraction(user.id);

    } catch (err: any) {
      setChatHistory(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, text: `Error: ${getErrorMessage(err)}`, isError: true, isStreaming: false } : msg));
    } finally { setIsGenerating(false); }
  };

  const handleApplyPersona = (p: PersonaAnalysis) => {
      setProjects(prev => prev.map(proj => proj.id === currentProjectId ? { ...proj, persona: p } : proj));
      setShowPersonaSelector(false);
      showToast(`已应用人设: ${p.tone}`);
  };

  const handleSaveEditedPersona = async () => {
      if (editingPersona) {
          // 1. Update Global Cache (LocalStorage) - Immediate availability in Dropdown
          const updatedGlobal = [...globalPersonas, editingPersona];
          setGlobalPersonas(updatedGlobal);
          localStorage.setItem(`rednote_personas_${user.id}`, JSON.stringify(updatedGlobal));

          // 2. Apply to Current Project (Triggers Cloud Sync via useEffect)
          handleApplyPersona(editingPersona);
          
          // 3. Force refresh assets to show in Library
          const refresh = await projectRepo.aggregateUserAssets(user.id);
          setLibraryData(refresh);

          setEditingPersona(null);
          showToast("人设已保存并同步至云端");
      }
  };

  const adoptNote = useCallback((note: BulkNote) => {
      const pName = projects.find(p => p.id === currentProjectId)?.persona?.tone || '默认';
      const full = `${note.title}\n\n${note.content}`;
      setGeneratedContent(full);
      setPreviewState(prev => ({ ...prev, title: note.title }));
      setDrafts(prev => [{ id: Math.random().toString(36).substr(2, 9), title: note.title, content: full, personaName: pName, createdAt: Date.now() }, ...prev]);
      if (window.innerWidth < 1024) setActiveTab('preview');
      showToast("已采纳并生成草稿");
  }, [currentProjectId, projects]);

  const savePublishedRecord = (record: PublishedRecord) => {
      setPublishedHistory(prev => {
          const newHistory = [record, ...prev];
          setProjects(currentProjs => currentProjs.map(p => {
              if (p.id === currentProjectId) { return { ...p, publishedHistory: newHistory, updatedAt: Date.now() }; }
              return p;
          }));
          return newHistory;
      });
  };

  const deletePublishedRecord = (id: string) => {
      showConfirm("确定删除这条成品笔记吗？", () => {
          setPublishedHistory(prev => {
              const newHistory = prev.filter(r => r.id !== id);
              setProjects(currentProjs => currentProjs.map(p => {
                  if (p.id === currentProjectId) { return { ...p, publishedHistory: newHistory, updatedAt: Date.now() }; }
                  return p;
              }));
              return newHistory;
          });
          showToast("成品已删除");
          setConfirmModal(null);
      });
  };

  const batchDeletePublishedRecords = (ids: string[]) => {
      const idSet = new Set(ids);
      setPublishedHistory(prev => {
          const newHistory = prev.filter(r => !idSet.has(r.id));
          setProjects(currentProjs => currentProjs.map(p => {
              if (p.id === currentProjectId) { return { ...p, publishedHistory: newHistory, updatedAt: Date.now() }; }
              return p;
          }));
          return newHistory;
      });
  };

  const createNewProject = async (name: string) => {
      const cleanName = name.trim();
      if (!cleanName) return;
      if (isCreatingProject) return;

      if (projects.some(p => p.name.trim() === cleanName)) {
          showToast("❌ 项目名称已存在，请使用其他名称", 'error');
          return;
      }
      
      setIsCreatingProject(true);
      const tempId = `temp-${Date.now()}`;
      const newP: Project = { 
          id: tempId, name: cleanName, updatedAt: Date.now(), 
          contextText: '', attachedFiles: [], socialNotes: [], chatHistory: [], 
          fidelity: FidelityMode.STRICT, wordCountLimit: 400, generatedContent: '', 
          previewState: { title: '', images: [] }, drafts: [], publishedHistory: [], isDeleted: false
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
      } finally {
          setIsCreatingProject(false);
      }
  };

  // Helper to count usage
  const getPersonaUsageCount = (tone: string) => {
      return libraryData.finished.filter(item => {
          if (!item) return false;
          // Try to match by persona name stored in drafts/published
          // NoteDraft has personaName
          if (item.type === 'draft') return (item as NoteDraft).personaName === tone;
          // PublishedRecord doesn't explicitly store persona name in current type definition, 
          // but we might need to look it up via project. For now, rely on drafts.
          return false;
      }).length;
  };

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
                             <button onClick={() => setConfirmModal(null)} className="flex-1 py-2 border rounded-xl text-sm font-bold text-slate-500">取消</button>
                             <button onClick={confirmModal.action} className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg">确认</button>
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

  // Trainer view omitted (Same as previous)
  if (showTrainer) {
      return (
        <div className="h-screen bg-white flex flex-col animate-fade-in relative">
            {/* Global Overlay for Analysis */}
            <div className="h-16 border-b border-slate-100 px-6 flex items-center justify-between bg-white sticky top-0 z-30">
                <button onClick={() => setShowTrainer(false)} className="font-semibold text-xs text-slate-500 flex items-center gap-2 hover:text-slate-900 transition-colors active:scale-95"><ArrowLeft size={16} /> 返回工坊</button>
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900"><BrainCircuit size={18} className="text-rose-500" /> 风格实验室</div>
                <div className="w-16"></div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <PersonaTrainer 
                    initialSamples={trainerInitialSamples} 
                    onPersonaLocked={(p) => { handleApplyPersona(p); setShowTrainer(false); }} 
                    onSaveToLibrary={(title, content, type) => {
                         if (type === 'note') {
                             setDrafts(prev => [{ id: Math.random().toString(36).substr(2, 9), title, content, personaName: '样本', createdAt: Date.now() }, ...prev]);
                             showToast("已保存到草稿箱");
                         }
                    }}
                    onAnalysisComplete={(persona, source) => {
                        // Open the Edit Persona Modal with the result
                        setEditingPersona({
                            ...persona,
                            category: '实验室提取',
                            tags: ['样本分析'],
                            sourceNoteId: 'trainer',
                            description: `基于文本样本提取`
                        });
                        setShowTrainer(false); // Close trainer view to show modal on main view
                    }}
                />
            </div>
        </div>
      );
  }

  // Main Workspace
  return (
    <div className="flex h-screen w-screen bg-[#F8FAFC] overflow-hidden font-sans text-slate-900">
      {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({...toast, show: false})} />}
      
      {/* Confirm Modal */}
      {confirmModal && (
         <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
             <div className="bg-white p-6 rounded-2xl shadow-xl max-w-xs w-full text-center animate-fade-in">
                 <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-900"><AlertCircle size={20}/></div>
                 <h3 className="font-bold text-lg mb-2">确认操作</h3>
                 <p className="text-slate-500 mb-6 text-sm leading-relaxed whitespace-pre-wrap">{confirmModal.msg}</p>
                 <div className="flex gap-3">
                     <button onClick={() => setConfirmModal(null)} className="flex-1 py-2.5 border rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors">取消</button>
                     <button onClick={confirmModal.action} className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-200 hover:bg-black transition-colors">确认执行</button>
                 </div>
             </div>
         </div>
      )}

      {/* Analysis Result Modal */}
      {analysisResult && (
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setAnalysisResult(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><Sparkles size={16} className="text-rose-500"/> {analysisResult.title}</h3>
                      <button onClick={() => setAnalysisResult(null)}><X size={18} className="text-slate-400 hover:text-slate-600"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar prose prose-sm prose-slate max-w-none">
                      <div className="whitespace-pre-wrap leading-relaxed">{renderFormattedText(analysisResult.content)}</div>
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
                      <button onClick={() => { navigator.clipboard.writeText(analysisResult.content); showToast("已复制分析结果"); }} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold active:scale-95">复制结果</button>
                  </div>
              </div>
          </div>
      )}

      {/* LEFT: Project Resources */}
      <div className={`flex-col bg-[#F8FAFC] border-r border-slate-200 z-30 transition-all duration-300 ${activeTab === 'libraries' ? 'flex w-full absolute inset-0 bg-[#F8FAFC]' : 'hidden'} lg:flex lg:w-[320px] lg:static lg:shrink-0`}>
         {/* ... (Left Sidebar Header & Tabs - unchanged) */}
         <div className="h-14 flex items-center px-5 border-b border-slate-200 shrink-0 bg-white">
             <button onClick={() => setCurrentProjectId(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors mr-3 active:scale-90"><ArrowLeft size={16} /></button>
             <span className="font-bold text-sm truncate flex-1 text-slate-800">{projects.find(p => p.id === currentProjectId)?.name}</span>
         </div>
         <div className="flex bg-white border-b border-slate-200 px-2 pt-2">
             {['design', 'assets', 'history'].map(t => (
                 <button key={t} onClick={() => setActiveLeftTab(t as any)} className={`flex-1 pb-2 text-[11px] font-bold border-b-2 transition-all active:opacity-70 ${activeLeftTab === t ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-400'}`}>
                     {t === 'design' ? '设定' : t === 'assets' ? '库' : '成品'}
                 </button>
             ))}
         </div>

         <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
             {activeLeftTab === 'design' && (
                 <>
                     {/* Design Section (Persona, Context, Auto-Extract) */}
                     <section className="space-y-3">
                         <div className="flex justify-between items-center">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><UserIcon size={12}/> 当前人设</h3>
                            <button onClick={() => { setTrainerInitialSamples([]); setShowTrainer(true); }} className="text-[10px] text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1 active:scale-95"><BrainCircuit size={10}/> 训练新风格</button>
                         </div>
                         <div className="flex gap-2 items-center">
                             <div className="flex-1 bg-gradient-to-br from-white to-slate-50 rounded-xl border border-slate-200 p-4 relative group cursor-pointer hover:border-rose-200 transition-all active:scale-[0.98]" onClick={() => setShowPersonaSelector(!showPersonaSelector)}>
                                 <div className="flex items-center gap-3 mb-2">
                                     <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center shrink-0"><UserIcon size={16} /></div>
                                     <div className="min-w-0">
                                         <div className="text-xs font-bold text-slate-800 truncate pr-2">{projects.find(p => p.id === currentProjectId)?.persona?.tone || '默认风格'}</div>
                                         <div className="text-[10px] text-slate-400 truncate pr-2">{projects.find(p => p.id === currentProjectId)?.persona?.description || '点击切换风格模型'}</div>
                                     </div>
                                     <ChevronDown size={14} className="ml-auto text-slate-300" />
                                 </div>
                                 {showPersonaSelector && (
                                     <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-2 max-h-60 overflow-y-auto custom-scrollbar animate-fade-in">
                                         {globalPersonas.map((p, i) => (
                                             <div key={i} onClick={(e) => { e.stopPropagation(); handleApplyPersona(p); }} className="p-2 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between group/item active:scale-95">
                                                 <div className="flex-1 min-w-0">
                                                     <span className="text-xs font-medium text-slate-700 block truncate">{p.tone}</span>
                                                     {p.description && <span className="text-[10px] text-slate-400 block truncate">{p.description}</span>}
                                                     {p.tags && <div className="flex gap-1 mt-1">{p.tags.slice(0,2).map(t => <span key={t} className="text-[8px] bg-slate-100 text-slate-500 px-1 rounded">{t}</span>)}</div>}
                                                 </div>
                                                 <Check size={12} className="text-rose-500 opacity-0 group-hover/item:opacity-100" />
                                             </div>
                                         ))}
                                     </div>
                                 )}
                             </div>
                             <button onClick={() => { const curr = projects.find(p => p.id === currentProjectId)?.persona; if(curr) setEditingPersona(curr); }} className="p-3 h-full bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-colors active:scale-95"><Pencil size={16} /></button>
                         </div>
                     </section>
                     
                     {/* Attachments Section (Updated with Analysis Area) */}
                     <section className="space-y-3">
                         <div className="flex justify-between items-center">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><FileText size={12}/> 核心背景</h3>
                            <div className="flex gap-1">
                                <button onClick={handleAnalyzeMaterials} disabled={attachedFiles.length === 0 || isAnalysingFile} className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 px-2 py-1 rounded-md transition-colors flex items-center gap-1 active:scale-95 disabled:opacity-50">
                                    {isAnalysingFile ? <Loader2 size={10} className="animate-spin"/> : <Wand2 size={10}/>} 深度分析
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-md transition-colors flex items-center gap-1 active:scale-95"><Paperclip size={10}/> 附件</button>
                            </div>
                         </div>
                         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 transition-shadow hover:shadow-md focus-within:shadow-md focus-within:border-rose-200 relative">
                            <textarea value={contextText} onChange={e => setContextText(e.target.value)} placeholder="在此输入产品卖点、活动信息或任何背景资料..." className="w-full h-32 text-xs bg-transparent border-none outline-none resize-none placeholder:text-slate-300 leading-relaxed custom-scrollbar" />
                            {attachedFiles.length > 0 && (
                                <div className="flex flex-wrap gap-3 mt-2 pt-3 border-t border-slate-50">
                                    {attachedFiles.map(f => (
                                        <div key={f.id} className="relative group w-24 p-1.5 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all cursor-pointer active:scale-95" title={f.name}>
                                            <div className="w-full h-16 rounded overflow-hidden bg-slate-200 mb-1.5 flex items-center justify-center relative">
                                                {f.type === 'image' ? <img src={f.preview || f.data} className="w-full h-full object-cover"/> : <FileIcon size={24} className="text-slate-400"/>}
                                            </div>
                                            <div className="text-[9px] text-slate-600 leading-tight text-center break-all line-clamp-2 px-0.5">{f.name}</div>
                                            <button onClick={(e) => removeFile(e, f.id)} className="absolute -top-1.5 -right-1.5 bg-white text-slate-400 hover:text-red-500 rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-slate-100 active:scale-90"><X size={10}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.docx,.ppt,.pptx,.txt" />
                         </div>
                         
                         {/* Material Analysis Result Area (Expandable) */}
                         {materialAnalysis && (
                             <div className="mt-2">
                                <button 
                                    onClick={() => setShowAnalysisArea(!showAnalysisArea)} 
                                    className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-600 transition-colors w-full"
                                >
                                    {showAnalysisArea ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                                    已生成的资料分析 {showAnalysisArea ? '(可编辑)' : '(点击展开)'}
                                </button>
                                
                                {showAnalysisArea && (
                                    <div className="mt-2 bg-indigo-50/50 rounded-xl border border-indigo-100 p-3 animate-fade-in relative group/analysis">
                                        <textarea 
                                            value={materialAnalysis} 
                                            onChange={e => setMaterialAnalysis(e.target.value)} 
                                            className="w-full h-40 text-xs bg-transparent border-none outline-none resize-none text-slate-700 leading-relaxed custom-scrollbar placeholder:text-indigo-300"
                                            placeholder="这里是AI对资料的分析结果。生成笔记时，系统会自动参考这里的内容。您也可以手动修改补充。"
                                        />
                                        <div className="absolute top-2 right-2 opacity-0 group-hover/analysis:opacity-100 transition-opacity flex gap-1">
                                            <button onClick={() => { setMaterialAnalysis(''); setShowAnalysisArea(false); }} className="p-1 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded shadow-sm border border-slate-100" title="清除分析"><Trash2 size={12}/></button>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-indigo-100 text-[9px] text-indigo-400 flex items-center gap-1">
                                            <Sparkles size={10} className="fill-indigo-400"/> 生成笔记时将自动使用此分析作为深度背景
                                        </div>
                                    </div>
                                )}
                             </div>
                         )}
                     </section>
                     
                     {/* Material Library & Logic */}
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
                             <textarea value={batchLinkInput} onChange={e => setBatchLinkInput(e.target.value)} placeholder="粘贴链接，系统将自动识别并提取..." className="w-full h-16 text-xs bg-transparent border-none outline-none resize-none placeholder:text-slate-300 leading-relaxed custom-scrollbar" />
                             <div className="absolute bottom-2 right-2 text-[10px] text-slate-400">
                                {isBatchExtracting ? <span className="flex items-center gap-1 text-blue-500"><Loader2 size={10} className="animate-spin"/> 解析中...</span> : '自动检测'}
                             </div>
                         </div>
                         
                         {/* Unified Material Grid */}
                         <div className="grid grid-cols-2 gap-1.5 mt-2">
                            {socialNotes.map(note => (
                                <div key={note.noteId} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-white shadow-sm cursor-pointer group active:scale-[0.98] transition-transform" onClick={(e) => isMaterialSelectionMode ? toggleMaterialSelection(e, note.noteId) : setSelectedSocialNote(note)}>
                                    <img src={note.images[0]?.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" referrerPolicy="no-referrer" />
                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                                        <div className="text-white text-[10px] font-bold line-clamp-2 leading-tight">{note.title}</div>
                                        <div className="flex items-center gap-1 mt-1 opacity-90">
                                            <div className="w-3 h-3 rounded-full bg-white/20 overflow-hidden"><img src={note.user.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer"/></div>
                                            <span className="text-[8px] text-white/80 truncate max-w-[50px]">{note.user.nickname}</span>
                                        </div>
                                    </div>
                                    {/* Note Word Count Badge */}
                                    <div className="absolute top-1.5 left-1.5 bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] text-white font-medium">
                                        {note.desc.length}字
                                    </div>

                                    {isMaterialSelectionMode && (
                                        <div className="absolute top-1.5 right-1.5">
                                            {selectedMaterialIds.has(note.noteId) ? (
                                                <div className="w-5 h-5 rounded-full bg-[#FF2442] border border-white flex items-center justify-center shadow-sm">
                                                    <Check size={12} className="text-white" strokeWidth={3}/>
                                                </div>
                                            ) : (
                                                <div className="w-5 h-5 rounded-full border-[1.5px] border-white/90 bg-black/10 shadow-sm backdrop-blur-sm"></div>
                                            )}
                                        </div>
                                    )}
                                    {!isMaterialSelectionMode && (
                                        <button onClick={(e) => removeSocialNote(e, note.noteId)} className="absolute top-1.5 right-1.5 bg-black/40 hover:bg-red-500/80 text-white/80 hover:text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm active:scale-90">
                                            <Trash2 size={12}/>
                                        </button>
                                    )}
                                </div>
                            ))}
                         </div>
                         
                         {isMaterialSelectionMode && (
                             <div className="sticky bottom-0 bg-white border-t border-slate-100 p-2 flex gap-2 animate-fade-in shadow-lg z-20">
                                 <button onClick={handleBatchDeleteMaterials} disabled={selectedMaterialIds.size === 0} className="flex-1 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-500 rounded-lg text-xs font-bold transition-colors active:scale-95">删除 ({selectedMaterialIds.size})</button>
                                 <button onClick={handleBatchPersonaAnalysis} disabled={selectedMaterialIds.size === 0 || isBatchAnalyzing} className="flex-[2] py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-slate-200 active:scale-95">
                                     {isBatchAnalyzing ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} 提取人设
                                 </button>
                             </div>
                         )}
                     </section>
                 </>
             )}

             {/* Finished & Assets - Same */}
             {activeLeftTab === 'assets' && (
                 <section className="space-y-6">
                     <div>
                         <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><UserIcon size={12}/> 所有人设 ({libraryData.personas.length})</h3>
                         <div className="grid grid-cols-2 gap-2.5">
                             {libraryData.personas.map((p, i) => (
                                 <div key={i} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group relative active:scale-[0.98] flex flex-col h-full">
                                     <div className="flex justify-between items-start mb-2">
                                         <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 overflow-hidden shrink-0">
                                             {p.avatar ? <img src={p.avatar} className="w-full h-full object-cover"/> : <UserIcon size={16}/>}
                                         </div>
                                         <button onClick={() => setEditingPersona(p)} className="p-1.5 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 size={12}/></button>
                                     </div>
                                     <div className="font-bold text-xs text-slate-800 line-clamp-1 mb-1">{p.tone}</div>
                                     <div className="text-[9px] text-slate-400 mb-2 truncate leading-tight">
                                         来源: {p.sourceNoteId || p.sourceProject || '未知'}
                                     </div>
                                     <div className="mt-auto flex items-center justify-between border-t border-slate-50 pt-2">
                                         <span className="text-[9px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                                             创作了 {getPersonaUsageCount(p.tone)} 篇
                                         </span>
                                         <button className="text-rose-500 hover:bg-rose-50 p-1 rounded transition-colors" onClick={() => handleApplyPersona(p)} title="应用"><Plus size={14}/></button>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>
                 </section>
             )}

             {/* History */}
             {activeLeftTab === 'history' && (
                 <section className="space-y-4">
                      <div className="pt-2">
                          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Archive size={12}/> 草稿箱</h3>
                          <div className="space-y-2">
                              {drafts.map(d => (
                                  <div key={d.id} className="bg-white p-2.5 rounded-lg border border-slate-100 hover:border-emerald-300 cursor-pointer transition-colors shadow-sm group relative active:scale-[0.98]" onClick={() => { setGeneratedContent(d.content); setPreviewState(prev => ({...prev, title: d.title})); if(window.innerWidth < 1024) setActiveTab('preview'); }}>
                                      <div className="font-medium text-xs text-slate-700 truncate pr-4">{d.title || '未命名草稿'}</div>
                                      <div className="text-[9px] text-slate-400 mt-0.5 flex justify-between"><span>{new Date(d.createdAt).toLocaleDateString()}</span><span>{d.personaName}</span></div>
                                      <button onClick={(e) => { e.stopPropagation(); deleteDraft(d.id); }} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 active:scale-90"><Trash2 size={12} /></button>
                                  </div>
                              ))}
                              {drafts.length === 0 && <div className="text-[10px] text-slate-300 text-center py-2 bg-slate-50 rounded-lg">暂无草稿</div>}
                          </div>
                      </div>
                 </section>
             )}
         </div>
      </div>
      
      {/* ... (Center & Right Panel - same) */}
      <div className={`flex-1 flex flex-col bg-white relative min-w-0 z-20 ${activeTab === 'chat' ? 'flex' : 'hidden'} lg:flex`}>
          {/* Header */}
          <div className="h-14 border-b border-slate-100 flex items-center justify-between px-6 bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div><span className="text-sm font-bold text-slate-900">AI 创作助手</span></div>
              <div className="flex items-center gap-4">
                 <SyncStatus status={syncStatus} />
                 <div className="h-4 w-[1px] bg-slate-200 mx-2"></div>
                 <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500"><Zap size={10} fill="currentColor" className="text-yellow-500" />{user.quotaRemaining}</div>
                 <button onClick={() => setIsPreviewCollapsed(!isPreviewCollapsed)} className="hidden lg:block text-slate-400 hover:text-slate-800 active:scale-95 transition-transform">{isPreviewCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}</button>
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:px-16 space-y-10 scroll-smooth pb-40">
              {chatHistory.length === 0 && <div className="h-full flex flex-col items-center justify-center pb-20 opacity-50"><div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-6"><Sparkles size={32} className="text-slate-300" /></div><h3 className="text-sm font-medium text-slate-400">准备好创作爆款了吗？</h3></div>}
              {chatHistory.map((msg) => (
                  <ChatMessageItem key={msg.id} msg={msg} onAdopt={adoptNote} />
              ))}
              <div ref={chatEndRef} />
          </div>

          <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
              <div className="w-full max-w-2xl bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-200 p-2 flex flex-col gap-2 transition-all ring-1 ring-slate-100 focus-within:ring-2 focus-within:ring-rose-500/20 focus-within:border-rose-400">
                  <textarea ref={textareaRef} value={currentInput} onChange={(e) => setCurrentInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleGenerate()} placeholder="输入创作指令，例如：生成3篇不同角度的种草文案..." className="w-full max-h-32 bg-transparent border-none outline-none text-sm font-medium px-3 py-2 resize-none placeholder:text-slate-400 text-slate-900" rows={1} />
                  <div className="flex justify-between items-center px-2 pb-1">
                      <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                              <button onClick={() => setFidelity(FidelityMode.CREATIVE)} className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all active:scale-95 ${fidelity === FidelityMode.CREATIVE ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>创意</button>
                              <button onClick={() => setFidelity(FidelityMode.STRICT)} className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all active:scale-95 ${fidelity === FidelityMode.STRICT ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>严谨</button>
                          </div>
                          {/* Word Count Slider */}
                          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1 border border-slate-100 ml-2">
                             <span className="text-[10px] font-bold text-slate-400 w-12 text-center">{wordCountLimit}字</span>
                             <input 
                                 type="range" 
                                 min="100" 
                                 max="2000" 
                                 step="50" 
                                 value={wordCountLimit} 
                                 onChange={(e) => setWordCountLimit(Number(e.target.value))}
                                 className="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                             />
                          </div>
                          <div className="flex gap-1 ml-2">
                             {[1,3,5].map(n => <button key={n} onClick={() => setBulkCount(n)} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition-colors active:scale-90 ${bulkCount === n ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-100'}`}>{n}</button>)}
                          </div>
                      </div>
                      <button onClick={handleGenerate} disabled={isGenerating || (!currentInput && attachedFiles.length === 0)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${isGenerating ? 'bg-slate-100 text-slate-300' : 'bg-slate-900 text-white hover:bg-black hover:scale-105 shadow-md'}`}>
                          {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                  </div>
              </div>
          </div>
      </div>

      {/* Right Preview */}
      {!isPreviewCollapsed && (
          <div style={{ width: window.innerWidth >= 1024 ? rightPanelWidth : '100%' }} className={`flex-col bg-[#F8FAFC] z-20 transition-all border-l border-slate-200 relative ${activeTab === 'preview' ? 'flex w-full absolute inset-0' : 'hidden'} lg:flex lg:shrink-0 lg:static`}>
              <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-rose-500/50 z-50 transition-colors" onMouseDown={() => { isResizingRef.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}></div>
              <div className="h-14 flex items-center justify-between px-6 border-b border-slate-200 shrink-0 bg-[#F8FAFC]">
                   <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">效果预览</span>
                   <button onClick={() => setActiveTab('chat')} className="lg:hidden p-2 text-slate-400 active:scale-90"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex justify-center items-start">
                 <MobilePreview 
                    content={generatedContent} 
                    onContentChange={(newContent) => {
                         setGeneratedContent(newContent);
                         const lines = newContent.split('\n');
                         const title = lines[0] || '未命名';
                         setPreviewState(prev => ({ ...prev, title }));
                    }}
                    onCopy={() => { navigator.clipboard.writeText(generatedContent); showToast("已复制"); }} 
                    targetWordCount={wordCountLimit} 
                    drafts={drafts} 
                    onSelectDraft={d => { setGeneratedContent(d.content); setPreviewState(prev => ({ ...prev, title: d.title })); }}
                    onDeleteDraft={id => deleteDraft(id)} 
                    images={previewState.images}
                    onImagesChange={(imgs) => setPreviewState(prev => ({ ...prev, images: imgs }))}
                    onSaveToLibrary={(t, c) => {
                         const pName = projects.find(p => p.id === currentProjectId)?.persona?.tone || '默认';
                         setDrafts(prev => [{ id: Math.random().toString(36).substr(2, 9), title: t, content: c, personaName: pName, createdAt: Date.now() }, ...prev]);
                         showToast("已保存到草稿箱");
                    }} 
                    publishedHistory={publishedHistory} 
                    onSavePublished={savePublishedRecord}
                    onDeletePublished={deletePublishedRecord}
                    onDeletePublishedBatch={batchDeletePublishedRecords} 
                    onFileUpload={handleMobileFileUpload} 
                    user={user} 
                    // New Batch Action
                    onPublishBatch={async (items) => {
                        // In a real app, this would iterate and call backend
                        // For this demo, we simulate and maybe publish the first one to show it works
                        if (items.length > 0) {
                            const first = items[0];
                            setGeneratedContent(first.content);
                            setPreviewState({ title: first.title, images: first.images });
                            // Triggering the real publish function would require state manipulation inside MobilePreview or refactoring
                            // But MobilePreview handles it internally. 
                            // The onPublishBatch is just a signal.
                        }
                    }}
                 />
              </div>
          </div>
      )}

      {/* DETAIL MODAL (Existing - removed confirm()) */}
      {selectedSocialNote && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-fade-in" onClick={() => setSelectedSocialNote(null)}>
               <div className="w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex overflow-hidden" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setSelectedSocialNote(null)} className="absolute top-4 left-4 p-2 bg-black/50 text-white rounded-full z-50 active:scale-90"><X size={20}/></button>
                    <div className="w-[60%] bg-black flex items-center justify-center relative group">
                        <img src={selectedSocialNote.images[currentModalImgIdx]?.url} className="max-h-full max-w-full"/>
                        {selectedSocialNote.images.length > 1 && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); setCurrentModalImgIdx(prev => prev > 0 ? prev - 1 : prev); }} className="absolute left-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 active:scale-90"><ChevronLeft size={24}/></button>
                                <button onClick={(e) => { e.stopPropagation(); setCurrentModalImgIdx(prev => prev < selectedSocialNote.images.length - 1 ? prev + 1 : prev); }} className="absolute right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 active:scale-90"><ChevronRight size={24}/></button>
                                <div className="absolute bottom-4 flex gap-1.5">
                                    {selectedSocialNote.images.map((_, i) => (
                                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentModalImgIdx ? 'bg-white' : 'bg-white/30'}`}/>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <div className="w-[40%] bg-white p-8 overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">{selectedSocialNote.title}</h2>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedSocialNote.desc}</p>
                        <button 
                            onClick={() => handleDirectAnalysis(selectedSocialNote)} 
                            disabled={analyzingNoteId === selectedSocialNote.noteId} 
                            className={`mt-8 w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                                analyzingNoteId === selectedSocialNote.noteId
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' // 加载状态样式
                                    : 'bg-slate-900 text-white hover:bg-black active:scale-[0.98]' // 正常状态样式
                            }`}
                        >
                            {analyzingNoteId === selectedSocialNote.noteId ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    正在深度分析...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={18} />
                                    提取人设
                                </>
                            )}
                        </button>
                    </div>
               </div>
          </div>
      )}

      {/* Updated Edit Persona Modal (Visual Refinement & No Markdown) */}
      {editingPersona && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[250] flex items-center justify-center p-6 animate-fade-in" onClick={() => setEditingPersona(null)}>
              <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
                  <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800"><Settings2 size={20}/> 编辑人设</h3>
                  
                  <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">人设名称 (Tone)</label>
                      <input 
                        value={editingPersona.tone} 
                        onChange={e => setEditingPersona({...editingPersona, tone: e.target.value})} 
                        className="w-full border border-slate-200 p-3 rounded-xl text-sm font-bold text-indigo-900 bg-slate-50 focus:bg-white focus:border-indigo-300 outline-none transition-all"
                      />
                  </div>

                  <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">分类 & 标签</label>
                      <div className="flex flex-col gap-2">
                          <input 
                            value={editingPersona.category || ''} 
                            onChange={e => setEditingPersona({...editingPersona, category: e.target.value})} 
                            placeholder="分类 (如: 职场)" 
                            className="w-full border border-slate-200 p-2.5 rounded-xl text-sm bg-slate-50 focus:bg-white outline-none"
                          />
                          <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100 min-h-[42px]">
                              {editingPersona.tags?.map((tag, idx) => (
                                  <span key={idx} className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center gap-1 ${getTagColor(tag)}`}>
                                      {tag}
                                      <button onClick={() => setEditingPersona({...editingPersona, tags: editingPersona.tags?.filter((_, i) => i !== idx)})} className="opacity-50 hover:opacity-100 ml-1">×</button>
                                  </span>
                              ))}
                              <input 
                                placeholder="+ 标签 (回车)" 
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = e.currentTarget.value.trim();
                                        if (val) {
                                            setEditingPersona({...editingPersona, tags: [...(editingPersona.tags || []), val]});
                                            e.currentTarget.value = '';
                                        }
                                    }
                                }}
                                className="text-xs bg-transparent outline-none flex-1 min-w-[60px]"
                              />
                          </div>
                      </div>
                  </div>

                  <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">备注说明 (Description)</label>
                      <input 
                        value={editingPersona.description || ''} 
                        onChange={e => setEditingPersona({...editingPersona, description: e.target.value})} 
                        placeholder="例如：适合美妆类产品，语气活泼" 
                        className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-slate-50 focus:bg-white outline-none"
                      />
                  </div>

                  <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1.5 uppercase tracking-wider flex items-center gap-1"><Terminal size={12}/> 系统指令 (System Prompt - Core)</label>
                      <textarea 
                        value={editingPersona.writerPersonaPrompt} 
                        onChange={e => setEditingPersona({...editingPersona, writerPersonaPrompt: e.target.value})} 
                        className="w-full h-40 border border-slate-200 p-3 rounded-xl text-[11px] font-mono leading-relaxed resize-none bg-slate-900 text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500/30 custom-scrollbar"
                      />
                  </div>

                  <div className="flex gap-3 pt-2">
                      <button onClick={() => setEditingPersona(null)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors">取消</button>
                      <button onClick={handleSaveEditedPersona} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                          <CheckCircle2 size={16}/> 保存并应用
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Mobile Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex justify-around items-center z-50 pb-2">
          <button onClick={() => setActiveTab('libraries')} className={`flex flex-col items-center gap-1 ${activeTab === 'libraries' ? 'text-rose-600' : 'text-slate-400'}`}><Library size={20} /><span className="text-[10px] font-medium">库</span></button>
          <button onClick={() => setActiveTab('chat')} className={`flex flex-col items-center gap-1 ${activeTab === 'chat' ? 'text-rose-600' : 'text-slate-400'}`}><MessageSquareText size={20} /><span className="text-[10px] font-medium">创作</span></button>
          <button onClick={() => setActiveTab('preview')} className={`flex flex-col items-center gap-1 ${activeTab === 'preview' ? 'text-rose-600' : 'text-slate-400'}`}><FileText size={20} /><span className="text-[10px] font-medium">预览</span></button>
      </div>
    </div>
  );
};

export default Workstation;
