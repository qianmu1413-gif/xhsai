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
  const [activeLeftTab, setActiveLeftTab] = useState<'design' | 'assets'>('design'); // Removed 'history'
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
  const [customCategories, setCustomCategories] = useState<string[]>([]); // New state for categories

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
      showToast("文件正在上传中，请稍后...", "info");
      
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
                  isUrl: true,
                  file: file // Store local file reference for immediate analysis without CORS
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
        setCustomCategories(project.categories || []);
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
          materialAnalysis,
          categories: customCategories
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
  }, [contextText, attachedFiles, socialNotes, chatHistory, fidelity, wordCountLimit, generatedContent, previewState, drafts, publishedHistory, materialAnalysis, customCategories]);

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
      showToast("正在解析链接并提取笔记，请稍候...", "info"); // Show persistent loading toast
      
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
      setDrafts(prev => [{ id: Math.random().toString(36).substr(2, 9), title: note.title, content: full, personaName: pName, images: previewState.images, createdAt: Date.now() }, ...prev]);
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

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] text-slate-800 font-sans overflow-hidden">
        {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, show: false })} />}
        
        {/* Modals */}
        {showNameModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                    <h3 className="text-lg font-bold mb-4">新建创作项目</h3>
                    <input 
                        autoFocus
                        value={tempProjectName}
                        onChange={e => setTempProjectName(e.target.value)}
                        placeholder="输入项目名称..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                        onKeyDown={e => e.key === 'Enter' && createNewProject(tempProjectName)}
                    />
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowNameModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold">取消</button>
                        <button onClick={() => createNewProject(tempProjectName)} disabled={isCreatingProject} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2">
                            {isCreatingProject && <Loader2 size={14} className="animate-spin"/>} 创建
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Dashboard View */}
        {viewMode === 'dashboard' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-2 font-bold text-xl text-slate-900">
                        <div className="w-8 h-8 bg-rose-500 rounded-lg flex items-center justify-center text-white"><Sparkles size={18} /></div>
                        {APP_NAME || 'Matrix Studio'}
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                            <UserIcon size={14} />
                            <span className="font-bold">{user.username}</span>
                            <span className="text-rose-500 bg-rose-50 px-1.5 rounded text-xs ml-1">剩 {user.quotaRemaining} 次</span>
                        </div>
                        <button onClick={onLogout} className="p-2 text-slate-400 hover:text-rose-500 transition-colors"><LogOut size={18} /></button>
                    </div>
                </header>
                
                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900">我的项目</h2>
                                <p className="text-slate-500 mt-1">管理您的所有创作内容</p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowTrainer(true)} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                                    <BrainCircuit size={16} className="text-rose-500"/> 训练人设
                                </button>
                                <button onClick={() => setShowNameModal(true)} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold shadow-lg shadow-slate-200 hover:bg-black transition-all flex items-center gap-2">
                                    <Plus size={18} /> 新建项目
                                </button>
                            </div>
                        </div>

                        {projects.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                                    <Folder size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">还没有项目</h3>
                                <p className="text-slate-500 mb-6">创建一个新项目开始您的创作之旅</p>
                                <button onClick={() => setShowNameModal(true)} className="px-6 py-2 bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all">
                                    立即创建
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {projects.map(p => (
                                    <div key={p.id} onClick={() => setCurrentProjectId(p.id)} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-rose-100 transition-all cursor-pointer group relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center font-bold text-lg group-hover:bg-rose-50 group-hover:text-rose-500 transition-colors">
                                                {p.name.substring(0,1).toUpperCase()}
                                            </div>
                                            <button onClick={(e) => handleDeleteProject(e, p.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors z-10"><Trash2 size={16}/></button>
                                        </div>
                                        <h3 className="font-bold text-lg text-slate-900 mb-1 truncate">{p.name}</h3>
                                        <p className="text-xs text-slate-400 mb-4 flex items-center gap-2">
                                            <Clock size={12}/> {new Date(p.updatedAt).toLocaleString()}
                                        </p>
                                        <div className="flex gap-2">
                                            {p.persona ? <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md font-bold">{p.persona.tone}</span> : <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md">无固定人设</span>}
                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md flex items-center gap-1"><FileText size={10}/> {p.drafts?.length || 0}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        )}

        {/* Workspace View */}
        {viewMode === 'workspace' && (
            <div className="flex flex-1 h-full w-full">
                {/* Left Panel: Chat & Context */}
                <div className="flex-1 flex flex-col border-r border-slate-200 bg-white relative min-w-0">
                    <header className="h-16 border-b border-slate-100 flex items-center justify-between px-4 shrink-0">
                         <div className="flex items-center gap-2">
                             <button onClick={() => { setCurrentProjectId(null); setViewMode('dashboard'); }} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500"><ArrowLeft size={18}/></button>
                             <div>
                                 <h2 className="font-bold text-slate-900 text-sm">{projects.find(p=>p.id===currentProjectId)?.name}</h2>
                                 <div className="flex items-center gap-2">
                                     <SyncStatus status={syncStatus} />
                                 </div>
                             </div>
                         </div>
                         <div className="flex items-center gap-2">
                             {/* Tabs for mobile/desktop split could go here if needed */}
                         </div>
                    </header>
                    
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar scroll-smooth" ref={chatEndRef}>
                        {chatHistory.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                <Sparkles size={48} className="mb-4 text-slate-200"/>
                                <p className="text-sm font-medium">输入主题，开始创作</p>
                            </div>
                        ) : (
                            <div className="space-y-6 pb-20">
                                {chatHistory.map(msg => (
                                    <ChatMessageItem key={msg.id} msg={msg} onAdopt={adoptNote} />
                                ))}
                                <div ref={chatEndRef} className="h-4" />
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-white">
                         {/* Input Area */}
                         <div className="relative bg-slate-50 border border-slate-200 rounded-2xl p-2 transition-all focus-within:ring-2 focus-within:ring-rose-100 focus-within:border-rose-400 focus-within:bg-white shadow-sm">
                             {attachedFiles.length > 0 && (
                                 <div className="flex gap-2 px-2 pb-2 overflow-x-auto no-scrollbar">
                                     {attachedFiles.map(f => (
                                         <div key={f.id} className="relative group shrink-0">
                                             <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                                                 {f.type === 'image' ? <img src={f.data} className="w-full h-full object-cover"/> : <FileText size={18} className="text-slate-400"/>}
                                             </div>
                                             <button onClick={(e) => removeFile(e, f.id)} className="absolute -top-1 -right-1 bg-slate-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X size={10}/></button>
                                         </div>
                                     ))}
                                 </div>
                             )}
                             <textarea 
                                 ref={textareaRef}
                                 value={currentInput}
                                 onChange={e => setCurrentInput(e.target.value)}
                                 onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); }}}
                                 placeholder="输入指令或主题..."
                                 className="w-full bg-transparent border-none outline-none text-sm px-3 py-2 max-h-32 resize-none"
                                 rows={1}
                             />
                             <div className="flex justify-between items-center px-2 pt-1">
                                 <div className="flex gap-1">
                                     <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors"><Paperclip size={18}/></button>
                                     <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                                     
                                     {/* Persona Selector Trigger */}
                                     <div className="relative">
                                         <button onClick={() => setShowPersonaSelector(!showPersonaSelector)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1">
                                             <UserIcon size={18}/>
                                         </button>
                                         {showPersonaSelector && (
                                             <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50">
                                                 <div className="text-xs font-bold text-slate-500 px-2 py-1">选择人设</div>
                                                 {globalPersonas.map((p, i) => (
                                                     <button key={i} onClick={() => handleApplyPersona(p)} className="w-full text-left text-xs px-2 py-1.5 hover:bg-slate-50 rounded-lg truncate font-medium text-slate-700">
                                                         {p.tone}
                                                     </button>
                                                 ))}
                                                 <button onClick={() => { setShowPersonaSelector(false); setShowTrainer(true); }} className="w-full text-left text-xs px-2 py-1.5 hover:bg-rose-50 text-rose-500 rounded-lg font-bold flex items-center gap-1 mt-1 border-t border-slate-100">
                                                     <Plus size={12}/> 新建人设
                                                 </button>
                                             </div>
                                         )}
                                     </div>
                                 </div>
                                 <button onClick={handleGenerate} disabled={isGenerating || (!currentInput.trim() && attachedFiles.length === 0)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                                     {isGenerating ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} 发送
                                 </button>
                             </div>
                         </div>
                    </div>
                </div>

                {/* Right Panel: Preview & Assets (Collapsible) */}
                <div 
                    className={`bg-slate-50 border-l border-slate-200 transition-all duration-300 ease-in-out flex flex-col relative ${isPreviewCollapsed ? 'w-0 overflow-hidden' : 'w-[400px]'}`}
                >
                     {!isPreviewCollapsed && (
                         <MobilePreview 
                             content={generatedContent}
                             onContentChange={setGeneratedContent}
                             onCopy={() => { navigator.clipboard.writeText(generatedContent); showToast('已复制'); }}
                             targetWordCount={wordCountLimit}
                             onSaveToLibrary={(t, c) => { 
                                 setDrafts(prev => [{id: Date.now().toString(), title: t, content: c, personaName: projects.find(p=>p.id===currentProjectId)?.persona?.tone || '默认', createdAt: Date.now(), images: previewState.images}, ...prev]);
                                 showToast("已存入草稿");
                             }}
                             drafts={drafts}
                             onSelectDraft={(d) => { setGeneratedContent(d.content); setPreviewState(prev => ({ ...prev, title: d.title, images: d.images || [] })); }}
                             onDeleteDraft={deleteDraft}
                             images={previewState.images}
                             onImagesChange={(imgs) => setPreviewState(prev => ({...prev, images: imgs}))}
                             publishedHistory={publishedHistory}
                             onSavePublished={savePublishedRecord}
                             onDeletePublished={deletePublishedRecord}
                             onDeletePublishedBatch={batchDeletePublishedRecords}
                             onFileUpload={handleMobileFileUpload}
                             user={user}
                         />
                     )}
                     
                     {/* Toggle Button */}
                     <button 
                        onClick={() => setIsPreviewCollapsed(!isPreviewCollapsed)}
                        className="absolute top-1/2 -left-3 w-6 h-12 bg-white border border-slate-200 rounded-l-md flex items-center justify-center shadow-md z-10 text-slate-400 hover:text-rose-500 transition-colors"
                        style={{ borderRadius: '8px 0 0 8px' }}
                     >
                        {isPreviewCollapsed ? <ChevronLeft size={16}/> : <ChevronRight size={16}/>}
                     </button>
                </div>
            </div>
        )}

        {/* Persona Trainer Modal Overlay */}
        {showTrainer && (
            <div className="fixed inset-0 z-[200] bg-white">
                <div className="h-full flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                        <button onClick={() => setShowTrainer(false)} className="text-slate-500 hover:text-slate-900 flex items-center gap-2 font-bold"><ArrowLeft size={18}/> 返回</button>
                        <h2 className="font-bold text-lg">人设训练</h2>
                        <div className="w-10"></div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <PersonaTrainer 
                            onPersonaLocked={(p) => {
                                const newP = { ...p, id: Date.now().toString() };
                                const updated = [...globalPersonas, newP];
                                setGlobalPersonas(updated);
                                localStorage.setItem(`rednote_personas_${user.id}`, JSON.stringify(updated));
                                setShowTrainer(false);
                                showToast("人设训练完成并已保存");
                            }}
                            onSaveToLibrary={() => {}} // Not used in this simplified flow
                            onAnalysisComplete={(p) => {
                                setEditingPersona(p);
                                setShowTrainer(false);
                            }}
                        />
                    </div>
                </div>
            </div>
        )}

        {/* Confirm Modal */}
        {confirmModal && (
            <div className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
                    <h3 className="font-bold text-lg mb-2 text-slate-900">确认操作</h3>
                    <p className="text-slate-500 mb-6 text-sm">{confirmModal.msg}</p>
                    <div className="flex gap-3">
                        <button onClick={() => setConfirmModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">取消</button>
                        <button onClick={confirmModal.action} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black shadow-lg">确认</button>
                    </div>
                </div>
            </div>
        )}

        {/* Edit Persona Modal */}
        {editingPersona && (
            <div className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                 <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
                     <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                         <h3 className="font-bold text-slate-900 flex items-center gap-2"><Sparkles size={16} className="text-rose-500"/> 编辑人设</h3>
                         <button onClick={() => setEditingPersona(null)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                     </div>
                     <div className="p-6 overflow-y-auto space-y-4">
                         <div>
                             <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">风格标签 (Tone)</label>
                             <input value={editingPersona.tone} onChange={e => setEditingPersona({...editingPersona, tone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-rose-500"/>
                         </div>
                         <div>
                             <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">关键词 (Keywords)</label>
                             <input value={editingPersona.keywords.join(', ')} onChange={e => setEditingPersona({...editingPersona, keywords: e.target.value.split(/[,，]/).map(k=>k.trim())})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-500"/>
                         </div>
                         <div>
                             <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Prompt 指令 (System Prompt)</label>
                             <textarea value={editingPersona.writerPersonaPrompt} onChange={e => setEditingPersona({...editingPersona, writerPersonaPrompt: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 outline-none focus:border-rose-500 min-h-[150px] leading-relaxed resize-none"/>
                         </div>
                     </div>
                     <div className="p-5 border-t border-slate-100 flex justify-end gap-3 rounded-b-2xl bg-white">
                         <button onClick={() => setEditingPersona(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg transition-colors">取消</button>
                         <button onClick={handleSaveEditedPersona} className="px-6 py-2 bg-rose-500 text-white font-bold rounded-lg shadow-lg hover:bg-rose-600 transition-colors">保存并应用</button>
                     </div>
                 </div>
            </div>
        )}
    </div>
  );
};

export default Workstation;