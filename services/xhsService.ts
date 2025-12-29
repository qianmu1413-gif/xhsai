
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
  // 优化正则，支持带参数的长链接
  const regex = /https?:\/\/(?:www\.)?(?:xiaohongshu\.com\/discovery\/item\/[a-zA-Z0-9?=&_%-]+|xhslink\.com\/[a-zA-Z0-9\/]+)/g;
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

  if (!apiKey) {
      throw new Error("❌ 系统未配置小红书 API Key。请联系管理员在控制台配置。");
  }

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
      if (response.status === 401) throw new Error("API Key 无效或已过期");
      if (response.status === 402) throw new Error("API 余额不足");
      throw new Error(`解析服务请求失败 (HTTP ${response.status})`);
    }

    const result = await response.json();
    
    // 兼容不同的 API 返回格式 (根据实际 API 调整)
    if (result.code !== 0 && result.code !== 200) {
      throw new Error(result.msg || result.message || '解析服务返回异常');
    }

    // 适配数据结构
    const data = result.data || result;
    return data;

  } catch (err: any) {
    console.error("XHS Fetch Error:", err);
    throw new Error(err.message || "网络请求失败");
  }
};
