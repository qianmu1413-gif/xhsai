
import React, { useState, useRef, useEffect } from 'react';
import { Battery, Signal, Wifi, ChevronLeft, Image as ImageIcon, X, ChevronRight, Check, Plus, Trash2, Save, LayoutTemplate, Archive, Loader2, QrCode, CheckCircle, Download, Share2, Heart, MessageCircle, Star, MoreHorizontal, MapPin, Settings2, GripHorizontal, ArrowLeft, Crop, Maximize2, AlertCircle, Move, ZoomIn, ArrowRight, CheckSquare, Square, Link as LinkIcon } from 'lucide-react';
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

// Helper to get a deterministic random image based on string hash
const getRandomImage = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
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
  images: string[];
  onImagesChange: (images: string[]) => void;
  publishedHistory?: PublishedRecord[]; 
  onSavePublished?: (record: PublishedRecord) => void; 
  onDeletePublished?: (id: string) => void; 
  onDeletePublishedBatch?: (ids: string[]) => void; 
  onFileUpload?: (files: File[]) => Promise<string[]>; 
  user?: User; 
  // Batch Publish Callback
  onPublishBatch?: (items: { title: string, content: string, images: string[] }[]) => Promise<void>;
}

// --- HELPER: Calculate Character Length (Chinese=1, ASCII=0.5) ---
const getLength = (str: string) => {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Standard ASCII range (0-127) counts as 0.5
    if (code >= 0 && code <= 127) {
      len += 0.5;
    } else {
      len += 1;
    }
  }
  return Math.ceil(len);
};

// --- INTERACTIVE CROPPER COMPONENT ---
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

const MobilePreview: React.FC<MobilePreviewProps> = ({
  content, onContentChange, onCopy, targetWordCount = 400, onSaveToLibrary,
  drafts = [], onSelectDraft, onDeleteDraft,
  images, onImagesChange,
  publishedHistory = [], onSavePublished, onDeletePublished, onDeletePublishedBatch,
  onFileUpload, user, onPublishBatch
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'drafts' | 'published'>('preview');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ qrcode: string; title: string; cover: string }[] | null>(null);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const [croppingImg, setCroppingImg] = useState<{ url: string, index: number } | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Safe Extraction Logic
  const title = content.split('\n')[0] || '';
  const body = content.includes('\n') ? content.substring(content.indexOf('\n') + 1) : '';

  const titleLen = getLength(title);
  const bodyLen = getLength(body);
  const isTitleOver = titleLen > 20;
  const isBodyOver = bodyLen > 1000;
  
  // Random placeholder for current edit session if no images
  const currentPlaceholder = React.useMemo(() => getRandomImage(title || 'default'), [title]);

  const showToast = (msg: string, type: 'success'|'error'|'info' = 'success') => setToast({ show: true, message: msg, type });

  const handlePublish = async () => {
      if (!title.trim()) return showToast("标题不能为空", 'error');
      if (!body.trim()) return showToast("正文不能为空", 'error');
      
      // Auto-assign random image if none
      let finalImages = images;
      if (images.length === 0) {
          finalImages = [currentPlaceholder];
          onImagesChange(finalImages);
      }
      
      setIsPublishing(true);
      try {
          const qrcode = await publishToXHS({ title, content, imageUrls: finalImages });
          setPublishResult([{ qrcode, title, cover: finalImages[0] }]);
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
      } catch (e: any) {
          showToast(`发布失败: ${e.message}`, 'error');
      } finally {
          setIsPublishing(false);
      }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0 && onFileUpload) {
           const files = Array.from(e.target.files);
           const newUrls = await onFileUpload(files);
           if (newUrls && newUrls.length > 0) {
               onImagesChange([...images, ...newUrls]);
           }
      }
      // Reset input
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

  const handleBatchPublishAction = async () => {
      if (selectedIds.size === 0) return;
      if (!onPublishBatch) return;

      const itemsToPublish: any[] = [];
      const currentList = activeTab === 'drafts' ? drafts : publishedHistory;
      
      selectedIds.forEach(id => {
          const item = currentList?.find((i: any) => i.id === id);
          if (item) {
              const itemTitle = item.title;
              // Published history might not store full content in type, assume title for now or fetch
              const itemImages = 'imageUrls' in item ? item.imageUrls : [getRandomImage(itemTitle)];
              
              itemsToPublish.push({
                  title: itemTitle,
                  content: 'content' in item ? item.content : itemTitle, // Fallback
                  images: itemImages
              });
          }
      });

      if (itemsToPublish.length > 0) {
         showToast("开始批量生成链接...", "info");
         
         if (itemsToPublish.length === 1) {
             // Load into editor and publish
             onSelectDraft && activeTab === 'drafts' && onSelectDraft(currentList?.find((d:any) => d.id === Array.from(selectedIds)[0]) as any);
             showToast("已加载选中笔记，请点击底部发布按钮");
             setActiveTab('preview');
         } else {
             // Batch not fully implemented on backend, placeholder
             showToast(`批量生成 ${itemsToPublish.length} 条链接功能开发中`, 'info');
         }
      }
      setIsSelectionMode(false);
      setSelectedIds(new Set());
  };
  
  const handleBatchDelete = () => {
      if (selectedIds.size === 0) return;
      
      if (activeTab === 'published' && onDeletePublishedBatch) {
          onDeletePublishedBatch(Array.from(selectedIds));
      } else if (activeTab === 'drafts' && onDeleteDraft) {
          // Batch draft delete
          selectedIds.forEach(id => onDeleteDraft(id));
      }
      showToast("已批量删除");
      setIsSelectionMode(false);
      setSelectedIds(new Set());
  };

  const selectAll = () => {
      const list = activeTab === 'drafts' ? drafts : publishedHistory;
      if (list) {
          setSelectedIds(new Set(list.map((i:any) => i.id)));
      }
  };

  // Render Grid Item (Common for Drafts and Published)
  const renderGridItem = (item: any, type: 'draft' | 'published') => {
      const isSelected = selectedIds.has(item.id);
      const cover = type === 'published' ? item.coverImage : getRandomImage(item.title || 'draft');
      
      return (
          <div 
            key={item.id} 
            className="bg-white rounded-lg overflow-hidden shadow-sm break-inside-avoid mb-2 group relative border border-slate-100 touch-manipulation"
            onClick={() => {
                if (isSelectionMode) {
                    toggleSelection(item.id);
                } else {
                    if (type === 'draft' && onSelectDraft) {
                        onSelectDraft(item);
                        setActiveTab('preview');
                    }
                }
            }}
          >
              <div className="aspect-[3/4] relative bg-slate-100">
                  <img src={cover} className="w-full h-full object-cover" />
                  {isSelectionMode && (
                      <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-rose-500 border-rose-500' : 'bg-black/20 border-white'}`}>
                          {isSelected && <Check size={12} className="text-white" />}
                      </div>
                  )}
                  {/* Delete Button (Hover) - Only when NOT in selection mode */}
                  {!isSelectionMode && (
                      <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if (type === 'draft' && onDeleteDraft) onDeleteDraft(item.id);
                            if (type === 'published' && onDeletePublished) onDeletePublished(item.id);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm z-10"
                      >
                          <Trash2 size={12} />
                      </button>
                  )}
                  {type === 'published' && item.qrCodeUrl && !isSelectionMode && (
                      <div className="absolute bottom-2 right-2 bg-white/90 p-1 rounded-md shadow-sm">
                          <QrCode size={12} className="text-slate-800"/>
                      </div>
                  )}
              </div>
              <div className="p-2">
                  <div className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug mb-1.5 min-h-[2.25em]">
                      {item.title || '无标题'}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-1">
                          {user?.avatar ? <img src={user.avatar} className="w-3 h-3 rounded-full"/> : <div className="w-3 h-3 rounded-full bg-slate-200"/>}
                          <span className="truncate max-w-[60px]">{user?.username || '我'}</span>
                      </div>
                      <span className="flex items-center gap-0.5">
                          {type === 'draft' ? <span className="text-amber-500">草稿</span> : <Heart size={10} className="text-slate-300"/>}
                      </span>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <>
    {/* Global Full-Screen Publish Modal */}
    {publishResult && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in">
            <button onClick={() => setPublishResult(null)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors p-2"><X size={32}/></button>
            
            <div className="flex flex-col items-center max-w-md w-full">
                <div className="flex items-center gap-2 mb-8">
                    <div className="bg-emerald-500 text-white p-2 rounded-full shadow-lg shadow-emerald-500/30">
                        <Check size={24} strokeWidth={3} />
                    </div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">发布任务已提交</h2>
                </div>

                {publishResult.map((res, idx) => (
                    <div key={idx} className="bg-white rounded-3xl p-6 w-full shadow-2xl overflow-hidden relative mb-4 last:mb-0">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-rose-500 to-orange-500"></div>
                        
                        <div className="flex gap-5 mb-6">
                            <div className="w-24 h-32 rounded-xl bg-slate-100 shrink-0 overflow-hidden shadow-md border border-slate-100">
                                <img src={res.cover} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <h3 className="font-bold text-lg text-slate-900 line-clamp-2 leading-snug mb-2">{res.title}</h3>
                                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    准备就绪
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 pt-6 flex flex-col items-center">
                            <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm mb-3">
                                <QRCodeDisplay value={res.qrcode} size={160} />
                            </div>
                            <p className="text-xs text-slate-400 text-center font-medium">请使用小红书 App 扫码<br/>确认最终效果并发布</p>
                        </div>
                    </div>
                ))}

                <button onClick={() => setPublishResult(null)} className="mt-8 px-10 py-3.5 bg-white text-slate-900 rounded-full font-bold shadow-xl active:scale-95 hover:bg-slate-50 transition-all w-full max-w-[200px]">
                    完成
                </button>
            </div>
        </div>
    )}

    <div className="w-full h-full flex flex-col bg-slate-50 relative overflow-hidden lg:rounded-[3rem] lg:border-[8px] lg:border-slate-900 lg:shadow-2xl lg:max-w-[375px] lg:max-h-[812px]">
        {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({...toast, show: false})} />}
        
        {/* Cropper Overlay */}
        {croppingImg && (
            <InteractiveCropper 
                imgUrl={croppingImg.url} 
                onCancel={() => setCroppingImg(null)}
                onSave={(newUrl) => {
                    const newImages = [...images];
                    newImages[croppingImg.index] = newUrl;
                    onImagesChange(newImages);
                    setCroppingImg(null);
                }}
            />
        )}

        {/* Status Bar (Fake) */}
        <div className="h-12 bg-white flex justify-between items-end px-6 pb-2 shrink-0 z-10 select-none">
            <div className="text-sm font-bold text-slate-900">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="flex gap-1.5 text-slate-900">
                <Signal size={14} fill="currentColor"/>
                <Wifi size={14} />
                <Battery size={14} fill="currentColor"/>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex px-2 pt-2 bg-white border-b border-slate-100 shrink-0 z-20">
             <button onClick={() => { setActiveTab('preview'); setIsSelectionMode(false); }} className={`flex-1 pb-3 text-xs font-bold transition-all ${activeTab === 'preview' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400'}`}>预览编辑</button>
             <button onClick={() => { setActiveTab('drafts'); setIsSelectionMode(false); }} className={`flex-1 pb-3 text-xs font-bold transition-all ${activeTab === 'drafts' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400'}`}>草稿 ({drafts?.length || 0})</button>
             <button onClick={() => { setActiveTab('published'); setIsSelectionMode(false); }} className={`flex-1 pb-3 text-xs font-bold transition-all ${activeTab === 'published' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400'}`}>已发布</button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar bg-[#F8F8F8] relative">
            {activeTab === 'preview' && (
                <div className="min-h-full">
                    {/* Image Carousel (Updated) */}
                    <div className="aspect-[3/4] bg-white relative group overflow-hidden flex items-center justify-center">
                        {images.length > 0 ? (
                            <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar">
                                {images.map((img, idx) => (
                                    <div key={idx} className="w-full h-full shrink-0 snap-center relative flex items-center justify-center bg-white group/img">
                                        <img src={img} className="max-w-full max-h-full object-contain pointer-events-none" /> {/* Disable direct click */}
                                        <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover/img:opacity-100 transition-opacity z-20 pointer-events-auto">
                                             <button onClick={(e) => { e.stopPropagation(); setCroppingImg({url: img, index: idx}); }} className="p-2 bg-black/50 text-white rounded-full backdrop-blur-sm hover:bg-black/70"><Crop size={14}/></button>
                                             <button onClick={(e) => { e.stopPropagation(); onImagesChange(images.filter((_, i) => i !== idx)); }} className="p-2 bg-red-500/80 text-white rounded-full backdrop-blur-sm hover:bg-red-600"><Trash2 size={14}/></button>
                                        </div>
                                        <div className="absolute bottom-3 right-3 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm font-bold">{idx + 1}/{images.length}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="w-full h-full relative group">
                                <img src={currentPlaceholder} className="w-full h-full object-cover opacity-80" />
                                <div className="absolute inset-0 bg-black/10 flex flex-col items-center justify-center text-white backdrop-blur-[2px] transition-all group-hover:backdrop-blur-none group-hover:bg-black/20">
                                    <span className="text-xs font-bold drop-shadow-md opacity-50">暂无封面</span>
                                </div>
                            </div>
                        )}
                        
                        <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                        
                        {/* Hover Overlay for Upload - Only clickable/visible on hover */}
                        <div 
                             className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer pointer-events-none group-hover:pointer-events-auto bg-black/5"
                             onClick={() => fileInputRef.current?.click()}
                        >
                             <div className="bg-white/90 text-slate-900 px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-transform">
                                  {images.length > 0 ? <ImageIcon size={16}/> : <Plus size={16}/>} 
                                  {images.length > 0 ? "添加/更换图片" : "点击上传封面"}
                             </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="p-5 bg-white min-h-[300px] flex flex-col">
                        <div className="relative mb-3 shrink-0">
                            <input 
                                value={title} 
                                onChange={e => onContentChange(`${e.target.value}\n${body}`)}
                                className="w-full text-lg font-bold text-slate-900 border-none outline-none placeholder:text-slate-300 bg-transparent pr-12"
                                placeholder="填写标题..."
                            />
                            <div className={`absolute top-1/2 -translate-y-1/2 right-0 text-[10px] font-bold ${isTitleOver ? 'text-red-500' : 'text-slate-300'}`}>
                                {titleLen}/20
                            </div>
                        </div>
                        
                        <div className="relative flex-1 min-h-[400px]">
                            <textarea 
                                value={body} 
                                onChange={e => onContentChange(`${title}\n${e.target.value}`)}
                                className="w-full h-full text-sm text-slate-700 leading-relaxed border-none outline-none resize-none placeholder:text-slate-300 bg-transparent pb-8"
                                placeholder="添加正文..."
                            />
                            <div className={`absolute bottom-0 right-0 text-[10px] font-bold ${isBodyOver ? 'text-red-500' : 'text-slate-300'}`}>
                                {bodyLen}/1000
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-4 shrink-0">
                            {(content.match(/#[^\s#]+/g) || []).map((tag, i) => (
                                // Strip suffix and color blue
                                <span key={i} className="text-blue-600 text-xs font-medium">{tag.replace(/\[话题\]|#话题/g, '')}</span>
                            ))}
                        </div>
                        
                        <div className="h-20 shrink-0"></div> 
                    </div>
                </div>
            )}

            {/* Merged View for Drafts & Published with Selection Mode */}
            {(activeTab === 'drafts' || activeTab === 'published') && (
                <div className="p-2 pb-20">
                    {/* Items Grid */}
                    {((activeTab === 'drafts' ? drafts : publishedHistory) || []).length > 0 ? (
                        <div className="columns-2 gap-2 space-y-2">
                            {(activeTab === 'drafts' ? drafts : publishedHistory)?.map(item => renderGridItem(item, activeTab === 'drafts' ? 'draft' : 'published'))}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-slate-400 text-xs">暂无{activeTab === 'drafts' ? '草稿' : '发布记录'}</div>
                    )}
                </div>
            )}
        </div>

        {/* Bottom Action Bar (Preview Mode) */}
        {activeTab === 'preview' && (
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-3 px-5 flex items-center justify-between z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                 <div className="flex items-center gap-4 text-slate-400">
                     <div className={`text-[10px] font-bold px-2 py-1 rounded-full ${isBodyOver || isTitleOver ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}`}>
                         {Math.max(bodyLen, titleLen)} / {targetWordCount}
                     </div>
                 </div>
                 <div className="flex items-center gap-2">
                     <button onClick={() => onSaveToLibrary(content.split('\n')[0] || '未命名', content, 'note')} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-xs font-bold active:scale-95">存草稿</button>
                     <button onClick={handlePublish} disabled={isPublishing} className="px-6 py-2 bg-rose-500 text-white rounded-full text-xs font-bold shadow-lg shadow-rose-200 active:scale-95 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                         {isPublishing ? <Loader2 size={14} className="animate-spin"/> : <ArrowRight size={14}/>} 发布
                     </button>
                 </div>
            </div>
        )}

        {/* Batch Actions Bar (For Drafts & Published) */}
        {(activeTab === 'published' || activeTab === 'drafts') && (
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-3 px-4 z-20 shadow-lg flex items-center gap-3">
                {isSelectionMode ? (
                    <>
                        <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="px-3 py-2 text-slate-500 text-xs font-bold bg-slate-100 rounded-lg whitespace-nowrap">取消</button>
                        <button onClick={selectAll} className="px-3 py-2 text-blue-600 text-xs font-bold bg-blue-50 hover:bg-blue-100 rounded-lg whitespace-nowrap">全选</button>
                        <div className="flex-1 flex gap-2 justify-end overflow-x-auto no-scrollbar">
                            <button onClick={handleBatchDelete} disabled={selectedIds.size === 0} className="px-3 py-2 bg-red-50 text-red-500 rounded-lg text-xs font-bold active:scale-95 disabled:opacity-50 whitespace-nowrap">删除</button>
                            <button onClick={handleBatchPublishAction} disabled={selectedIds.size === 0} className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold active:scale-95 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap">
                                <LinkIcon size={14}/> 生成链接
                            </button>
                        </div>
                    </>
                ) : (
                    <button onClick={() => setIsSelectionMode(true)} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors">
                        批量管理
                    </button>
                )}
            </div>
        )}
    </div>
    </>
  );
};

const QRCodeDisplay = ({ value, size }: { value: string, size: number }) => {
    return (
        <div style={{ width: size, height: size, background: '#f0f0f0' }} className="flex items-center justify-center">
             <img src={value} className="w-full h-full object-contain" alt="QR Code" />
        </div>
    );
};

export default MobilePreview;
