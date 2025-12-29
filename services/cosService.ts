
import { configRepo } from './repository';

// 声明全局 COS 对象
declare const COS: any;

let cosInstance: any = null;

// 初始化 COS 实例
const getCosInstance = async () => {
  if (typeof COS === 'undefined') {
    // 尝试动态加载 SDK (如果 index.html 里的 script 加载失败)
    console.error("腾讯云 SDK 未加载");
    throw new Error("腾讯云 SDK 未加载，请检查网络或 index.html");
  }
  if (!cosInstance) {
    const config = await configRepo.getSystemConfig();
    const { secretId, secretKey, region } = config.cos;
    
    // 即使没有配置，也允许初始化以便进入 Fallback 逻辑
    try {
        if (secretId && secretKey) {
            cosInstance = new COS({
              SecretId: secretId,
              SecretKey: secretKey,
              Protocol: 'https:',
            });
        } else {
            // Mock instance that always fails to trigger fallback
            const mockFn = (_: any, cb: any) => cb(new Error("COS 未配置"));
            cosInstance = {
                sliceUploadFile: mockFn,
                deleteObject: mockFn
            };
        }
    } catch (e) {
        console.warn("COS Init Warning", e);
        const mockFn = (_: any, cb: any) => cb(new Error("COS Init Failed"));
        cosInstance = {
            sliceUploadFile: mockFn,
            deleteObject: mockFn
        };
    }
  }
  return cosInstance;
};

// Helper: Convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// Helper: Generate Safe Filename (Timestamp + Random)
const generateSafeFilename = (originalName: string): string => {
    const ext = originalName.split('.').pop() || 'tmp';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    // 移除非法字符，只保留字母数字
    return `${timestamp}_${random}.${ext}`;
};

// Helper: 从完整 URL 提取文件名 (Key)
// 例如把 https://bucket.cos.../folder/img.jpg 变成 folder/img.jpg
const getKeyFromUrl = (url: string) => {
    if (!url) return '';
    // 如果包含你的腾讯云域名，就进行截取
    if (url.includes('.myqcloud.com/')) {
        return url.split('.myqcloud.com/')[1];
    }
    // 如果本来就是 Key 或者格式不对，原样返回尝试删除
    return url;
};

// 1. 上传功能
export const uploadToCOS = async (file: File): Promise<string> => {
    try {
        const config = await configRepo.getSystemConfig();
        const { bucket, region } = config.cos;
        
        // 如果没有配置 Bucket，直接走 Base64 Fallback
        if (!bucket || !region) {
             console.warn("COS Bucket/Region missing, using Base64 fallback.");
             return await fileToBase64(file);
        }

        const cos = await getCosInstance();
        
        return new Promise(async (resolve, reject) => {
            // 策略：使用 matrix_studio/ 作为根目录，确保文件隔离
            const safeName = generateSafeFilename(file.name);
            const key = `matrix_studio/${safeName}`;

            cos.sliceUploadFile({
              Bucket: bucket,
              Region: region,
              Key: key,
              Body: file,
            }, async function(err: any, data: any) {
              if (err) {
                console.warn('COS Upload Failed (Account Arrears or Network). Switching to Base64 storage.', err);
                // 🔴 混合架构降级策略：上传失败时，自动降级为 Base64 本地存储
                try {
                    const base64 = await fileToBase64(file);
                    resolve(base64);
                } catch (readErr) {
                    reject(new Error("图片读取失败"));
                }
              } else {
                // 成功：返回带 CDN 的永久链接 (HTTPS)
                const url = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
                resolve(url);
              }
            });
        });
    } catch (e) {
        // 最外层捕获，确保绝对降级
        console.warn("COS Service Error. Using fallback.", e);
        return await fileToBase64(file);
    }
};

// 2. 【新增】删除功能 (修复“删不掉”的关键)
export const deleteFromCOS = async (fileUrl: string): Promise<void> => {
    if (!fileUrl) return;

    try {
        const config = await configRepo.getSystemConfig();
        const { bucket, region } = config.cos;
        
        if (!bucket || !region) return;

        const cos = await getCosInstance();
        
        // 关键一步：把网址变成文件名
        const key = getKeyFromUrl(fileUrl);
        console.log(`正在从云端删除: ${key}`);

        return new Promise((resolve) => {
            cos.deleteObject({
                Bucket: bucket,
                Region: region,
                Key: key,
            }, function(err: any, data: any) {
                if (err) {
                    // Enhance logging for the user to debug permissions/CORS
                    if (err.statusCode === 403) {
                        console.error("COS Delete 403 Forbidden: 请检查 SecretKey 的 DeleteObject 权限");
                    } else if (err.error && err.error.Message && err.error.Message.includes("CORS")) {
                         console.error("COS Delete CORS Error: 请检查 Bucket 的跨域配置是否允许 DELETE 方法");
                    } else {
                        console.warn("云端文件删除异常:", err);
                    }
                }
                // Always resolve so UI flow isn't blocked by cloud errors
                resolve();
            });
        });
    } catch (e) {
        console.warn("COS Delete Error", e);
    }
};
