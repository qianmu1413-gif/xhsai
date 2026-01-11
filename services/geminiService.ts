
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

// --- 文件处理辅助 ---
const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        if (!(blob instanceof Blob)) return reject(new Error("Input is not a Blob"));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.readAsArrayBuffer(blob);
    });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!blob || !(blob instanceof Blob)) return reject(new Error("Invalid Blob"));
        const reader = new FileReader();
        reader.onload = () => {
             const result = reader.result as string;
             resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = (e) => reject(new Error(`Read Failed: ${reader.error?.message}`));
        reader.readAsDataURL(blob);
    });
};

const fetchUrlAsBlob = async (url: string): Promise<Blob> => {
    const cleanUrl = url.split('?')[0]; 
    const timestampUrl = `${cleanUrl}?_t=${Date.now()}`; 
    try {
        const response = await fetch(timestampUrl, { cache: 'no-store', mode: 'cors', credentials: 'omit' }); 
        if (response.ok) return await response.blob();
    } catch (e) {}
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) return await res.blob();
    } catch (e) {}
    throw new Error("无法下载文件");
};

const extractDocxText = async (blob: Blob): Promise<string> => {
    try {
        const arrayBuffer = await blobToArrayBuffer(blob);
        if (mammoth) {
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value;
        }
    } catch (e) { return "[DOCX 解析失败]"; }
    return "";
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
                fullText += `[第${i}页]: ${textContent.items.map((item: any) => item.str).join(' ')}\n`;
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
                if (pdfText && pdfText.trim().length > 20) return { text: `[PDF内容]:\n${pdfText}` };
            }
            if (base64Data) return { inlineData: { mimeType: 'application/pdf', data: base64Data } };
            if (blob) return { inlineData: { mimeType: 'application/pdf', data: await blobToBase64(blob) } };
        } 
        else if (mimeType.startsWith('image/')) {
            if (base64Data) return { inlineData: { mimeType, data: base64Data } };
            if (blob) return { inlineData: { mimeType, data: await blobToBase64(blob) } };
        } 
        else if (file.name.endsWith('.docx') && blob) {
            return { text: `[DOCX内容]:\n${await extractDocxText(blob)}` };
        } 
        else if (blob) {
            return { text: `[文本内容]:\n${await blob.text()}` };
        }
        return { text: `[未知类型]` };
    } catch (e) { return { text: `[错误]` }; }
};

// 🟢 修复后的拦截器：仅针对 sk- Key 做处理
const createCustomFetch = (apiKey: string) => {
    return async (url: RequestInfo | URL, init?: RequestInit) => {
        let fetchUrlStr = url.toString();
        const fetchInit = init || {};
        
        // 判断是否为 "sk-" 开头的 Key
        const isSkKey = apiKey.startsWith('sk-');

        if (isSkKey) {
            // 1. 清除 URL 参数中的 key (这是导致 400 Invalid Key 的核心原因)
            const urlObj = new URL(fetchUrlStr);
            if (urlObj.searchParams.has('key')) {
                urlObj.searchParams.delete('key');
                fetchUrlStr = urlObj.toString();
            }

            // 2. 重构 Headers
            const headers = new Headers(fetchInit.headers || {});
            
            // 移除 Google 专用头，避免网关混淆
            if (headers.has('x-goog-api-key')) {
                headers.delete('x-goog-api-key');
            }
            
            // 注入 OpenAI 风格的鉴权
            headers.set('Authorization', `Bearer ${apiKey}`);
            headers.set('Content-Type', 'application/json');

            fetchInit.headers = headers;
        }

        return fetch(fetchUrlStr, fetchInit);
    };
};

// 🟢 Base URL 清洗工具
const cleanBaseUrl = (url: string | undefined): string | undefined => {
    if (!url || !url.trim()) return undefined;
    let clean = url.trim();
    
    // 仅移除末尾斜杠，保留用户输入的所有路径信息
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    
    return clean;
};

const getAIClient = async (overrideConfig?: SystemConfig) => {
    let apiKey: string;
    let baseUrl: string;

    if (overrideConfig) {
        apiKey = overrideConfig.gemini.apiKey;
        baseUrl = overrideConfig.gemini.baseUrl;
        console.log(`[Gemini] Test Mode: Key=${apiKey?.substring(0,4)}...`);
    } else {
        const config = await configRepo.getSystemConfig();
        apiKey = config.gemini.apiKey;
        baseUrl = config.gemini.baseUrl;
    }
    
    if (!apiKey) throw new Error("API Key 为空。请在设置中填入 Gemini API Key。");

    // 使用清洗后的 BaseURL
    const finalBaseUrl = cleanBaseUrl(baseUrl);

    return new GoogleGenAI({ 
        apiKey: apiKey,
        baseUrl: finalBaseUrl,
        fetch: createCustomFetch(apiKey) // 注入稳健的拦截器
    });
};

export const analyzeMaterials = async (files: AttachedFile[]): Promise<string> => {
    if (files.length === 0) return "无文件";
    try {
        const config = await configRepo.getSystemConfig();
        const ai = await getAIClient(config);
        const fileParts = await Promise.all(files.map(prepareFilePart));
        // 🟢 动态使用配置中的模型，不再硬编码
        const response = await ai.models.generateContent({
            model: config.gemini.model || 'gemini-3-pro-preview',
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
        let title = ""; let content = "";
        if (titleMatch) {
            title = titleMatch[1].trim();
            content = part.replace(titleMatch[0], "").trim().replace(/^(?:正文|Content)[:：]\s*/i, "").trim();
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
        return { title: titleMatch[1].trim(), content: text.replace(titleMatch[0], "").trim().replace(/^(?:正文|Content)[:：]\s*/i, "").trim() };
    }
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length > 0) return { title: lines[0], content: lines.slice(1).join('\n') };
    return null;
};

export const streamExpertGeneration = async (
    context: string, files: AttachedFile[], personaPrompt: string | undefined, fidelity: FidelityMode, count: number, wordLimit: number,
    onToken: (text: string, thought: string) => void
) => {
    const systemText = `You are a content expert. Output in Chinese. ${personaPrompt || ''} ${count > 1 ? 'Generate ' + count + ' versions via ### 方案1 format.' : 'Generate 1 version.'}`;
    try {
        const config = await configRepo.getSystemConfig();
        const ai = await getAIClient(config); 
        const fileParts = await Promise.all(files.map(prepareFilePart));
        // 🟢 动态使用配置中的模型
        const response = await ai.models.generateContentStream({
            model: config.gemini.model || 'gemini-3-pro-preview',
            contents: { parts: [{ text: context }, ...fileParts] },
            config: { systemInstruction: systemText, temperature: fidelity === FidelityMode.STRICT ? 0.2 : 0.85 }
        });

        let fullText = "";
        for await (const chunk of response) {
            if (chunk.text) {
                fullText += chunk.text;
                onToken(cleanText(fullText), "");
            }
        }
        const cleaned = cleanText(fullText);
        let parsedNotes = count > 1 ? parseBulkNotes(cleaned) : [parseSingleNote(cleaned)].filter(n => n) as BulkNote[];
        return { dialogueText: cleaned, thought: "", notes: parsedNotes };
    } catch (e: any) {
        return { dialogueText: `生成出错: ${e.message}`, thought: "", notes: [] };
    }
};

export const streamPersonaAnalysis = async (samples: string, onToken: (text: string) => void): Promise<PersonaAnalysis> => {
    try {
        const config = await configRepo.getSystemConfig();
        const ai = await getAIClient(config);
        // 🟢 动态使用配置中的模型
        const response = await ai.models.generateContent({
            model: config.gemini.model || 'gemini-3-pro-preview',
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

export const testConnection = async (inputConfig?: SystemConfig) => {
    try {
        const ai = await getAIClient(inputConfig);
        // 使用用户指定的模型进行测试，而不是写死
        const modelName = inputConfig?.gemini?.model || 'gemini-3-flash-preview';

        // 🟢 修复：移除 thinkingConfig，因为非 Gemini-3 模型不支持此参数，会导致 400 错误
        const response = await ai.models.generateContent({
            model: modelName,
            contents: 'ping',
            // config: { thinkingConfig: { thinkingBudget: 0 } } // 已移除
        });
        
        return { success: !!response.text, message: response.text ? `✅ 连接成功` : "❌ 收到空响应" };

    } catch (e: any) {
        let msg = e.message || "未知错误";
        // 智能错误诊断
        if (msg.includes('400') || msg.includes('API key not valid') || msg.includes('INVALID_ARGUMENT')) {
            msg = `[400 认证失败] Key 或参数无效。\n如果使用非 Gemini 3 模型，系统已移除 Thinking 参数以兼容旧模型。\n请检查 Key 正确性及网关兼容性。`;
        } else if (msg.includes('404')) {
            msg = `[404 路径错误] 模型未找到。\n请检查 Model 字段 (${inputConfig?.gemini?.model}) 或 Base URL 是否正确。`;
        } else if (msg.includes('Failed to fetch')) {
            msg = `[网络错误] 无法连接到服务器。\n请检查 Base URL 是否正确 (是否需要跨域/CORS 支持?)。`;
        }
        return { success: false, message: msg };
    }
};
