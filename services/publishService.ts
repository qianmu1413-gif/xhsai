
import { configRepo } from "./repository";

interface PublishParams {
  title: string;
  content: string;
  imageUrls: string[];
}

export const publishToXHS = async ({ title, content, imageUrls }: PublishParams): Promise<string> => {
  const config = await configRepo.getSystemConfig();
  const { apiKey, targetUrl, proxyUrl } = config.publish;

  if (!apiKey) throw new Error("发布服务 API 未配置");

  const finalTarget = targetUrl || 'https://www.myaibot.vip/api/rednote/publish';
  const finalProxy = proxyUrl || 'https://corsproxy.io/?';
  
  const fullUrl = `${finalProxy}${encodeURIComponent(finalTarget)}`;
  
  const safeTitle = title.length > 20 ? title.substring(0, 20) : title;
  
  try {
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        type: 'normal',
        title: safeTitle,
        content: content,
        images: imageUrls
      })
    });

    if (!response.ok) {
        throw new Error(`发布服务响应异常 (${response.status})`);
    }

    const result = await response.json();
    
    if (result.success === true && result.data) {
        return result.data.qrcode;
    }
    
    if (result.error) {
        throw new Error(result.error.message || "参数验证失败");
    }

    throw new Error("接口返回了未知的格式");

  } catch (error: any) {
    console.error("XHS Publish Error:", error);
    throw new Error(error.message || '发布请求失败');
  }
};
