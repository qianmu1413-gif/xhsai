
import { configRepo } from "./repository";

export interface XhsNoteData {
  noteId: string;
  title: string;
  desc: string;
  images: { url: string; height?: number; width?: number }[];
  user: { nickname: string; avatar: string; userId: string };
  interactInfo?: {
    likedCount: string;
    collectedCount?: string;
    commentCount?: string;
  };
}

/**
 * 从文本中精准提取所有小红书链接
 */
export const extractXhsUrls = (text: string): string[] => {
  const regex = /https?:\/\/(?:www\.)?(?:xiaohongshu\.com\/discovery\/item\/[a-zA-Z0-9?=&_%-]+|xhslink\.com\/[a-zA-Z0-9/]+)/g;
  const matches = text.match(regex);
  return matches ? Array.from(new Set(matches.map(url => url.trim()))) : [];
};

/**
 * 解析单个小红书链接获取内容
 */
export const fetchXhsNote = async (url: string): Promise<XhsNoteData> => {
  const cleanUrl = url.trim();
  if (!cleanUrl) throw new Error("URL 不能为空");

  const config = await configRepo.getSystemConfig();
  const { apiKey, apiUrl } = config.xhs;

  if (!apiKey) throw new Error("小红书解析 API 未配置");

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ url: cleanUrl })
    });

    if (!response.ok) {
      throw new Error(`解析服务暂时不可用 (HTTP ${response.status})`);
    }

    const result = await response.json();
    if (result.code !== 0) {
      throw new Error(result.message || '解析服务返回异常');
    }

    return result.data;
  } catch (err: any) {
    console.error("XHS Fetch Error:", err);
    throw err;
  }
};
