
import { FidelityMode, PersonaAnalysis, BulkNote, AttachedFile, SystemConfig } from "../types";
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

// --- 文件处理辅助 (保持不变) ---
const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        if (!(blob instanceof Blob)) {
            return reject(new Error("Input is not a Blob"));
        }
        if (typeof blob.arrayBuffer === 'function') {
            blob.arrayBuffer().then(resolve).catch(() => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as ArrayBuffer);
                reader.onerror = () => reject(new Error("FileReader failed to read ArrayBuffer"));
                reader.readAsArrayBuffer(blob);
            });
        } else {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(new Error("FileReader failed to read ArrayBuffer"));
            reader.readAsArrayBuffer(blob);
        }
    });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!blob || !(blob instanceof Blob)) {
             return reject(new Error("File blob is empty or invalid type"));
        }
        const reader = new FileReader();
        reader.onload = () => {
             const result = reader.result as string;
             const base64 = result.includes(',') ? result.split(',')[1] : result;
             resolve(base64);
        };
        reader.onerror = (e) => reject(new Error(`FileReader Failed: ${reader.error?.message}`));
        try {
            reader.readAsDataURL(blob);
        } catch (e: any) {
            reject(new Error(`readAsDataURL Exec Failed: ${e.message}`));
        }
    });
};

const fetchUrlAsBlob = async (url: string): Promise<Blob> => {
    const cleanUrl = url.split('?')[0]; 
    const timestampUrl = `${cleanUrl}?_t=${Date.now()}`; 
    try {
        const response = await fetch(timestampUrl, { 
            cache: 'no-store', 
            mode: 'cors',
            credentials: 'omit'
        }); 
        if (response.ok) return await response.blob();
    } catch (e) {}
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) return await res.blob();
    } catch (e) {}
    throw new Error("无法从云端下载文件");
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
            const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer, cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/', cMapPacked: true });
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
    } catch (e) {}
    return "";
};

const prepareFilePart = async (file: AttachedFile): Promise<any> => {
    try {
        let mimeType = file.mimeType || 'text/plain';
        let base64Data = "";
        let blob: Blob | undefined = (file.file instanceof Blob) ? file.file : undefined;

        if (blob) { mimeType = blob.type || mimeType; } 
        else if (file.data.startsWith('http')) {
            try { blob = await fetchUrlAsBlob(file.data); mimeType = blob.type || mimeType; } catch (fetchErr) { return { text: `[文件读取失败]` }; }
        }
        else if (file.data.startsWith('data:')) {
            const parts = file.data.split(',');
            base64Data = parts[1];
        }

        if (!blob && !base64Data) return { text: `[读取失败]` };

        if (mimeType.includes('pdf') || file.name.endsWith('.pdf')) {
            if (blob) {
                const pdfText = await extractPdfText(blob);
                if (pdfText && pdfText.trim().length > 20) return { text: `[PDF文档]:\n${pdfText}` };
            }
            if (base64Data) return { inlineData: { mimeType: 'application/pdf', data: base64Data } };
            if (blob) return { inlineData: { mimeType: 'application/pdf', data: await blobToBase64(blob) } };
        } 
        else if (mimeType.startsWith('image/')) {
            if (base64Data) return { inlineData: { mimeType, data: base64Data } };
            if (blob) return { inlineData: { mimeType, data: await blobToBase64(blob) } };
        } 
        else if (file.name.endsWith('.docx') && blob) {
            return { text: `[文档]:\n${await extractDocxText(blob)}` };
        } 
        else if (blob) {
            return { text: `[文档]:\n${await blob.text()}` };
        }
        return { text: `[未知类型]` };
    } catch (e) { return { text: `[错误]` }; }
};

const getAIClient = async (overrideConfig?: SystemConfig) => {
    let apiKey: string;
    let baseUrl: string;

    if (overrideConfig) {
        // 🟢 优先使用传入的配置
        apiKey = overrideConfig.gemini.apiKey;
        baseUrl = overrideConfig.gemini.baseUrl;
        console.log(`[Gemini] Mode: INPUT TEST | Key: ${apiKey?.substring(0,4)}... | URL: ${baseUrl || 'Default'}`);
    } else {
        const config = await configRepo.getSystemConfig();
        apiKey = config.gemini.apiKey;
        baseUrl = config.gemini.baseUrl;
    }
    
    // 🟢 关键修复：清洗 BaseURL，移除末尾斜杠
    // 新版 SDK 如果遇到带斜杠的 BaseURL 可能会构造出错误的路径 (e.g. .../v1//v1beta/models...)
    let finalBaseUrl = (baseUrl && baseUrl.trim() !== "") ? baseUrl.trim() : undefined;
    if (finalBaseUrl && finalBaseUrl.endsWith('/')) {
        finalBaseUrl = finalBaseUrl.slice(0, -1);
    }

    if (!apiKey) {
        throw new Error("API Key 为空。请在设置中填入 Gemini API Key。");
    }

    return new GoogleGenAI({ 
        apiKey: apiKey,
        baseUrl: finalBaseUrl 
    });
};

// ... (Analyze/Generate functions remain largely the same, utilizing getAIClient) ...
export const analyzeMaterials = async (files: AttachedFile[]): Promise<string> => {
    if (files.length === 0) return "无文件";
    try {
        const ai = await getAIClient();
        const fileParts = await Promise.all(files.map(prepareFilePart));
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: { parts: [{ text: "分析素材卖点" }, ...fileParts] },
        });
        return cleanText(response.text || "分析失败");
    } catch (e: any) { return `错误: ${e.message}`; }
};

const parseBulkNotes = (text: string): BulkNote[] => {
    const notes: BulkNote[] = [];
    const parts = text.split(/###\s*(?:方案|笔记|Version)\s*\d+/i);
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;
        const titleMatch = part.match(/(?:标题|Title)[:：]\s*(.*?)(?:\n|$)/i);
        let title = "";
        let content = "";
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

const parseSingleNote = (text: string): BulkNote | null => {
    if (!text) return null;
    const titleMatch = text.match(/(?:标题|Title)[:：]\s*(.*?)(?:\n|$)/i);
    if (titleMatch) {
        const title = titleMatch[1].trim();
        let content = text.replace(titleMatch[0], "").trim();
        content = content.replace(/^(?:正文|Content)[:：]\s*/i, "").trim();
        return { title, content };
    }
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length > 0) return { title: lines[0], content: lines.slice(1).join('\n') };
    return null;
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
    const systemText = `You are a content expert. Output in Chinese. ${personaPrompt || ''}
    ${count > 1 ? 'Generate ' + count + ' versions via ### 方案1 format.' : 'Generate 1 version.'}`;

    try {
        const ai = await getAIClient(); 
        const fileParts = await Promise.all(files.map(prepareFilePart));
        const response = await ai.models.generateContentStream({
            model: 'gemini-3-pro-preview',
            contents: { parts: [{ text: context }, ...fileParts] },
            config: { systemInstruction: systemText, temperature: fidelity === FidelityMode.STRICT ? 0.2 : 0.85 }
        });

        let fullText = "";
        for await (const chunk of response) {
            const text = chunk.text;
            if (text) {
                fullText += text;
                onToken(cleanText(fullText), "");
            }
        }
        const cleaned = cleanText(fullText);
        let parsedNotes: BulkNote[] = [];
        if (count > 1) { parsedNotes = parseBulkNotes(cleaned); } 
        else { const single = parseSingleNote(cleaned); if (single) parsedNotes = [single]; }
        return { dialogueText: cleaned, thought: "", notes: parsedNotes };
    } catch (e: any) {
        return { dialogueText: `生成出错: ${e.message}`, thought: "", notes: [] };
    }
};

export const streamPersonaAnalysis = async (samples: string, onToken: (text: string) => void): Promise<PersonaAnalysis> => {
    try {
        const ai = await getAIClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `Analyze persona: ${samples}`,
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
                    }
                }
            }
        });
        const resultText = response.text || "{}";
        onToken(resultText);
        return extractAndParseJSON(resultText) || { tone: "默认" };
    } catch (e: any) {
        return { tone: "分析失败", keywords: [], emojiDensity: "", structure: "", writerPersonaPrompt: "" };
    }
};

/**
 * 测试连接状态 (增强版)
 * 优先使用 inputConfig，其次使用 DB 配置
 */
export const testConnection = async (inputConfig?: SystemConfig) => {
    try {
        // 1. 尝试使用 SDK 标准测试
        const ai = await getAIClient(inputConfig);
        
        // 尝试一个极简的 Ping
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'ping',
            config: { thinkingConfig: { thinkingBudget: 0 } }
        });
        
        return { success: !!response.text, message: response.text ? "连接正常 (SDK Success)" : "收到空响应" };

    } catch (e: any) {
        let msg = e.message || "未知错误";
        const apiKey = inputConfig?.gemini?.apiKey || "";
        const baseUrl = inputConfig?.gemini?.baseUrl || "https://generativelanguage.googleapis.com";

        console.warn("[Gemini Test Failed]", e);

        // 2. 降级测试：如果是 SDK 报错，尝试直接 Fetch 验证是不是网关兼容性问题
        // 很多第三方网关 (如 OneAPI/NewAPI) 可能不兼容新版 SDK 的 strict 路径检查
        // 我们尝试手动构造一个请求看看是否通
        if (msg.includes('400') || msg.includes('404') || msg.includes('not valid')) {
             try {
                 // 尝试手动 ping 一个通用模型路径
                 let fetchUrl = baseUrl;
                 if (!fetchUrl.includes('/v1')) {
                     fetchUrl = fetchUrl.replace(/\/$/, '') + '/v1/models/gemini-3-flash-preview:generateContent';
                 }
                 // 这里的 URL 构造可能很复杂，只做简单尝试
                 if (fetchUrl.startsWith('http')) {
                     const res = await fetch(`${fetchUrl}?key=${apiKey}`, {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
                     });
                     if (res.ok) {
                         return { success: true, message: "连接成功 (Direct API Mode)。注意: SDK 可能因网关路径兼容性报错，但基础接口已通。" };
                     } else {
                         const errText = await res.text();
                         msg = `网关拒绝: ${res.status} - ${errText.substring(0, 100)}`;
                     }
                 }
             } catch (fetchErr) {
                 // Ignore fetch error, return original SDK error
             }
        }

        // 友好的错误提示
        if (msg.includes('400') || msg.includes('API key not valid')) {
            msg = `API Key 无效或网关不兼容 (400)。\n1. 检查 Key 是否正确。\n2. 如果使用自定义网关 (${baseUrl})，请确认该网关支持 gemini-3-flash-preview 模型。`;
        } else if (msg.includes('Failed to fetch')) {
             msg = `网络请求失败。请检查 Base URL 是否正确，或该网关是否需要科学上网。`;
        }
        
        return { success: false, message: msg };
    }
};
