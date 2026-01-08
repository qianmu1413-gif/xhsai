
// ... (imports remain the same)
import React, { useState, useRef, useMemo, memo, useEffect } from 'react';
import { Signal, Wifi, Battery, ChevronLeft, Share2, Plus, Heart, Star, MessageCircle, Edit3, Camera, Loader2, Send, Save, QrCode, CheckCircle2, Download, Trash2, X, FilePlus, ImageIcon, AlertCircle, FolderPlus, Folder, Filter, MoreVertical, Pencil, Check, DownloadCloud, Image as ImageIconLucide, MoreHorizontal, Layers, RotateCcw, MapPin, Lock, Type, Search, CheckSquare } from 'lucide-react';
import { NoteDraft, PublishedRecord, User } from '../types';
import { publishToXHS } from '../services/publishService';
import Toast, { ToastState } from './Toast';

const DEFAULT_NOTE_IMAGE = "https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?q=80&w=1000&auto=format&fit=crop";

// ... (keep getCharacterCount, loadImage, generateShareCard)
// 字符长度计算 (字母 = 1个字)
const getCharacterCount = (str: string) => {
  return str ? str.length : 0;
};

// --- 图片合成核心引擎 (升级版 3:4 比例) ---
const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous'; 
        img.onload = () => resolve(img);
        img.onerror = () => {
            fetch(url)
                .then(res => res.blob())
                .then(blob => {
                    const objUrl = URL.createObjectURL(blob);
                    const fallbackImg = new Image();
                    fallbackImg.onload = () => resolve(fallbackImg);
                    fallbackImg.onerror = reject;
                    fallbackImg.src = objUrl;
                })
                .catch(reject);
        };
        img.src = url;
    });
};

const generateShareCard = async (record: PublishedRecord, username: string = '创作者'): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas init failed');

    // 设定 3:4 比例 (900x1200) 高清
    const width = 900;
    const height = 1200; 
    const padding = 56; // 边距

    // 1. 加载资源
    const coverUrl = record.coverImage || record.imageUrls?.[0] || DEFAULT_NOTE_IMAGE;
    let coverImg, qrImg;
    
    try {
        [coverImg, qrImg] = await Promise.all([
            loadImage(coverUrl),
            loadImage(record.qrCodeUrl)
        ]);
    } catch (e) {
        throw new Error("图片资源加载失败，请检查网络");
    }

    canvas.width = width;
    canvas.height = height;

    // 2. 绘制背景 (纯白底色)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // 3. 绘制封面图 (占据顶部约 70% 区域)
    const imageAreaHeight = 840; // 70% height
    
    // 图片裁剪逻辑 (Cover 模式)
    const imgRatio = coverImg.width / coverImg.height;
    const targetRatio = width / imageAreaHeight;
    let renderW, renderH, offsetX, offsetY;

    if (imgRatio > targetRatio) {
        renderH = imageAreaHeight;
        renderW = imageAreaHeight * imgRatio;
        offsetX = (width - renderW) / 2;
        offsetY = 0;
    } else {
        renderW = width;
        renderH = width / imgRatio;
        offsetX = 0;
        offsetY = (imageAreaHeight - renderH) / 2;
    }
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, imageAreaHeight);
    ctx.clip();
    ctx.drawImage(coverImg, offsetX, offsetY, renderW, renderH);
    ctx.restore();

    // 4. 绘制底部内容区域
    const contentY = imageAreaHeight + 50;
    
    // 二维码 (右下角)
    const qrSize = 180;
    const qrX = width - padding - qrSize;
    const qrY = height - padding - qrSize - 10;
    
    // 绘制标题 (左侧，最大宽度需避开二维码)
    ctx.fillStyle = '#111827'; // Gray 900
    ctx.font = 'bold 48px "PingFang SC", "Microsoft YaHei", sans-serif';
    const text = record.title || '无标题';
    const titleMaxWidth = width - (padding * 2) - qrSize - 40; 
    
    const words = text.split('');
    let line = '';
    let lineCount = 0;
    let titleY = contentY + 10;
    const lineHeight = 70;

    // 标题换行逻辑 (最多2行)
    for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n];
        if (ctx.measureText(testLine).width > titleMaxWidth && n > 0) {
            ctx.fillText(line, padding, titleY);
            line = words[n];
            titleY += lineHeight;
            lineCount++;
            if (lineCount >= 2) {
                 const remaining = text.substring(n);
                 if (ctx.measureText(remaining).width > titleMaxWidth) {
                     line = words[n] + '...'; 
                     n = words.length; 
                 }
            }
            if (lineCount >= 2) break;
        } else {
            line = testLine;
        }
    }
    if (lineCount < 2) ctx.fillText(line, padding, titleY);

    // 用户信息与品牌 (左下角)
    const infoY = height - padding - 30;
    
    // 用户名
    ctx.fillStyle = '#4B5563'; // Gray 600
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(`@${username}`, padding, infoY);
    
    // 品牌标识
    ctx.fillStyle = '#FF2442'; // XHS Red
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText("REDNOTE | 小红书", padding, infoY - 50);

    // 绘制二维码
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    
    // 扫码提示
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9CA3AF'; // Gray 400
    ctx.font = '22px sans-serif';
    ctx.fillText("长按扫码查看", qrX + qrSize/2, qrY + qrSize + 30);

    return canvas.toDataURL('image/png');
};

interface MobilePreviewProps {
  content: string;
  onContentChange: (newContent: string) => void;
  onCopy: () => void;
  onSaveToLibrary: (title: string, content: string, type: 'prompt' | 'note', existingId?: string, folder?: string) => void;
  drafts?: NoteDraft[];
  onDeleteDraft?: (id: string) => void;
  onDeleteDraftBatch?: (ids: string[]) => void;
  images?: string[]; 
  onImagesChange: (images: string[]) => void;
  publishedHistory?: PublishedRecord[]; 
  onSavePublished?: (record: PublishedRecord) => void; 
  onDeletePublished?: (id: string) => void; 
  onDeletePublishedBatch?: (ids: string[]) => void; 
  onFileUpload?: (files: File[]) => Promise<string[]>; 
  user?: User; 
  activeItemId: string | null;
  setActiveItemId: (id: string | null) => void;
  onNewNote?: () => void;
}

const MobilePreview: React.FC<MobilePreviewProps> = ({
  content = '', onContentChange, onSaveToLibrary,
  drafts = [], onDeleteDraft, onDeleteDraftBatch,
  images = [], onImagesChange,
  publishedHistory = [], onSavePublished, onDeletePublished, onDeletePublishedBatch,
  onFileUpload, user, activeItemId, setActiveItemId, onNewNote
}) => {
  // ... (keep state variables)
  const [activeTab, setActiveTab] = useState<'preview' | 'all'>('preview');
  const [activeFolder, setActiveFolder] = useState<string>('全部');
  const [isPublishing, setIsPublishing] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());
  const [showQrModal, setShowQrModal] = useState<PublishedRecord | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDownloading, setIsDownloading] = useState(false); 
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 图片轮播状态
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageScrollRef = useRef<HTMLDivElement>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const safeContent = content || '';
  const title = safeContent.split('\n')[0] || '';
  const fullBody = safeContent.includes('\n') ? safeContent.substring(safeContent.indexOf('\n') + 1) : '';

  const showToast = (msg: string, type: 'success'|'error'|'info' = 'success') => setToast({ show: true, message: msg, type });

  // 1. 深度聚合与去重
  const mergedItems = useMemo(() => {
      const map = new Map<string, any>();
      // 先放入草稿
      drafts.forEach(d => {
          map.set(String(d.id), { 
              ...d, 
              _type: 'draft', 
              timestamp: d.createdAt, 
              folder: d.folder || '默认分类' 
          });
      });
      // 再放入已发布
      publishedHistory.forEach(p => {
          map.set(String(p.id), { 
              ...p, 
              _type: 'published', 
              timestamp: p.publishedAt, 
              folder: p.folder || '默认分类' 
          });
      });
      return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [publishedHistory, drafts]);

  const activePublishedRecord = useMemo(() => {
      if (!activeItemId) return null;
      return publishedHistory.find(r => String(r.id) === String(activeItemId));
  }, [activeItemId, publishedHistory]);

  const folders = useMemo(() => {
      const set = new Set<string>(['全部']);
      mergedItems.forEach(item => { if (item.folder) set.add(item.folder); });
      return Array.from(set);
  }, [mergedItems]);

  const displayItems = useMemo(() => {
      let items = mergedItems;
      if (activeFolder !== '全部') {
          items = items.filter(i => i.folder === activeFolder);
      }
      if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          items = items.filter(i => i.title?.toLowerCase().includes(q) || i.content?.toLowerCase().includes(q));
      }
      return items;
  }, [activeTab, activeFolder, mergedItems, searchQuery]);

  // Auto-resize title textarea
  useEffect(() => {
      if (titleTextareaRef.current) {
          titleTextareaRef.current.style.height = 'auto';
          titleTextareaRef.current.style.height = `${titleTextareaRef.current.scrollHeight}px`;
      }
  }, [title, activeTab]);

  const handleImageScroll = () => {
      if (imageScrollRef.current) {
          const scrollLeft = imageScrollRef.current.scrollLeft;
          const width = imageScrollRef.current.offsetWidth;
          const index = Math.round(scrollLeft / width);
          setCurrentImageIndex(index);
      }
  };

  const scrollToImage = (index: number) => {
      if (imageScrollRef.current) {
          const width = imageScrollRef.current.offsetWidth;
          imageScrollRef.current.scrollTo({ left: width * index, behavior: 'smooth' });
      }
  };

  const handleUploadWrapper = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0 && onFileUpload) {
          setIsImageUploading(true);
          showToast("正在上传图片...", "info");
          try {
              const newUrls = await onFileUpload(Array.from(e.target.files));
              let currentImages = [...images];
              if (currentImages.length === 1 && currentImages[0] === DEFAULT_NOTE_IMAGE) {
                  currentImages = [];
              }
              const finalImages = [...currentImages, ...newUrls];
              onImagesChange(finalImages);
              setTimeout(() => {
                  if (imageScrollRef.current) {
                      imageScrollRef.current.scrollTo({ left: imageScrollRef.current.scrollWidth, behavior: 'smooth' });
                  }
              }, 100);
              showToast("图片上传成功");
          } catch (err) {
              showToast("图片上传失败", "error");
          } finally {
              setIsImageUploading(false);
          }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteImage = (index: number) => {
      const newImages = images.filter((_, i) => i !== index);
      onImagesChange(newImages.length > 0 ? newImages : [DEFAULT_NOTE_IMAGE]);
      if (index > 0) setCurrentImageIndex(index - 1);
      showToast("图片已删除");
  };

  const handleItemClick = (item: any) => {
      if (isSelectionMode) {
          const idStr = String(item.id);
          setSelectedIds(prev => { 
              const n = new Set(prev); 
              if(n.has(idStr)) n.delete(idStr); 
              else n.add(idStr); 
              return n; 
          });
      } else {
          setActiveItemId(String(item.id));
          setActiveTab('preview');
      }
  };

  // ... (handleBatchDelete, handleBatchArchive etc. remain unchanged)
  const handleBatchDelete = () => {
      const ids: string[] = Array.from(selectedIds) as string[];
      if (ids.length === 0) return;
      
      const publishedIds: string[] = [];
      const draftIds: string[] = [];

      ids.forEach((id: string) => {
          const item = mergedItems.find((i: any) => String(i.id) === id);
          if (item) {
              if (item._type === 'published') publishedIds.push(id);
              else draftIds.push(id);
          }
      });
      
      if (publishedIds.length > 0 && onDeletePublishedBatch) onDeletePublishedBatch(publishedIds);
      if (draftIds.length > 0 && onDeleteDraftBatch) onDeleteDraftBatch(draftIds);
      
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      showToast(`已删除 ${ids.length} 篇内容`);
  };

  const handleBatchArchive = () => {
      const folderToUse = newFolderName.trim() || '默认分类';
      const ids: string[] = Array.from(selectedIds) as string[];
      let count = 0;
      ids.forEach((id: string) => {
          const item = mergedItems.find((i: any) => String(i.id) === id);
          if (!item) return;
          if (onSaveToLibrary && item._type === 'draft') {
               onSaveToLibrary(item.title, item.content, 'note', String(item.id), folderToUse);
               count++;
          } else if (onSavePublished && item._type === 'published') {
               const { _type, timestamp, ...recordData } = item;
               onSavePublished({ ...recordData, folder: folderToUse });
               count++;
          }
      });
      if (count > 0) showToast(`已将 ${count} 篇笔记移动至 "${folderToUse}"`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      setShowArchiveModal(false);
      setNewFolderName('');
      setActiveFolder(folderToUse);
  };

  const downloadDataUrl = (dataUrl: string, filename: string) => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleDownloadCard = async (record: PublishedRecord) => {
      try {
          const dataUrl = await generateShareCard(record, user?.username);
          downloadDataUrl(dataUrl, `xhs-card-${record.title || 'note'}.png`);
          return true;
      } catch (e) {
          console.error(e);
          return false;
      }
  };

  // 批量下载 - (自动补全二维码 + 自动清理草稿)
  const handleBatchDownloadQRs = async () => {
      const ids: string[] = Array.from(selectedIds) as string[];
      if (ids.length === 0) return;

      const selectedItems = mergedItems.filter(i => ids.includes(String(i.id)));
      if (selectedItems.length === 0) { showToast("未选中任何笔记", "error"); return; }

      setIsDownloading(true);
      showToast(`正在生成 ${selectedItems.length} 张卡片...`, "info");

      let successCount = 0;
      
      for (let i = 0; i < selectedItems.length; i++) {
          const item = selectedItems[i];
          let recordToUse: PublishedRecord | null = null;

          try {
              // A. 草稿 -> 自动转发布状态
              if (item._type === 'draft') {
                   const validImages = (item.images && item.images.length > 0) ? item.images : [DEFAULT_NOTE_IMAGE];
                   const qrcode = await publishToXHS({ title: item.title, content: item.content || '', imageUrls: validImages });

                   const newRecord: PublishedRecord = {
                       id: `pub-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
                       title: item.title, content: item.content, coverImage: validImages[0], imageUrls: validImages,
                       qrCodeUrl: qrcode, publishedAt: Date.now(), folder: item.folder
                   };

                   if (onSavePublished) onSavePublished(newRecord);
                   
                   // 🟢 删除原草稿
                   if (onDeleteDraft) onDeleteDraft(String(item.id)); 

                   recordToUse = newRecord;
              } 
              // B. 已发布 -> 检查/补全二维码
              else {
                  let pubRecord = { ...item } as any;
                  if (!pubRecord.qrCodeUrl) {
                      const validImages = (pubRecord.imageUrls && pubRecord.imageUrls.length > 0) 
                          ? pubRecord.imageUrls : (pubRecord.coverImage ? [pubRecord.coverImage] : [DEFAULT_NOTE_IMAGE]);
                      const qrcode = await publishToXHS({ title: pubRecord.title, content: pubRecord.content || '', imageUrls: validImages });
                      pubRecord.qrCodeUrl = qrcode;
                      if (onSavePublished) {
                          const { _type, timestamp, ...cleanRecord } = pubRecord;
                          onSavePublished(cleanRecord as PublishedRecord);
                      }
                  }
                  recordToUse = pubRecord as PublishedRecord;
              }

              if (recordToUse) {
                  const success = await handleDownloadCard(recordToUse);
                  if (success) successCount++;
              }
          } catch (e: any) {
              console.error(`Failed: ${item.title}`, e);
          }
          await new Promise(r => setTimeout(r, 1000));
      }
      
      setIsDownloading(false);
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      showToast(`已生成 ${successCount} 张卡片，笔记已同步`);
  };

  const handlePublish = async () => {
      if (!title.trim()) return showToast("请填写标题", 'error');
      
      // 🟢 核心修改：发布时不先自动存草稿，防止产生重复草稿记录
      
      setIsPublishing(true);
      
      // Generate ID for new published record
      const newId = activeItemId?.startsWith('draft') ? `pub-${Date.now()}` : (activeItemId || `pub-${Date.now()}`);
      
      const optimisticRecord: PublishedRecord = {
          id: newId, title, content: safeContent, 
          coverImage: images.length > 0 ? images[0] : DEFAULT_NOTE_IMAGE, 
          imageUrls: images.length > 0 ? images : [DEFAULT_NOTE_IMAGE],
          qrCodeUrl: '', publishedAt: Date.now(), folder: activeFolder !== '全部' ? activeFolder : undefined
      };
      
      onSavePublished?.(optimisticRecord);
      
      try {
          const finalImages = images.length > 0 ? images : [DEFAULT_NOTE_IMAGE];
          const qrcode = await publishToXHS({ title, content: safeContent, imageUrls: finalImages });
          const finalRecord: PublishedRecord = { ...optimisticRecord, qrCodeUrl: qrcode };
          
          // 🟢 核心修复：直接调用 onSavePublished，由父组件负责状态切换
          // 这样不会触发父组件的 Navigation Check (因为不需要调用 setActiveItemId)
          if (onSavePublished) {
              onSavePublished(finalRecord);
          }
          
          // 🟢 核心修改：如果是从草稿发布的，发布成功后直接删除原草稿
          const isDraft = drafts.some(d => String(d.id) === String(activeItemId));
          if (activeItemId && isDraft && onDeleteDraft) {
              onDeleteDraft(activeItemId);
          }
          
          // ⚠️ DO NOT call setActiveItemId(newId) here. 
          // The parent (Workstation) handles the ID switch inside onSavePublished success handler.
          
          setShowQrModal(finalRecord);
          setActiveTab('all'); 
          showToast("发布成功");
      } catch (e: any) { 
          // If fail, delete the optimistic published record
          onDeletePublished?.(newId);
          showToast(`发布失败: ${e.message}`, 'error'); 
      } finally { setIsPublishing(false); }
  };

  const safeImages = images.length > 0 ? images : [DEFAULT_NOTE_IMAGE];
  const handleNewNoteWrapper = () => { if (onNewNote) { onNewNote(); setActiveTab('preview'); } };
  const extractBody = (fullContent: string) => fullContent.includes('\n') ? fullContent.substring(fullContent.indexOf('\n') + 1) : '';
  const titleCount = getCharacterCount(title);
  const bodyCount = getCharacterCount(fullBody);

  return (
    <div className="w-full h-full flex flex-col bg-white relative overflow-hidden lg:rounded-[3rem] lg:border-[8px] lg:border-slate-900 lg:shadow-2xl lg:max-w-[375px] lg:max-h-[812px] font-sans selection:bg-rose-100 selection:text-rose-900">
        {toast.show && <Toast message={toast.message} type={toast.type} onClose={() => setToast({...toast, show: false})} />}
        
        {/* Status Bar */}
        <div className="h-11 flex justify-between items-end px-6 pb-2 shrink-0 bg-white z-50">
            <div className="text-[15px] font-semibold text-black tracking-tight">09:41</div>
            <div className="flex gap-1.5 text-black items-center"><Signal size={16} strokeWidth={2.5}/><Wifi size={16} strokeWidth={2.5}/><Battery size={20} strokeWidth={2.5}/></div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar bg-white relative">
            {activeTab === 'preview' ? (
                <div className="flex flex-col animate-fade-in min-h-full pb-[60px] relative">
                    {/* Header: Preview Mode - Optimized to match XHS Detail View */}
                    <div className="h-11 flex items-center justify-between px-3 sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-50/50">
                        <ChevronLeft size={28} className="text-[#333] cursor-pointer hover:text-slate-600 transition-colors" strokeWidth={1.5} onClick={() => setActiveTab('all')} />
                        <div className="flex items-center gap-2 mr-auto ml-2">
                             <img src={user?.avatar || "https://api.dicebear.com/7.x/notionists/svg?seed=creator"} className="w-8 h-8 rounded-full object-cover border border-slate-100"/>
                             <div className="flex flex-col justify-center">
                                 <span className="text-[12px] font-bold text-[#333] truncate max-w-[80px] leading-tight">{user?.username || "创作者"}</span>
                                 <span className="text-[9px] text-slate-400 leading-tight">发布于 上海</span>
                             </div>
                             <button className="bg-rose-50 text-[#ff2442] text-[10px] font-bold px-2.5 py-1 rounded-full ml-1">关注</button>
                        </div>
                        <div className="flex gap-2 text-[#333] items-center">
                            {/* 🟢 新增：Header上的新建笔记按钮，确保用户能明确看到 */}
                            <button onClick={handleNewNoteWrapper} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-600" title="新建笔记"><FilePlus size={20} strokeWidth={1.5}/></button>
                            <button onClick={() => onSaveToLibrary(title, safeContent, 'note', activeItemId || undefined, activeFolder !== '全部' ? activeFolder : undefined)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-600"><Save size={20} strokeWidth={1.5}/></button>
                            <button className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-600"><Share2 size={20} strokeWidth={1.5} /></button>
                        </div>
                    </div>

                    {/* Image Carousel */}
                    <div className="w-full relative aspect-[3/4] bg-slate-50 group">
                        {isImageUploading && (
                            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-white animate-fade-in">
                                <Loader2 size={32} className="animate-spin mb-2"/>
                                <span className="text-xs font-bold">上传处理中...</span>
                            </div>
                        )}
                        <div ref={imageScrollRef} className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar" onScroll={handleImageScroll}>
                            {safeImages.map((img, idx) => (
                                <div key={idx} className="w-full h-full shrink-0 snap-center relative">
                                    <img src={img} className="w-full h-full object-cover" />
                                    {images.length > 0 && (
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteImage(idx); }} className="absolute top-3 right-3 p-2 bg-black/40 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all active:scale-90 hover:bg-red-500/80 z-20"><Trash2 size={16}/></button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div onClick={() => fileInputRef.current?.click()} className="absolute bottom-4 left-4 flex items-center justify-center transition-opacity cursor-pointer z-10 hover:scale-105 active:scale-95">
                            <div className="bg-black/40 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg text-white/90 border border-white/10">
                                {isImageUploading ? <Loader2 size={14} className="animate-spin"/> : <Camera size={14}/>}
                                <span className="text-[10px] font-bold">配图 ({images.length})</span>
                            </div>
                        </div>
                        <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleUploadWrapper} />
                        {safeImages.length > 1 && (
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                                {safeImages.map((_, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => scrollToImage(i)}
                                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentImageIndex ? 'bg-[#ff2442] scale-125' : 'bg-white/50 hover:bg-white'}`}
                                    />
                                ))}
                            </div>
                        )}
                        <div className="absolute top-3 right-3 bg-black/30 backdrop-blur px-2 py-0.5 rounded-full text-[10px] text-white font-medium opacity-80">{currentImageIndex + 1}/{safeImages.length}</div>
                    </div>

                    {/* Content Body */}
                    <div className="px-4 py-4 space-y-2 min-h-[400px]">
                        <div className="relative mb-2">
                            {/* 🟢 优化：使用 Textarea 实现标题自动换行，不再截断 */}
                            <textarea
                                ref={titleTextareaRef}
                                value={title}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        bodyTextareaRef.current?.focus();
                                    }
                                }}
                                onChange={(e) => {
                                    // 模拟单行输入习惯，回车即换行到正文
                                    const newTitle = e.target.value.replace(/\n/g, ' '); 
                                    onContentChange(`${newTitle}\n${fullBody}`);
                                }}
                                className="w-full text-[16px] font-bold text-[#333] border-none outline-none bg-transparent placeholder:text-slate-300 leading-normal pr-12 resize-none overflow-hidden block"
                                placeholder="填写标题会有更多赞哦~"
                                rows={1}
                            />
                            <div className={`absolute right-0 top-1.5 text-[10px] font-mono ${titleCount > 20 ? 'text-red-500 font-bold' : 'text-slate-300'}`}>{titleCount}/20</div>
                        </div>
                        <div className="relative">
                            <textarea 
                                ref={bodyTextareaRef}
                                value={fullBody} 
                                onChange={(e) => onContentChange(`${title}\n${e.target.value}`)} 
                                className="w-full text-[14px] leading-relaxed text-[#333] border-none outline-none resize-none bg-transparent placeholder:text-slate-300 min-h-[400px]" 
                                placeholder="添加正文" 
                            />
                            <div className={`text-right text-[10px] font-mono mt-1 ${bodyCount > 1000 ? 'text-red-500 font-bold' : 'text-slate-300'}`}>{bodyCount}/1000</div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-50">
                            <button className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 rounded-full text-[12px] text-slate-600 font-medium active:scale-95 transition-transform"><Plus size={12}/> 话题</button>
                            <button className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 rounded-full text-[12px] text-slate-600 font-medium active:scale-95 transition-transform"><MapPin size={12}/> {user?.location || '添加地点'}</button>
                            <button className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 rounded-full text-[12px] text-slate-600 font-medium active:scale-95 transition-transform"><Lock size={12}/> 公开可见</button>
                        </div>
                        <div className="text-[10px] text-slate-300 mt-2 text-center">{new Date().toLocaleDateString()}</div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col min-h-full">
                    {/* List Header */}
                    <div className="bg-white px-5 pt-4 pb-2 sticky top-0 z-40 border-b border-slate-50 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="flex-1 relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索笔记..." className="w-full bg-slate-100 text-xs rounded-full pl-9 pr-4 py-2 outline-none focus:ring-2 focus:ring-slate-200 transition-all placeholder:text-slate-400 text-slate-700"/>
                            </div>
                            <button onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds(new Set()); }} className={`p-2 rounded-full transition-colors ${isSelectionMode ? 'bg-[#ff2442] text-white' : 'bg-slate-100 text-slate-600'}`}>
                                {isSelectionMode ? <Check size={16}/> : <CheckSquare size={16}/>}
                            </button>
                        </div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                             {folders.map(f => (
                                 <button key={f} onClick={() => setActiveFolder(f)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border whitespace-nowrap ${activeFolder === f ? 'bg-[#333] border-[#333] text-white' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}>{f}</button>
                             ))}
                        </div>
                    </div>

                    {/* Masonry Grid */}
                    <div className="p-2 columns-2 gap-2 space-y-2 pb-24">
                        {displayItems.length === 0 && <div className="col-span-2 pt-20 text-center text-slate-400 flex flex-col items-center"><FolderPlus size={32} className="mb-2 opacity-50"/><span className="text-xs">暂无笔记</span></div>}
                        {displayItems.map((item: any) => {
                            const isSelected = selectedIds.has(String(item.id));
                            const cover = item.coverImage || (item.images?.[0] || DEFAULT_NOTE_IMAGE);
                            const itemTitleCount = getCharacterCount(item.title || '');
                            const itemBodyRaw = extractBody(item.content || '');
                            const itemBodyCount = getCharacterCount(itemBodyRaw);

                            return (
                                <div key={String(item.id)} className={`bg-white rounded-xl overflow-hidden shadow-sm break-inside-avoid relative border border-slate-100 transition-all ${isSelectionMode ? 'ring-2 ring-transparent' : 'active:scale-[0.98]'}`} onClick={() => handleItemClick(item)}>
                                    <div className="aspect-[3/4] relative group">
                                        <img src={cover} className="w-full h-full object-cover" />
                                        {item._type === 'published' ? <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-bold text-white backdrop-blur-md shadow-sm bg-[#ff2442]/90">已发布</div> : <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-bold text-slate-600 backdrop-blur-md shadow-sm bg-white/90 border border-slate-100">草稿</div>}
                                        {item._type === 'published' && !isSelectionMode && (
                                            <div className="absolute bottom-0 right-0 p-1.5 bg-black/30 backdrop-blur-sm rounded-tl-xl cursor-pointer hover:bg-rose-500/80 transition-colors z-20" onClick={(e) => { e.stopPropagation(); if (item.qrCodeUrl) setShowQrModal(item); }}>
                                                {item.qrCodeUrl ? <QrCode size={12} className="text-white"/> : <Loader2 size={12} className="animate-spin text-white"/>}
                                            </div>
                                        )}
                                        {isSelectionMode && (
                                            <div className={`absolute inset-0 bg-white/10 z-30 flex justify-end p-2`}>
                                                <div className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-all shadow-sm ${isSelected ? 'bg-[#ff2442] border-[#ff2442]' : 'bg-black/20 border-white backdrop-blur-sm'}`}>
                                                    {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-2.5">
                                        <div className="text-[13px] font-bold text-[#333] line-clamp-2 leading-tight mb-1 min-h-[18px]">{item.title || '未命名'}</div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[9px] text-slate-400 font-mono bg-slate-50 px-1 rounded">标题: {itemTitleCount}</span>
                                            <span className="text-[9px] text-slate-400 font-mono bg-slate-50 px-1 rounded">正文: {itemBodyCount}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-slate-50 pt-2">
                                            <div className="flex items-center gap-1">
                                                <div className="w-4 h-4 rounded-full bg-slate-200 overflow-hidden shrink-0"><img src={user?.avatar} className="w-full h-full object-cover"/></div>
                                                <span className="text-[10px] text-slate-400 scale-90 origin-left truncate max-w-[60px]">{user?.username}</span>
                                            </div>
                                            <div className="flex items-center gap-0.5 text-slate-400"><Heart size={10} /><span className="text-[10px]">0</span></div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>

        {/* ... (Toolbars logic mostly unchanged) ... */}
        {activeTab === 'preview' && (
            <div className="absolute bottom-0 left-0 right-0 h-[52px] bg-white border-t border-slate-100 flex items-center px-4 justify-between z-50">
                <div className="flex-1 bg-slate-100 h-9 rounded-full px-4 flex items-center text-slate-400 text-xs mr-4"><span className="truncate">说点什么...</span></div>
                <div className="flex items-center gap-5 text-[#333]">
                    <div className="flex flex-col items-center gap-0.5"><Heart size={20} strokeWidth={1.5} /><span className="text-[10px] font-medium">0</span></div>
                    <div className="flex flex-col items-center gap-0.5"><Star size={20} strokeWidth={1.5} /><span className="text-[10px] font-medium">0</span></div>
                    <div className="flex flex-col items-center gap-0.5"><MessageCircle size={20} strokeWidth={1.5} /><span className="text-[10px] font-medium">0</span></div>
                </div>
            </div>
        )}

        {/* ... (Rest of modal logic) ... */}
        {activeTab === 'preview' && !activePublishedRecord && (
            <div className="absolute bottom-[65px] right-4 flex flex-col gap-3 z-50 items-end animate-fade-in">
                <button onClick={handlePublish} disabled={isPublishing} className="h-9 px-4 bg-[#ff2442] text-white rounded-full shadow-lg flex items-center justify-center gap-1.5 active:scale-90 transition-transform disabled:opacity-50 font-bold text-xs shadow-rose-200/50">
                    {isPublishing ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} 发布笔记
                </button>
            </div>
        )}

        {isSelectionMode && activeTab !== 'preview' && (
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-white border-t border-slate-100 z-50 animate-fade-in pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                <div className="flex gap-2">
                    <button onClick={() => setShowArchiveModal(true)} disabled={selectedIds.size === 0} className="flex-1 h-10 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:bg-slate-300 disabled:text-white"><FolderPlus size={14}/> 归档</button>
                    <button onClick={handleBatchDownloadQRs} disabled={selectedIds.size === 0 || isDownloading} className="flex-1 h-10 bg-slate-100 text-slate-900 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:text-slate-400">
                        {isDownloading ? <Loader2 size={14} className="animate-spin"/> : <QrCode size={14}/>} 批量二维码
                    </button>
                    <button onClick={handleBatchDelete} disabled={selectedIds.size === 0} className="w-12 h-10 bg-red-50 text-red-500 rounded-lg flex items-center justify-center active:scale-95 disabled:bg-slate-50 disabled:text-slate-300"><Trash2 size={16}/></button>
                </div>
            </div>
        )}

        {activeTab !== 'preview' && !isSelectionMode && (
            <div className="h-[50px] shrink-0 bg-white border-t border-slate-50 px-6 flex items-center justify-around z-40 pb-1">
                <div className="flex flex-col items-center gap-0.5 text-[#333] font-bold"><div className="text-[14px]">首页</div><div className="w-4 h-0.5 bg-transparent"/></div>
                <div className="flex flex-col items-center gap-0.5 text-slate-400 font-medium"><div className="text-[14px]">视频</div></div>
                <div onClick={handleNewNoteWrapper} className="w-10 h-7 bg-[#ff2442] rounded-[8px] flex items-center justify-center text-white shadow-md active:scale-90 transition-transform cursor-pointer"><Plus size={20} strokeWidth={3}/></div>
                <div className="flex flex-col items-center gap-0.5 text-slate-400 font-medium"><div className="text-[14px]">消息</div></div>
                <div className="flex flex-col items-center gap-0.5 text-slate-400 font-medium"><div className="text-[14px]">我</div></div>
            </div>
        )}

        {showArchiveModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-[24px] w-full max-w-xs p-6 shadow-2xl animate-fade-in relative">
                    <h3 className="text-base font-bold text-slate-900 mb-4 text-center">移动到分类</h3>
                    <div className="flex flex-wrap gap-2 mb-4 justify-center">
                        {folders.filter(f => f !== '全部').map(f => (
                            <button key={f} onClick={() => setNewFolderName(f)} className="px-3 py-1 bg-slate-100 rounded-full text-xs text-slate-600 hover:bg-slate-200">{f}</button>
                        ))}
                    </div>
                    <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="输入或新建分类名称..." className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none text-sm font-bold focus:ring-2 focus:ring-[#ff2442]/10 mb-4 text-center" autoFocus />
                    <div className="flex gap-2">
                        <button onClick={() => setShowArchiveModal(false)} className="flex-1 h-10 bg-slate-100 text-slate-500 rounded-lg font-bold text-xs">取消</button>
                        <button onClick={handleBatchArchive} className="flex-1 h-10 bg-[#ff2442] text-white rounded-lg font-bold text-xs shadow-lg shadow-rose-200">确认移动</button>
                    </div>
                </div>
            </div>
        )}

        {/* 🟢 全新设计的二维码预览 Modal (极简高级感) */}
        {showQrModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-xl animate-fade-in" onClick={() => setShowQrModal(null)}>
                <div className="relative w-full max-w-[340px] flex flex-col gap-6" onClick={e => e.stopPropagation()}>
                    
                    {/* 卡片主体 */}
                    <div className="bg-white rounded-[32px] overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/20 transition-all duration-300 hover:scale-[1.02]">
                        <div className="relative aspect-[3/4] w-full bg-slate-50 group">
                             <img src={showQrModal.coverImage || showQrModal.imageUrls?.[0]} className="w-full h-full object-cover" />
                             
                             {/* 渐变遮罩 */}
                             <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60"></div>
                             
                             {/* 底部悬浮信息 */}
                             <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end h-full">
                                <div className="text-white">
                                    <h3 className="text-[20px] font-bold leading-snug line-clamp-2 mb-2 drop-shadow-md">{showQrModal.title || '笔记分享'}</h3>
                                    <div className="flex items-center gap-2 opacity-90">
                                        <div className="w-5 h-5 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                            <div className="w-2.5 h-2.5 bg-[#ff2442] rounded-full shadow-sm"></div>
                                        </div>
                                        <span className="text-xs font-medium tracking-wide">小红书 App</span>
                                    </div>
                                </div>
                             </div>

                             {/* 二维码悬浮窗 (右上角) */}
                             <div className="absolute top-4 right-4 w-16 h-16 bg-white/90 backdrop-blur-md rounded-xl p-1.5 shadow-lg border border-white/50">
                                 {showQrModal.qrCodeUrl ? (
                                     <img src={showQrModal.qrCodeUrl} className="w-full h-full object-contain mix-blend-multiply opacity-90"/>
                                 ) : (
                                     <QrCode className="w-full h-full text-slate-300 p-1"/>
                                 )}
                             </div>
                        </div>
                    </div>

                    {/* 底部操作栏 */}
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => handleDownloadCard(showQrModal).then(s => s && showToast('已保存到相册'))} 
                            className="w-full py-4 bg-white text-slate-900 rounded-full font-bold text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-slate-50"
                        >
                            <DownloadCloud size={18} className="text-slate-900"/> 保存分享卡片
                        </button>
                        <button 
                            onClick={() => setShowQrModal(null)} 
                            className="w-full py-4 bg-transparent text-white/70 hover:text-white rounded-full font-bold text-sm border border-white/20 hover:bg-white/10 active:scale-95 transition-all backdrop-blur-sm"
                        >
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default memo(MobilePreview);
