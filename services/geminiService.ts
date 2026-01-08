
import { FidelityMode, PersonaAnalysis, BulkNote, AttachedFile } from "../types";
import { configRepo } from "./repository";
import { ANALYSIS_SYSTEM_PROMPT } from "../constants";
import mammoth from "mammoth";
import { GoogleGenAI, Type } from "@google/genai";

// 协议分隔符
const DATA_MARKER = "###MATRIX_DATA_START###";

// --- 文本清洗工具 ---
const cleanText = (text: string | undefined): string => {
    if (!text) return "";
    let cleaned = text;

    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
    cleaned = cleaned.replace(/\[\[THOUGHT\]\][\s\S]*?\[\[\/THOUGHT\]\]/gi, "");
    cleaned = cleaned.replace(/^(Here is (the|a)|Sure, here is|Okay, here is|Based on the content).*?:/gmi, "");
    
    cleaned = cleaned.replace(/\*\*Persona\*\*:/gi, "**人设定位**:");
    cleaned = cleaned.replace(/\*\*Topic\*\*:/gi, "**主题分析**:");
    cleaned = cleaned.replace(/\*\*Target Audience\*\*:/gi, "**目标人群**:");
    cleaned = cleaned.replace(/\*\*Key Data\*\*:/gi, "**核心数据**:");

    return cleaned.trim();
};

const extractAndParseJSON = (text: string): any => {
    if (!text) return null;
    let json: any = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (!json) {
        let cleanTextStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        try { json = JSON.parse(cleanTextStr); } catch (e) {}
    }
    if (!json) {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) { try { json = JSON.parse(match[0]); } catch (e) {} }
    }
    return json;
};

// --- 文件处理辅助 ---

const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        if (!(blob instanceof Blob)) return reject(new Error("Input is not a Blob"));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(new Error("FileReader failed to read ArrayBuffer"));
        reader.readAsArrayBuffer(blob);
    });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!blob || !(blob instanceof Blob)) return reject(new Error("File blob is empty or invalid type"));
        const reader = new FileReader();
        reader.onload = () => {
             const result = reader.result as string;
             const base64 = result.includes(',') ? result.split(',')[1] : result;
             resolve(base64);
        };
        reader.onerror = (e) => reject(new Error(`FileReader Failed: ${reader.error?.message}`));
        reader.readAsDataURL(blob);
    });
};

const fetchUrlAsBlob = async (url: string): Promise<Blob> => {
    const cleanUrl = url.split('?')[0]; 
    const timestampUrl = `${cleanUrl}?_t=${Date.now()}`; 

    try {
        const response = await fetch(timestampUrl, { cache: 'no-store', mode: 'cors', credentials: 'omit' }); 
        if (response.ok) return await response.blob();
        if (response.status === 403) throw new Error("403 Forbidden");
    } catch (e: any) { 
        if (e.message.includes('403')) throw new Error("403 权限拒绝: 请检查腾讯云 COS 防盗链设置");
    }

    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) return await res.blob();
    } catch (e) {}

    throw new Error("无法从云端下载文件 (CORS/网络拦截)");
};

const extractDocxText = async (blob: Blob): Promise<string> => {
    try {
        const arrayBuffer = await blobToArrayBuffer(blob);
        if (mammoth) {
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value;
        }
    } catch (e) { return "[DOCX 解析失败]"; }
    return "[解析器未就绪]";
};

const extractPdfText = async (blob: Blob): Promise<string> => {
    try {
        // @ts-ignore
        if (typeof window !== 'undefined' && window.pdfjsLib) {
            const arrayBuffer = await blobToArrayBuffer(blob);
            // @ts-ignore
            const loadingTask = window.pdfjsLib.getDocument({ 
                data: arrayBuffer,
                cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
                cMapPacked: true,
            });
            const pdf = await loadingTask.promise;
            let fullText = "";
            const maxPages = Math.min(pdf.numPages, 15); 
            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += `[第${i}页]: ${pageText}\n`;
            }
            return fullText;
        }
    } catch (e) { console.error("PDF Parse Error", e); }
    return "";
};

const prepareFilePart = async (file: AttachedFile): Promise<any> => {
    try {
        let mimeType = file.mimeType || 'text/plain';
        let base64Data = "";
        let blob: Blob | undefined = (file.file instanceof Blob) ? file.file : undefined;

        if (blob) { mimeType = blob.type || mimeType; } 
        else if (file.data.startsWith('http')) {
            try {
                blob = await fetchUrlAsBlob(file.data);
                mimeType = blob.type || mimeType;
            } catch (fetchErr: any) {
                return { text: `[系统警告: 附件 "${file.name}" 读取失败。]` };
            }
        }
        else if (file.data.startsWith('data:')) {
            const parts = file.data.split(',');
            base64Data = parts[1];
             if (file.name.endsWith('.pdf') || file.name.endsWith('.docx')) {
                 try {
                    const binaryStr = atob(base64Data);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                    blob = new Blob([bytes], { type: mimeType });
                 } catch(e) {}
             }
        }

        if (!blob && !base64Data) return { text: `[读取失败: ${file.name}]` };

        if (mimeType.includes('pdf') || file.name.endsWith('.pdf')) {
            if (blob) {
                const pdfText = await extractPdfText(blob);
                if (pdfText && pdfText.trim().length > 20) return { text: `[PDF文档内容 ${file.name}]:\n${pdfText}` };
            }
            if (base64Data) return { inlineData: { mimeType: 'application/pdf', data: base64Data } };
            if (blob) return { inlineData: { mimeType: 'application/pdf', data: await blobToBase64(blob) } };
        } 
        else if (mimeType.startsWith('image/')) {
            if (base64Data) return { inlineData: { mimeType, data: base64Data } };
            if (blob) return { inlineData: { mimeType, data: await blobToBase64(blob) } };
        } 
        else if (file.name.endsWith('.docx') && blob) {
            return { text: `[文档内容 ${file.name}]:\n${await extractDocxText(blob)}` };
        } 
        else if (blob) {
            return { text: `[文档内容 ${file.name}]:\n${await blob.text()}` };
        }
        return { text: `[未知文件类型: ${file.name}]` };
    } catch (e: any) { return { text: `[文件处理错误: ${file.name} - ${e.message}]` }; }
};

// 🟢 核心修复：SDK 初始化时注入 BaseURL，并双重拦截
const getAIClient = async () => {
    const config = await configRepo.getSystemConfig();
    const apiKey = config.gemini.apiKey;
    let baseUrl = config.gemini.baseUrl;

    if (!apiKey) {
        throw new Error("❌ 未配置 API Key。请在【系统配置】中填入。");
    }

    // 1. URL 格式化 (自动补全 https)
    if (baseUrl && baseUrl.trim() !== "" && !baseUrl.match(/^https?:\/\//)) {
        baseUrl = `https://${baseUrl}`;
    }
    if (baseUrl) {
        baseUrl = baseUrl.replace(/\/$/, '');
    }

    // 2. HTTPS 安全检查
    if (baseUrl && typeof window !== 'undefined' && window.location.protocol === 'https:' && baseUrl.startsWith('http:')) {
        throw new Error(`🔒 安全阻断: 当前 HTTPS 环境禁止连接不安全的 HTTP 网关 (${baseUrl})。请使用 HTTPS 网关。`);
    }

    // 3. 构造请求拦截器 (双重保险，防止 SDK 忽略 baseUrl)
    let requestOptions: any = {};
    if (baseUrl && baseUrl.trim() !== "") {
        console.log(`[Matrix Proxy] ⚡ 强制代理模式开启: ${baseUrl}`);
        
        const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            let originalUrl = '';
            if (typeof input === 'string') originalUrl = input;
            else if (input instanceof URL) originalUrl = input.toString();
            else if (input instanceof Request) originalUrl = input.url;
            else originalUrl = String(input);
            
            let finalUrl = originalUrl;
            
            // 🚨 强制重定向：所有发往 googleapis 的请求都被劫持到 baseUrl
            if (originalUrl.includes('googleapis.com')) {
                // 移除原有的 Google 域名
                const path = originalUrl.replace(/^https?:\/\/[^\/]+/, '');
                finalUrl = `${baseUrl}${path}`;
                
                console.log(`[Matrix Proxy] 🚀 拦截并重定向:\nFrom: ${originalUrl}\nTo:   ${finalUrl}`);
            }

            const newInit = { ...init, credentials: 'omit' as RequestCredentials, mode: 'cors' as RequestMode };
            
            try {
                // 使用 window.fetch 发送修改后的请求
                const response = await window.fetch(finalUrl, newInit);
                if (!response.ok) {
                    console.error(`[Matrix Proxy] 请求失败: ${response.status} ${response.statusText}`);
                }
                return response;
            } catch (networkError: any) {
                console.error("[Matrix Proxy] 网络错误:", networkError);
                throw new Error(`无法连接到网关 (${baseUrl})。错误: ${networkError.message}`);
            }
        };
        requestOptions.customFetch = customFetch;
    }

    // 4. 初始化客户端
    // 🔍 调试信息：在控制台打印当前使用的配置
    console.log(`%c[Matrix System] 正在初始化 AI 客户端`, "color: #0ea5e9; font-weight: bold");
    console.log(`%c[Key] ${apiKey.substring(0, 8)}******`, "color: #f59e0b");
    console.log(`%c[URL] ${baseUrl || "Google Official (Default)"}`, "color: #10b981");

    return {
        client: new GoogleGenAI({ 
            apiKey: apiKey,
            // 🟢 核心修复：必须显式将 baseUrl 传入构造函数，否则新版 SDK 会忽略它！
            baseUrl: baseUrl, 
            requestOptions: requestOptions // 拦截器作为备份
        }),
        modelName: config.gemini.model,
        apiKey: apiKey, 
        baseUrl: baseUrl || "Google Official"
    };
};

export const analyzeMaterials = async (files: AttachedFile[]): Promise<string> => {
    if (files.length === 0) return "无文件可分析";
    try {
        const { client, modelName } = await getAIClient();
        const fileParts = await Promise.all(files.map(prepareFilePart));
        const prompt = `分析提供的素材，提取核心营销卖点。全中文输出。`;
        const response = await client.models.generateContent({
            model: modelName, 
            contents: { parts: [{ text: prompt }, ...fileParts] },
            config: { temperature: 0.2 }
        });
        return cleanText(response.text || "分析失败");
    } catch (e: any) {
        return `分析过程发生错误: ${e.message || '未知错误'}`;
    }
};

const parseBulkNotes = (text: string): BulkNote[] => {
    const notes: BulkNote[] = [];
    const parts = text.split(/###\s*(?:方案|笔记|Version)\s*\d+/i);
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;
        let title = "";
        let content = "";
        const titleMatch = part.match(/(?:标题|Title)[:：]\s*(.*?)(?:\n|$)/i);
        if (titleMatch) {
            title = titleMatch[1].trim();
            content = part.replace(titleMatch[0], "").trim();
            content = content.replace(/^(?:正文|Content)[:：]\s*/i, "").trim();
        } else {
            const lines = part.split('\n');
            title = lines[0].trim();
            content = lines.slice(1).join('\n').trim();
        }
        if (title || content) notes.push({ title, content });
    }
    return notes;
};

export const streamExpertGeneration = async (
    context: string,
    files: AttachedFile[],
    personaPrompt: string | undefined,
    fidelity: FidelityMode,
    count: number,
    wordLimit: number,
    onToken: (text: string, thought: string) => void
) => {
    const wordCountConstraint = `
🚨 **字数硬性指标**:
生成的笔记正文内容（不含结尾标签）必须严格控制在 **${wordLimit} 字以内**。
`;
    const commonRules = `🚨 **核心规范**: 1. 严禁输出 <thinking> 标签。2. 语气符合小红书博主身份。${wordCountConstraint}`;
    
    let systemText = "";
    if (fidelity === FidelityMode.STRICT) {
        systemText = `【角色】：专业内容重构专家。\n${commonRules}\n1. **绝对忠实于素材**。2. **严禁虚构**。`;
    } else {
        systemText = `【角色】：亲切真实的个人号博主。\n${commonRules}\n1. 语气口语化。2. 适当发挥。`;
    }

    if (personaPrompt) systemText += `\n\n【风格指令】:\n${personaPrompt}`;

    if (count > 1) {
        systemText += `\n\n🚨 **批量生成指令**:\n请生成 ${count} 篇角度不同的笔记。输出格式：\n### 方案1\n标题：...\n正文：...\n### 方案2...`;
    }

    try {
        const { client, modelName } = await getAIClient();
        const fileParts = await Promise.all(files.map(prepareFilePart));
        
        const response = await client.models.generateContentStream({
            model: modelName, 
            contents: { parts: [{ text: context || "开始创作。" }, ...fileParts] },
            config: {
                systemInstruction: systemText,
                temperature: fidelity === FidelityMode.STRICT ? 0.2 : 0.9 
            }
        });

        let fullText = "";
        for await (const chunk of response) {
            const text = chunk.text;
            if (text) {
                fullText += text;
                onToken(cleanText(fullText), "");
            }
        }

        let parsedNotes: BulkNote[] = [];
        if (count > 1) {
            parsedNotes = parseBulkNotes(cleanText(fullText));
        }

        return { dialogueText: cleanText(fullText), thought: "", notes: parsedNotes };
    } catch (e: any) {
        return { dialogueText: `生成出错: ${e.message}`, thought: "", notes: [] };
    }
};

export const streamPersonaAnalysis = async (samples: string, onToken: (text: string) => void): Promise<PersonaAnalysis> => {
    try {
        const { client, modelName } = await getAIClient();
        const prompt = `分析以下笔记的人设风格. 必须使用全中文输出. 严禁出现任何英文说明. Notes:\n${samples}`;
        const response = await client.models.generateContent({
            model: modelName, 
            contents: prompt,
            config: {
                systemInstruction: ANALYSIS_SYSTEM_PROMPT,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        tone: { type: Type.STRING },
                        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                        emojiDensity: { type: Type.STRING },
                        structure: { type: Type.STRING },
                        writerPersonaPrompt: { type: Type.STRING }
                    },
                    required: ["tone", "keywords", "emojiDensity", "structure", "writerPersonaPrompt"]
                }
            }
        });
        const resultText = response.text || "{}";
        onToken(resultText);
        return extractAndParseJSON(resultText) || { tone: "默认" };
    } catch (e: any) {
        console.error("Persona Analysis Error", e);
        return { tone: "分析失败", keywords: [], emojiDensity: "", structure: "", writerPersonaPrompt: "" };
    }
};

// 🟢 核心修复：在测试连接中明确返回 Key 和 URL，回答用户的“到底是哪个API”的问题
export const testConnection = async () => {
    let activeConfig = { key: '未知', url: '未知' };
    
    try {
        const { client, modelName, apiKey, baseUrl } = await getAIClient(); 
        
        // 显式暴露当前使用的 Key 和 URL
        activeConfig.key = apiKey ? `${apiKey.substring(0, 8)}******` : "未读取到";
        activeConfig.url = baseUrl || "Google Official (未配置转发)";

        const response = await client.models.generateContent({
            model: modelName, 
            contents: 'OK',
        });
        
        const text = response.text;
        
        if (text) {
             return { success: true, message: `✅ 验证通过\n----------------\n[当前使用 Key]: ${activeConfig.key}\n[当前请求网关]: ${activeConfig.url}\n[AI 响应内容]: ${text.trim().substring(0, 20)}...` };
        } else {
             return { success: false, message: `❌ 连接建立但无内容返回\n[Key]: ${activeConfig.key}` };
        }
    } catch (e: any) {
        let err = e.message || '未知错误';
        
        if (err.includes('404')) err = '404 (模型版本不存在/路径错误)';
        if (err.includes('401')) err = '401 (API Key 无效/未授权)';
        if (err.includes('429')) err = '429 (请求过多/额度耗尽)';
        if (err.includes('Failed to fetch') || err.includes('NetworkError')) {
             err = `网络连接失败 (无法连接到 ${activeConfig.url})`;
        }

        return { success: false, message: `❌ 连接失败\n----------------\n[错误信息]: ${err}\n[尝试连接]: ${activeConfig.url}\n[使用密钥]: ${activeConfig.key}` };
    }
};
