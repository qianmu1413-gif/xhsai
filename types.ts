
import { XhsNoteData } from './services/xhsService';

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  inviteCode: string;
  totalQuota: number;
  quotaRemaining: number;
  expiryDate: string;
  createdAt: number;
  isSuspended?: boolean; 
  isDeleted?: boolean;
  // Analytics Data
  lastIp?: string;
  lastLoginAt?: number;
  totalOnlineSeconds?: number;
  interactionCount?: number;
  location?: string; // IP Location
  avatar?: string;
}

export interface PersonaAnalysis {
  id?: string;
  tone: string;
  keywords: string[];
  emojiDensity: string;
  structure: string;
  writerPersonaPrompt: string; 
  avatar?: string;
  isGlobal?: boolean;
  tags?: string[]; // 新增：标签
  category?: string; // 新增：分类 (如：美妆、职场)
  sourceNoteId?: string; // 追踪来源
  description?: string; // 管理员或用户备注
}

export interface BulkNote {
  title: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  thought?: string; 
  timestamp: number;
  isError?: boolean;
  bulkNotes?: BulkNote[]; 
  isStreaming?: boolean; 
}

export interface SocialNote extends XhsNoteData {
  category?: string;
  addedAt: number;
  isDeleted?: boolean; // 软删除标记
}

export enum FidelityMode {
  STRICT = 'Strict',
  CREATIVE = 'Creative'
}

export interface AttachedFile {
  id: string;
  name: string;
  type: 'image' | 'file';
  mimeType: string;
  data: string; // Base64 OR URL
  isUrl?: boolean; 
  preview?: string; 
  isDeleted?: boolean; // 软删除标记
  file?: File; // Transient: Local file object for immediate analysis (not saved to DB)
}

export interface UserUpload {
  id: string;
  user_id: string;
  file_url: string;
  file_type: string;
  file_name: string;
  file_size: number;
  created_at: number;
  is_deleted?: boolean;
}

export interface SavedLink {
  id: string;
  user_id: string;
  original_url: string;
  page_title: string;
  summary?: string;
  created_at: number;
  is_deleted?: boolean;
}

export interface NoteDraft {
  id: string;
  title: string;
  content: string;
  personaName: string; 
  images?: string[]; // Added: Store draft images
  createdAt: number;
  isDeleted?: boolean;
}

export interface PublishedRecord {
  id: string;
  title: string;
  coverImage: string; 
  imageUrls: string[]; 
  qrCodeUrl: string; 
  publishedAt: number;
  isDeleted?: boolean; // 软删除
}

export interface PreviewState {
  title?: string;
  images: string[];
}

export interface Project {
  id: string;
  name: string;
  updatedAt: number;
  persona?: PersonaAnalysis;
  trainingSamples?: string[]; 
  contextText: string;
  attachedFiles: AttachedFile[];
  socialNotes: SocialNote[]; 
  chatHistory: ChatMessage[];
  fidelity: FidelityMode;
  wordCountLimit: number;
  generatedContent: string;
  previewState?: PreviewState; 
  drafts?: NoteDraft[];
  publishedHistory?: PublishedRecord[]; 
  isDeleted?: boolean; // 项目本身的软删除
  materialAnalysis?: string;
}

export interface SystemConfig {
  gemini: { apiKey: string; baseUrl: string; model: string };
  xhs: { apiKey: string; apiUrl: string };
  cos: { secretId: string; secretKey: string; bucket: string; region: string };
  publish: { apiKey: string; targetUrl?: string; proxyUrl?: string };
}
