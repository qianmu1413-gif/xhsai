
import { FidelityMode, PersonaAnalysis, BulkNote, AttachedFile } from "../types";
import { configRepo } from "./repository";
import { ANALYSIS_SYSTEM_PROMPT } from "../constants";
import mammoth from "mammoth";
import { GoogleGenAI, Type } from "@google/genai";

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
            try { blob = await fetchUrlAsBlob(file.data); mimeType = blob.type || mimeType; } 
            catch (fetchErr: any) { return { text: `[系统警告: 附件 "${file.name}" 读取失败。]` }; }
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

// 🟢 初始化 AI Client
const getAIClient = async () => {
    const config = await configRepo.getSystemConfig();
    const apiKey = config.gemini.apiKey;
    let baseUrl = config.gemini.baseUrl;

    if (!apiKey) throw new Error("❌ 未配置 API Key");

    const clientOptions: any = { apiKey: apiKey };

    if (baseUrl && baseUrl.trim() !== "") {
        if (!baseUrl.match(/^https?:\/\//)) baseUrl = `https://${baseUrl}`;
        baseUrl = baseUrl.replace(/\/$/, '');
        
        // 核心修复：显式将 Base URL 传递给 SDK 配置
        clientOptions.baseUrl = baseUrl;
    }

    console.log(`[Matrix System] AI Client Init\nURL: ${baseUrl || 'Google Default'}\nKey: ${apiKey.substring(0,8)}...`);

    return {
        client: new GoogleGenAI(clientOptions),
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
    } catch (e: any) { return `分析过程发生错误: ${e.message}`; }
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
    const wordCountConstraint = `生成的笔记正文内容（不含结尾标签）必须严格控制在 **${wordLimit} 字以内**。`;
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
        if (count > 1) parsedNotes = parseBulkNotes(cleanText(fullText));
        return { dialogueText: cleanText(fullText), thought: "", notes: parsedNotes };
    } catch (e: any) { return { dialogueText: `生成出错: ${e.message}`, thought: "", notes: [] }; }
};

export const streamPersonaAnalysis = async (samples: string, onToken: (text: string) => void): Promise<PersonaAnalysis> => {
    try {
        const { client, modelName } = await getAIClient();
        const prompt = `分析以下笔记的人设风格. 必须使用全中文输出. Notes:\n${samples}`;
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
    } catch (e: any) { return { tone: "分析失败", keywords: [], emojiDensity: "", structure: "", writerPersonaPrompt: "" }; }
};

// 🟢 测试连接：使用原生 Fetch 确保完全绕过 SDK 逻辑，验证网关连通性
export const testConnection = async () => {
    let activeConfig = { key: '未知', url: '未知', model: '未知' };
    
    try {
        const config = await configRepo.getSystemConfig();
        const apiKey = config.gemini.apiKey;
        let baseUrl = config.gemini.baseUrl;
        const model = config.gemini.model || 'gemini-3-flash-preview';

        if (!apiKey) return { success: false, message: "❌ API Key 为空" };

        if (baseUrl && baseUrl.trim() !== "") {
            if (!baseUrl.match(/^https?:\/\//)) baseUrl = `https://${baseUrl}`;
            baseUrl = baseUrl.replace(/\/$/, '');
        } else {
            baseUrl = "https://generativelanguage.googleapis.com";
        }

        activeConfig = { key: apiKey, url: baseUrl, model: model };

        // 构造测试请求 (Raw HTTP)
        const targetUrl = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{ parts: [{ text: "Respond with 'OK'" }] }]
        };

        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            let errorMsg = JSON.stringify(data.error || data);
            if (res.status === 404) errorMsg = "404 Not Found (检查模型名称或网关地址)";
            if (res.status === 400) errorMsg = "400 Bad Request (Key 无效或格式错误)";
            return { 
                success: false, 
                message: `❌ HTTP 请求失败 (${res.status})\nURL: ${targetUrl}\nResponse: ${errorMsg}` 
            };
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No Content";
        
        return { 
            success: true, 
            message: `✅ HTTP 直连验证成功\n----------------\n[URL]: ${targetUrl}\n[Key]: ${apiKey.substring(0,8)}******\n[Response]: ${text}` 
        };

    } catch (e: any) {
        return { 
            success: false, 
            message: `❌ 网络错误 (Raw Fetch Failed)\nError: ${e.message}\nTarget: ${activeConfig.url}` 
        };
    }
};
