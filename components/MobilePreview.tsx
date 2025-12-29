
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Battery, Signal, Wifi, ChevronLeft, Image as ImageIcon, X, ChevronRight, Check, Plus, Trash2, Save, LayoutTemplate, Archive, Loader2, QrCode, CheckCircle, Download, Share2, Heart, MessageCircle, Star, MoreHorizontal, MapPin, Settings2, GripHorizontal, ArrowLeft, Crop, Maximize2, AlertCircle, Move, ZoomIn, ArrowRight, CheckSquare, Square, Link as LinkIcon, Folder, FolderOpen, Filter, MousePointerClick, Type, Hash } from 'lucide-react';
import { publishToXHS } from '../services/publishService';
import { NoteDraft, PublishedRecord, User } from '../types';
import Toast, { ToastState } from './Toast';

const PLACEHOLDER_POOL = [
    "https://images.unsplash.com/photo-1618331835717-801e976710b2?q=80&w=1000&auto=format&fit=crop", 
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000&auto=format&fit=crop", 
    "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?q=80&w=1000&auto=format&fit=crop", 
    "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=1000&auto=format&fit=crop", 
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=1000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=1000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1000&auto=format&fit=crop"
];

const getRandomImage = (seed: string) => {
    let hash = 0;
    const safeSeed = seed || 'default';
    for (let i = 0; i < safeSeed.length; i++) {
        hash = safeSeed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PLACEHOLDER_POOL.length;
    return PLACEHOLDER_POOL[index];
};

interface MobilePreviewProps {
  content: string;
  onContentChange: (newContent: string) => void;
  onCopy: () => void;
  targetWordCount?: number;
  onSaveToLibrary: (title: string, content: string, type: 'prompt' | 'note') => void;
  drafts?: NoteDraft[];
  onSelectDraft?: (draft: NoteDraft) => void;
  onDeleteDraft?: (id: string) => void;
  images?: string[]; 
  onImagesChange: (images: string[]) => void;
  publishedHistory?: PublishedRecord[]; 
  onSavePublished?: (record: PublishedRecord) => void; 
  onDeletePublished?: (id: string) => void; 
  onDeletePublishedBatch?: (ids: string[]) => void; 
  onFileUpload?: (files: File[]) => Promise<string[]>; 
  user?: User; 
  onPublishBatch?: (items: { title: string, content: string, images: string[] }[]) => Promise<void>;
}

// 字符长度计算
const getLength = (str: string) => {
  if (!str) return 0;
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0 && code <= 127) {
      len += 0.5;
    } else {
      len += 1;
    }
  }
  return Math.ceil(len);
};

// --- 裁切组件 ---
const InteractiveCropper = ({ imgUrl, onCancel, onSave }: { imgUrl: string, onCancel: () => void, onSave: (newUrl: string) => void }) => {
    const [aspect, setAspect] = useState<number>(3/4);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    }, [aspect]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setOffset({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const newScale = Math.max(1, Math.min(3, scale - e.deltaY * 0.001));
        setScale(newScale);
    };

    const handleSave = () => {
        if (!imgRef.current) return;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const outputWidth = 1080;
        const outputHeight = outputWidth / aspect;

        canvas.width = outputWidth;
        canvas.height = outputHeight;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const img = imgRef.current;
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        
        const cropBoxW = outputWidth;
        const cropBoxH = outputHeight;
        
        const imgAspect = nw / nh;
        const cropAspect = cropBoxW / cropBoxH;
        
        let baseRenderW, baseRenderH;
        
        if (imgAspect > cropAspect) {
            baseRenderH = cropBoxH;
            baseRenderW = baseRenderH * imgAspect;
        } else {
            baseRenderW = cropBoxW;
            baseRenderH = baseRenderW / imgAspect;
        }
        
        const finalRenderW = baseRenderW * scale;
        const finalRenderH = baseRenderH * scale;
        
        const screenToCanvasRatio = outputWidth / 280; 
        
        const centerOffsetX = (cropBoxW - finalRenderW) / 2;
        const centerOffsetY = (cropBoxH - finalRenderH) / 2;
        
        const userOffsetX = offset.x * screenToCanvasRatio;
        const userOffsetY = offset.y * screenToCanvasRatio;

        ctx.drawImage(
            img, 
            centerOffsetX + userOffsetX, 
            centerOffsetY + userOffsetY, 
            finalRenderW, 
            finalRenderH
        );

        onSave(canvas.toDataURL('image/png', 0.9));
    };

    return (
        <div className="absolute inset-0 bg-black z-50 flex flex-col animate-fade-in" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <div className="flex justify-between items-center px-4 py-4 text-white bg-black/50 backdrop-blur-md z-10">
                <button onClick={onCancel} className="text-sm font-medium hover:text-gray-300 transition-colors active:scale-95">取消</button>
                <span className="font-bold text-sm">调整裁切区域</span>
                <button onClick={handleSave} className="text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors active:scale-95">完成</button>
            </div>
            
            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#111] select-none touch-none"
                 onWheel={handleWheel}
            >
                <div 
                    ref={containerRef}
                    className="relative z-10 overflow-hidden ring-1 ring-white/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.85)]"
                    style={{ 
                        aspectRatio: `${aspect}`, 
                        width: '280px',
                        cursor: isDragging ? 'grabbing' : 'grab'
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                >
                    <img 
                        ref={imgRef}
                        src={imgUrl}
                        crossOrigin="anonymous"
                        className="max-w-none pointer-events-none origin-center absolute left-1/2 top-1/2"
                        style={{
                            minWidth: '100%',
                            minHeight: '100%',
                            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        }}
                    />
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                        {[...Array(9)].map((_, i) => <div key={i} className="border border-white/20"></div>)}
                    </div>
                </div>
                
                <div className="absolute bottom-6 left-0 right-0 text-center text-white/40 text-[10px] pointer-events-none">
                    <Move size={12} className="inline mr-1"/> 拖动移动 <span className="mx-2">|</span> <ZoomIn size={12} className="inline mr-1"/> 滚动缩放
                </div>
            </div>

            <div className="h-24 bg-black flex items-center justify-center gap-8 pb-6 border-t border-white/10">
                <button onClick={() => setAspect(3/4)} className={`flex flex-col items-center gap-1.5 transition-colors active:scale-90 ${aspect === 3/4 ? 'text-white' : 'text-gray-600'}`}>
                    <div className={`w-4 h-5 border-2 rounded-[2px] ${aspect === 3/4 ? 'border-white bg-white/20' : 'border-current'}`}></div>
                    <span className="text-[10px] font-bold">3:4</span>
                </button>
                <button onClick={() => setAspect(1/1)} className={`flex flex-col items-center gap-1.5 transition-colors active:scale-90 ${aspect === 1 ? 'text-white' : 'text-gray-600'}`}>
                     <div className={`w-5 h-5 border-2 rounded-[2px] ${aspect === 1 ? 'border-white bg-white/20' : 'border-current'}`}></div>
                     <span className="text-[10px] font-bold">1:1</span>
                </button>
                <button onClick={() => setAspect(4/3)} className={`flex flex-col items-center gap-1.5 transition-colors active:scale-90 ${aspect === 4/3 ? 'text-white' : 'text-gray-600'}`}>
                     <div className={`w-5 h-4 border-2 rounded-[2px] ${aspect === 4/3 ? 'border-white bg-white/20' : 'border-current'}`}></div>
                     <span className="text-[10px] font-bold">4:3</span>
                </button>
                <button onClick={() => setAspect(16/9)} className={`flex flex-col items-center gap-1.5 transition-colors active:scale-90 ${aspect === 16/9 ? 'text-white' : 'text-gray-600'}`}>
                     <div className={`w-6 h-3.5 border-2 rounded-[2px] ${aspect === 16/9 ? 'border-white bg-white/20' : 'border-current'}`}></div>
                     <span className="text-[10px] font-bold">16:9</span>
                </button>
            </div>
        </div>
    );
};

const QRCodeDisplay = ({ value, size }: { value: string, size: number }) => {
    if (value.startsWith('data:image') || (value.startsWith('http') && /\.(png|jpg|jpeg|gif|webp)$/i.test(value))) {
        return <img src={value} alt="QR Code" style={{ width: size, height: size, objectFit: 'contain' }} />;
    }
    return (
        <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`}
            alt="QR Code"
            style={{ width: size, height: size, objectFit: 'contain' }}
        />
    );
};

interface FooterTemplate {
    id: string;
    name: string;
    content: string;
}

const MobilePreview: React.FC<MobilePreviewProps> = ({
  content = '', 
  onContentChange, onCopy, targetWordCount = 400, onSaveToLibrary,
  drafts = [], onSelectDraft, onDeleteDraft,
  images = [], onImagesChange,
  publishedHistory = [], onSavePublished, onDeletePublished, onDeletePublishedBatch,
  onFileUpload, user, onPublishBatch
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'all' | 'drafts' | 'published'>('preview');
  const [isPublishing, setIsPublishing] = useState(false);
  const [viewingQrCode, setViewingQrCode] = useState<{ qrcode: string; title: string; cover: string } | null>(null);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const [croppingImg, setCroppingImg] = useState<{ url: string, index: number } | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  
  // Custom Footer State
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customFooter, setCustomFooter] = useState('');
  const [footerTemplates, setFooterTemplates] = useState<FooterTemplate[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Drafts', 'Published']));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  // --- CAROUSEL DRAG LOGIC ---
  const [isDragScroll, setIsDragScroll] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
      if (!carouselRef.current) return;
      setIsDragScroll(true);
      const pageX = 'touches' in e ? e.touches[0].pageX : e.pageX;
      setStartX(pageX - carouselRef.current.offsetLeft);
      setScrollLeft(carouselRef.current.scrollLeft);
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDragScroll || !carouselRef.current) return;
      const pageX = 'touches' in e ? e.touches[0].pageX : e.pageX;
      const x = pageX - carouselRef.current.offsetLeft;
      const walk = (x - startX) * 1.5; 
      carouselRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleDragEnd = () => setIsDragScroll(false);

  // Parse Content
  const safeContent = content || '';
  const title = safeContent.split('\n')[0] || '';
  // Full Body (everything after title)
  const fullBody = safeContent.includes('\n') ? safeContent.substring(safeContent.indexOf('\n') + 1) : '';

  // In Custom Mode, we assume the "Footer" is separated.
  const tagsRegex = /((\s*#[^\s#]+)+)$/;
  const match = fullBody.match(tagsRegex);
  const detectedFooter = match ? match[1].trim() : '';
  const bodyWithoutFooter = match ? fullBody.replace(tagsRegex, '').trim() : fullBody.trim();

  // Determine what to show in the Textarea
  const displayBody = isCustomMode ? bodyWithoutFooter : fullBody;
  
  // Real-time extracted tags from Custom Footer for display
  const detectedTagsInFooter = (customFooter.match(/#[^\s#]+/g) || []);

  const titleLen = getLength(title);
  const bodyLen = getLength(displayBody);
  const isTitleOver = titleLen > 20;
  
  const currentPlaceholder = React.useMemo(() => getRandomImage(title || 'default'), [title]);
  const showToast = (msg: string, type: 'success'|'error'|'info' = 'success') => setToast({ show: true, message: msg, type });

  // Load Templates
  useEffect(() => {
      try {
          const saved = localStorage.getItem('rednote_footer_templates');
          if (saved) setFooterTemplates(JSON.parse(saved));
      } catch(e) {}
  }, []);

  const saveTemplate = () => {
      if (!newTemplateName.trim() || !customFooter.trim()) return showToast("名称或内容不能为空", 'error');
      const newT = { id: Date.now().toString(), name: newTemplateName.trim(), content: customFooter };
      const updated = [...footerTemplates, newT];
      setFooterTemplates(updated);
      localStorage.setItem('rednote_footer_templates', JSON.stringify(updated));
      setIsSavingTemplate(false);
      setNewTemplateName('');
      showToast("模板已保存");
  };

  const deleteTemplate = (id: string) => {
      const updated = footerTemplates.filter(t => t.id !== id);
      setFooterTemplates(updated);
      localStorage.setItem('rednote_footer_templates', JSON.stringify(updated));
  };

  // Toggle Custom Mode Logic
  const toggleCustomMode = () => {
      if (!isCustomMode) {
          // Turn ON: Initialize footer with what we detected (usually just tags)
          setCustomFooter(detectedFooter);
          setIsCustomMode(true);
      } else {
          // Turn OFF: Just switch mode
          setIsCustomMode(false);
      }
  };

  // Helper to construct full content based on current mode & inputs
  const updateFullContent = (newBody: string, footer: string) => {
      const footerPart = footer ? `\n\n${footer}` : '';
      const finalBody = `${newBody}${footerPart}`;
      onContentChange(`${title}\n${finalBody}`);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      const currentFullBody = safeContent.includes('\n') ? safeContent.substring(safeContent.indexOf('\n') + 1) : '';
      onContentChange(`${val}\n${currentFullBody}`);
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      if (isCustomMode) {
          updateFullContent(val, customFooter);
      } else {
          onContentChange(`${title}\n${val}`);
      }
  };
  
  const handleFooterChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setCustomFooter(val);
      if (isCustomMode) updateFullContent(displayBody, val);
  };

  const groupedItems = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const safeDrafts = drafts || [];
    const safePubs = publishedHistory || [];
    safeDrafts.forEach(draft => {
        const category = draft.personaName ? `📂 ${draft.personaName}` : '📁 未分类草稿';
        if (!groups[category]) groups[category] = [];
        groups[category].push({ ...draft, _type: 'draft' });
    });
    safePubs.forEach(pub => {
        const category = '🚀 已发布';
        if (!groups[category]) groups[category] = [];
        groups[category].push({ ...pub, _type: 'published' });
    });
    return groups;
  }, [drafts, publishedHistory]);

  const toggleCategory = (cat: string) => {
      setExpandedCategories(prev => {
          const next = new Set(prev);
          if (next.has(cat)) next.delete(cat);
          else next.add(cat);
          return next;
      });
  };

  useEffect(() => { setExpandedCategories(new Set(Object.keys(groupedItems))); }, [Object.keys(groupedItems).length]);

  const handlePublish = async () => {
      if (!title.trim()) return showToast("标题不能为空", 'error');
      if (!displayBody.trim()) return showToast("正文不能为空", 'error');
      
      let finalImages = images;
      if (images.length === 0) {
          finalImages = [currentPlaceholder];
          onImagesChange(finalImages);
      }
      setIsPublishing(true);
      try {
          const qrcode = await publishToXHS({ title, content: safeContent, imageUrls: finalImages });
          setViewingQrCode({ qrcode, title, cover: finalImages[0] });
          if (onSavePublished) {
              onSavePublished({
                  id: Date.now().toString(),
                  title,
                  coverImage: finalImages[0],
                  imageUrls: finalImages,
                  qrCodeUrl: qrcode,
                  publishedAt: Date.now()
              });
          }
      } catch (e: any) { showToast(`发布失败: ${e.message}`, 'error'); } 
      finally { setIsPublishing(false); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0 && onFileUpload) {
           setIsUploading(true);
           try {
               const files = Array.from(e.target.files);
               const newUrls = await onFileUpload(files);
               if (newUrls && newUrls.length > 0) {
                   onImagesChange([...images, ...newUrls]);
                   showToast("上传成功");
               }
           } catch (error) { showToast("上传失败，请重试", "error"); } 
           finally { setIsUploading(false); }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSelection = (id: string) => {
      setSelectedIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) newSet.delete(id);
          else newSet.add(id);
          return newSet;
      });
  };

  const handleBatchPublishAction = async () => { /* ... Batch logic unchanged ... */ };
  const handleBatchDelete = () => { /* ... Batch logic unchanged ... */ };
  const selectAll = () => { /* ... Select all logic unchanged ... */ };
  
  const handleItemClick = (item: any, type: 'draft' | 'published') => {
      if (isSelectionMode) { toggleSelection(item.id); return; }
      const itemTitle = item.title || '';
      const itemContent = 'content' in item ? item.content : itemTitle; 
      // If it's a draft and has no images, don't generate random ones. Keep it empty.
      const itemImages = type === 'draft' ? (item.images || []) : (item.imageUrls || []);
      onContentChange(itemContent);
      onImagesChange(itemImages);
      setActiveTab('preview');
      setIsCustomMode(false); // Reset mode on load
      showToast("已加载笔记内容");
  };

  const renderGridItem = (item: any, type: 'draft' | 'published') => {
      const isSelected = selectedIds.has(item.id);
      
      // Determine Cover Image
      // For Published: always use coverImage
      // For Draft: Prefer 'images' array (new), fallback to 'imageUrls' (legacy), else null
      let cover = null;
      if (type === 'published') {
          cover = item.coverImage;
      } else {
          if (item.images && item.images.length > 0) cover = item.images[0];
          else if (item.imageUrls && item.imageUrls.length > 0) cover = item.imageUrls[0];
      }
      
      return (
          <div key={item.id} className="bg-white rounded-lg overflow-hidden shadow-sm break-inside-avoid mb-2 group relative border border-slate-100 touch-manipulation transform transition-all duration-200 active:scale-95 cursor-pointer" onClick={() => handleItemClick(item, type)}>
              <div className="aspect-[3/4] relative bg-slate-50 flex items-center justify-center">
                  {cover ? (
                      <img src={cover} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                      <div className="flex flex-col items-center justify-center text-slate-300">
                          <Type size={24} />
                          <span className="text-[10px] font-bold mt-1">纯文本</span>
                      </div>
                  )}
                  {isSelectionMode ? (
                      <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-rose-500 border-rose-500' : 'bg-black/20 border-white'}`}>
                          {isSelected && <Check size={12} className="text-white" />}
                      </div>
                  ) : (
                      <button onClick={(e) => { e.stopPropagation(); if (type === 'draft') onDeleteDraft?.(item.id); else onDeletePublished?.(item.id); }} className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm z-10 active:scale-75"><Trash2 size={12} /></button>
                  )}
                  {type === 'published' && item.qrCodeUrl && !isSelectionMode && (
                      <div onClick={(e) => { e.stopPropagation(); setViewingQrCode({ qrcode: item.qrCodeUrl, title: item.title, cover: item.coverImage }); }} className="absolute bottom-2 right-2 bg-white/90 p-1.5 rounded-full shadow-sm hover:bg-white hover:scale-110 transition-all z-10 text-slate-800 hover:text-rose-500"><QrCode size={14} /></div>
                  )}
              </div>
              <div className="p-2">
                  <div className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug mb-1.5 min-h-[2.25em]">{item.title || '无标题'}</div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-slate-200"/><span>{user?.username || '我'}</span></div>
                      <span>{type === 'draft' ? <span className="text-amber-500 bg-amber-50 px-1 rounded">草稿</span> : <Heart size={10} className="text-slate-300"/>}</span>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <>
    {viewingQrCode && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in" onClick={() => setViewingQrCode(null)}>
            <div className="w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden relative transform transition-all scale-100" onClick={e => e.stopPropagation()}>
                <div className="h-32 bg-gradient-to-br from-rose-500 to-orange-400 relative p-6 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white"><Check size={20} strokeWidth={3} /></div>
                        <button onClick={() => setViewingQrCode(null)} className="text-white/70 hover:text-white transition-colors bg-black/10 rounded-full p-1"><X size={20}/></button>
                    </div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">发布准备就绪</h2>
                </div>
                <div className="px-6 pb-8 -mt-6">
                    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5 flex flex-col items-center">
                        <div className="w-full aspect-[4/3] rounded-xl overflow-hidden mb-4 relative bg-slate-100">
                             <img src={viewingQrCode.cover} className="w-full h-full object-cover" />
                             <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-3"><p className="text-white text-xs font-bold line-clamp-1">{viewingQrCode.title}</p></div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 mb-4"><QRCodeDisplay value={viewingQrCode.qrcode} size={180} /></div>
                        <p className="text-xs text-slate-500 text-center font-medium leading-relaxed">请使用 <span className="text-rose-500 font-bold">小红书 App</span> 扫码<br/>确认预览效果并完成发布</p>
                    </div>
                    <button onClick={() => setViewingQrCode(null)} className="mt-6 w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-xl active:scale-95 transition-transform hover:bg-black">我知道了</button>
                </div>
            </div>
        </div>
    )}

    <div className="w-full h-full flex flex-col bg-slate-50 relative overflow-hidden lg:rounded-[3rem] lg:border-[8px] lg:border-slate-900 lg:shadow-2xl lg:max-w-[375px] lg:max-h-[812px]">
        {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({...toast, show: false})} />}
        {croppingImg && <InteractiveCropper imgUrl={croppingImg.url} onCancel={() => setCroppingImg(null)} onSave={(newUrl) => { const newImages = [...images]; newImages[croppingImg.index] = newUrl; onImagesChange(newImages); setCroppingImg(null); }} />}

        <div className="h-12 bg-white flex justify-between items-end px-6 pb-2 shrink-0 z-10 select-none">
            <div className="text-sm font-bold text-slate-900">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="flex gap-1.5 text-slate-900"><Signal size={14} fill="currentColor"/><Wifi size={14} /><Battery size={14} fill="currentColor"/></div>
        </div>

        <div className="flex px-1 pt-2 bg-white border-b border-slate-100 shrink-0 z-20 overflow-x-auto no-scrollbar">
             <button onClick={() => { setActiveTab('preview'); setIsSelectionMode(false); }} className={`flex-1 pb-3 text-[11px] font-bold transition-all whitespace-nowrap px-3 active:scale-95 ${activeTab === 'preview' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400'}`}>预览编辑</button>
             <button onClick={() => { setActiveTab('all'); setIsSelectionMode(false); }} className={`flex-1 pb-3 text-[11px] font-bold transition-all whitespace-nowrap px-3 active:scale-95 ${activeTab === 'all' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400'}`}>全部</button>
             <button onClick={() => { setActiveTab('drafts'); setIsSelectionMode(false); }} className={`flex-1 pb-3 text-[11px] font-bold transition-all whitespace-nowrap px-3 active:scale-95 ${activeTab === 'drafts' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400'}`}>草稿</button>
             <button onClick={() => { setActiveTab('published'); setIsSelectionMode(false); }} className={`flex-1 pb-3 text-[11px] font-bold transition-all whitespace-nowrap px-3 active:scale-95 ${activeTab === 'published' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400'}`}>已发布</button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar bg-[#F8F8F8] relative">
            {activeTab === 'preview' && (
                <div className="min-h-full pb-32">
                    <div className="aspect-[3/4] bg-white relative group overflow-hidden flex items-center justify-center bg-slate-100">
                        {images.length > 0 ? (
                            <>
                                <div ref={carouselRef} className={`w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar ${isDragScroll ? 'cursor-grabbing' : 'cursor-grab'}`} onMouseDown={handleDragStart} onMouseMove={handleDragMove} onMouseUp={handleDragEnd} onMouseLeave={handleDragEnd} onTouchStart={handleDragStart} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd}>
                                    {images.map((img, idx) => (
                                        <div key={idx} className="w-full h-full shrink-0 snap-center relative flex items-center justify-center bg-slate-100 group/img select-none">
                                            <img src={img} className="w-full h-full object-cover pointer-events-none select-none" draggable={false} /> 
                                            <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-100 lg:opacity-0 lg:group-hover/img:opacity-100 transition-opacity z-20 pointer-events-auto">
                                                 <button onClick={(e) => { e.stopPropagation(); setCroppingImg({url: img, index: idx}); }} className="p-2 bg-black/50 text-white rounded-full backdrop-blur-sm hover:bg-black/70 active:scale-90 transition-transform"><Crop size={14}/></button>
                                                 <button onClick={(e) => { e.stopPropagation(); onImagesChange(images.filter((_, i) => i !== idx)); }} className="p-2 bg-red-500/80 text-white rounded-full backdrop-blur-sm hover:bg-red-600 active:scale-90 transition-transform"><Trash2 size={14}/></button>
                                            </div>
                                            <div className="absolute bottom-3 left-3 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm font-bold pointer-events-none">{idx + 1}/{images.length}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
                                     <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-white text-slate-900 rounded-full shadow-lg pointer-events-auto hover:scale-105 active:scale-95 transition-transform"><Plus size={20}/></button>
                                </div>
                            </>
                        ) : (
                            <div className="w-full h-full relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                <img src={currentPlaceholder} className="w-full h-full object-cover opacity-80 pointer-events-none" />
                                <div className="absolute inset-0 bg-black/10 flex flex-col items-center justify-center text-white backdrop-blur-[2px] transition-all group-hover:backdrop-blur-none group-hover:bg-black/20">
                                    <div className="bg-black/30 p-3 rounded-full mb-2 backdrop-blur-md"><Plus size={24} className="text-white" /></div>
                                    <span className="text-xs font-bold drop-shadow-md opacity-80">点击上传封面</span>
                                </div>
                            </div>
                        )}
                        {isUploading && <div className="absolute inset-0 z-30 bg-black/60 flex flex-col items-center justify-center text-white backdrop-blur-sm animate-fade-in"><Loader2 size={32} className="animate-spin mb-2 text-rose-500" /><span className="text-xs font-bold">图片正在上传中...</span></div>}
                        <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                    </div>

                    <div className="p-5 bg-white min-h-[400px] flex flex-col">
                        <div className="relative mb-3 shrink-0">
                            <input value={title} onChange={handleTitleChange} className="w-full text-lg font-bold text-slate-900 border-none outline-none placeholder:text-slate-300 bg-transparent pr-12" placeholder="填写标题..." />
                            <div className={`absolute top-1/2 -translate-y-1/2 right-0 text-[10px] font-bold ${isTitleOver ? 'text-red-500' : 'text-slate-300'}`}>{titleLen}/20</div>
                        </div>
                        
                        <div className="relative flex-1">
                            <textarea 
                                value={displayBody} 
                                onChange={handleBodyChange}
                                className="w-full min-h-[320px] text-sm text-slate-700 leading-relaxed border-none outline-none resize-none placeholder:text-slate-300 bg-transparent pb-8"
                                placeholder="添加正文..."
                            />
                            
                            {/* Normal Mode Tag Display */}
                            {!isCustomMode && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {(safeContent.match(/#[^\s#]+/g) || []).map((tag, i) => (
                                        <span key={i} className="text-blue-600 text-xs font-medium">{tag.replace(/\[话题\]|#话题/g, '')}</span>
                                    ))}
                                </div>
                            )}

                            {/* Unified Custom Footer & Tags UI */}
                            <div className="mt-6 pt-4 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 cursor-pointer" onClick={toggleCustomMode}>
                                        {isCustomMode ? <CheckSquare size={16} className="text-rose-500"/> : <Square size={16} className="text-slate-300"/>}
                                        <span className="text-xs font-bold text-slate-500 select-none">自定义结尾 & 话题</span>
                                    </div>
                                    {isCustomMode && (
                                        <div className="flex gap-2">
                                            <button onClick={() => setIsSavingTemplate(true)} className="text-[10px] text-slate-400 hover:text-rose-500 flex items-center gap-1"><Save size={12}/> 存模板</button>
                                            <div className="relative group/tpl">
                                                <button className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1"><LayoutTemplate size={12}/> 载入</button>
                                                <div className="absolute bottom-full right-0 mb-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 hidden group-hover/tpl:block p-1">
                                                    {footerTemplates.length === 0 && <div className="text-[10px] text-slate-300 text-center py-2">无模板</div>}
                                                    {footerTemplates.map(t => (
                                                        <div key={t.id} className="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded cursor-pointer group/item" onClick={() => setCustomFooter(t.content)}>
                                                            <span className="text-[10px] text-slate-600 truncate max-w-[80px]">{t.name}</span>
                                                            <button onClick={(e) => {e.stopPropagation(); deleteTemplate(t.id);}} className="text-slate-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100"><X size={10}/></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {isCustomMode && (
                                    <div className="space-y-3 animate-fade-in bg-slate-50 p-3 rounded-xl border border-slate-100 relative">
                                        {isSavingTemplate ? (
                                            <div className="flex gap-2 items-center">
                                                <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} placeholder="输入模板名称..." className="flex-1 text-xs p-2 rounded border border-slate-200" autoFocus />
                                                <button onClick={saveTemplate} className="text-xs font-bold text-white bg-rose-500 px-3 py-2 rounded">保存</button>
                                                <button onClick={() => setIsSavingTemplate(false)} className="text-xs text-slate-500 px-2">取消</button>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 mb-1 block flex items-center gap-1"><Hash size={10}/> 自定义结尾 (含话题)</label>
                                                <textarea 
                                                    value={customFooter} 
                                                    onChange={handleFooterChange}
                                                    placeholder="在这里粘贴你的固定结尾，例如：\n\n关注我看更多干货！\n#OOTD #每日穿搭 #小红书爆款" 
                                                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-rose-300 min-h-[80px] resize-none"
                                                />
                                                {/* Auto-detected tags feedback */}
                                                {detectedTagsInFooter.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {detectedTagsInFooter.map((tag, i) => (
                                                            <span key={i} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">{tag}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {(activeTab === 'drafts' || activeTab === 'published' || activeTab === 'all') && (
                <div className="pb-20">
                     {activeTab === 'all' ? (
                        <div>
                             {Object.entries(groupedItems).map(([category, items]: [string, any[]]) => (
                                <div key={category} className="mb-2">
                                    <div onClick={() => toggleCategory(category)} className="sticky top-0 z-10 bg-[#F8F8F8]/95 backdrop-blur-sm px-4 py-3 flex justify-between items-center cursor-pointer border-b border-slate-100">
                                        <div className="font-bold text-xs text-slate-600 flex items-center gap-2">{expandedCategories.has(category) ? <FolderOpen size={14} className="text-rose-500"/> : <Folder size={14} className="text-slate-400"/>} {category} <span className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-md text-[9px]">{items.length}</span></div>
                                        <ChevronRight size={14} className={`text-slate-400 transition-transform ${expandedCategories.has(category) ? 'rotate-90' : ''}`} />
                                    </div>
                                    {expandedCategories.has(category) && <div className="p-2 columns-2 gap-2 space-y-2 animate-fade-in">{items.map(item => renderGridItem(item, item._type))}</div>}
                                </div>
                            ))}
                            {Object.keys(groupedItems).length === 0 && <div className="text-center py-20 text-slate-400 text-xs">暂无任何记录</div>}
                        </div>
                     ) : (
                        <div className="p-2 columns-2 gap-2 space-y-2">
                            {((activeTab === 'drafts' ? drafts : publishedHistory) || []).map(item => renderGridItem(item, activeTab === 'drafts' ? 'draft' : 'published'))}
                            {((activeTab === 'drafts' ? drafts : publishedHistory) || []).length === 0 && <div className="text-center py-20 text-slate-400 text-xs w-full col-span-2">暂无数据</div>}
                        </div>
                     )}
                </div>
            )}
        </div>

        {activeTab === 'preview' && (
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-3 px-5 flex items-center justify-between z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                 <div className="flex items-center gap-4 text-slate-400">
                     <div className={`text-[10px] font-bold px-2 py-1 rounded-full ${bodyLen > 1000 ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}`}>{bodyLen} / {targetWordCount}</div>
                 </div>
                 <div className="flex items-center gap-2">
                     <button onClick={() => onSaveToLibrary(title || '未命名', safeContent, 'note')} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-xs font-bold active:scale-95 transition-transform hover:bg-slate-200">存草稿</button>
                     <button onClick={handlePublish} disabled={isPublishing} className="px-6 py-2 bg-rose-500 text-white rounded-full text-xs font-bold shadow-lg shadow-rose-200 active:scale-95 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-transform hover:bg-rose-600">{isPublishing ? <Loader2 size={14} className="animate-spin"/> : <ArrowRight size={14}/>} 发布</button>
                 </div>
            </div>
        )}

        {activeTab !== 'preview' && (
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-3 px-4 z-20 shadow-lg flex items-center gap-3">
                {isSelectionMode ? (
                    <>
                        <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="px-3 py-2 text-slate-500 text-xs font-bold bg-slate-100 rounded-lg whitespace-nowrap active:scale-95 transition-transform">取消</button>
                        <button onClick={selectAll} className="px-3 py-2 text-blue-600 text-xs font-bold bg-blue-50 hover:bg-blue-100 rounded-lg whitespace-nowrap active:scale-95 transition-transform">全选</button>
                        <div className="flex-1 flex gap-2 justify-end overflow-x-auto no-scrollbar">
                            <button onClick={handleBatchDelete} disabled={selectedIds.size === 0} className="px-3 py-2 bg-red-50 text-red-500 rounded-lg text-xs font-bold active:scale-95 disabled:opacity-50 whitespace-nowrap transition-transform hover:bg-red-100">删除</button>
                            <button onClick={handleBatchPublishAction} disabled={selectedIds.size === 0} className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold active:scale-95 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap transition-transform hover:bg-black"><LinkIcon size={14}/> 生成链接</button>
                        </div>
                    </>
                ) : (
                    <button onClick={() => setIsSelectionMode(true)} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors active:scale-95">批量管理</button>
                )}
            </div>
        )}
    </div>
    </>
  );
};

export default MobilePreview;
