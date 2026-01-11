
import { FidelityMode, PersonaAnalysis, BulkNote, AttachedFile, SystemConfig } from "../types";
import { configRepo } from "./repository";
import { ANALYSIS_SYSTEM_PROMPT } from "../constants";
import mammoth from "mammoth";

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

// 🟢 转换为 OpenAI 兼容格式的消息内容
const prepareOpenAIPart = async (file: AttachedFile): Promise<any> => {
    try {
        let mimeType = file.mimeType || 'text/plain';
        let base64Data = "";
        let blob: Blob | undefined = (file.file instanceof Blob) ? file.file : undefined;

        if (blob) { mimeType = blob.type || mimeType; } 
        else if (file.data.startsWith('http')) {
            try { blob = await fetchUrlAsBlob(file.data); mimeType = blob.type || mimeType; } catch (fetchErr) { return { type: "text", text: `[文件读取失败: ${file.name}]` }; }
        }
        else if (file.data.startsWith('data:')) {
            const parts = file.data.split(',');
            base64Data = parts[1];
        }

        if (!blob && !base64Data) return { type: "text", text: `[读取失败: ${file.name}]` };

        // 1. PDF/DOCX (OpenAI Vision 不直接支持 PDF，转为纯文本)
        if (mimeType.includes('pdf') || file.name.endsWith('.pdf')) {
            if (blob) {
                const pdfText = await extractPdfText(blob);
                if (pdfText && pdfText.trim().length > 20) return { type: "text", text: `[PDF内容: ${file.name}]:\n${pdfText}` };
            }
            return { type: "text", text: `[PDF解析失败: ${file.name}]` };
        } 
        else if (file.name.endsWith('.docx') && blob) {
            const docxText = await extractDocxText(blob);
            return { type: "text", text: `[DOCX内容: ${file.name}]:\n${docxText}` };
        }
        // 2. Images (OpenAI Vision Format)
        else if (mimeType.startsWith('image/')) {
            let finalBase64 = base64Data;
            if (!finalBase64 && blob) finalBase64 = await blobToBase64(blob);
            if (finalBase64) {
                 return {
                     type: "image_url",
                     image_url: {
                         url: `data:${mimeType};base64,${finalBase64}`
                     }
                 };
            }
        } 
        // 3. Plain Text
        else if (blob) {
            return { type: "text", text: `[文本内容: ${file.name}]:\n${await blob.text()}` };
        }

        return { type: "text", text: `[未知类型: ${file.name}]` };

    } catch (e) { return { type: "text", text: `[处理错误: ${file.name}]` }; }
};


// 🟢 核心请求函数 (使用 Fetch + OpenAI 协议)
const callOpenAI = async (
    config: SystemConfig, 
    messages: any[], 
    stream: boolean, 
    onToken?: (text: string) => void,
    responseFormat?: any
) => {
    // 1. Config Preparation
    let apiKey = (config.gemini.apiKey || "").trim();
    let baseUrl = (config.gemini.baseUrl || "https://api.vectorengine.ai/v1").trim();
    const model = (config.gemini.model || "gemini-3-flash-preview").trim();

    if (!apiKey) throw new Error("API Key 未配置");
    
    // Normalize URL: Ensure no trailing slash, add /chat/completions
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    if (!baseUrl.endsWith('/v1')) {
         // Some users might forget /v1, but strict ones include it.
         // Given the prompt explicitly said "https://api.vectorengine.ai/v1", we assume the user puts that in baseUrl.
    }
    const endpoint = `${baseUrl}/chat/completions`;

    // 2. Request Body
    const body: any = {
        model: model,
        messages: messages,
        stream: stream
    };
    
    if (responseFormat) {
        // Only add if explicitly requested (some models might strictly require it or not support it)
        body.response_format = responseFormat;
    }

    // 3. Execute Fetch
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`请求失败 (${response.status}): ${errText.substring(0, 200)}`);
    }

    // 4. Handle Response
    if (stream && onToken) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        if (!reader) throw new Error("无法读取流响应");

        let buffer = "";
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ""; // Keep incomplete line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (trimmed.startsWith('data: ')) {
                    try {
                        const jsonStr = trimmed.slice(6);
                        const json = JSON.parse(jsonStr);
                        const content = json.choices?.[0]?.delta?.content;
                        if (content) {
                            fullText += content;
                            onToken(content); // Pass Delta
                        }
                    } catch (e) {
                        console.warn("Stream Parse Error:", e);
                    }
                }
            }
        }
        return fullText;
    } else {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        if (!content && json.error) throw new Error(json.error.message);
        return content || "";
    }
};

// --- 业务函数 ---

export const analyzeMaterials = async (files: AttachedFile[]): Promise<string> => {
    if (files.length === 0) return "无文件";
    try {
        const config = await configRepo.getSystemConfig();
        const fileParts = await Promise.all(files.map(prepareOpenAIPart));
        
        const messages = [
            {
                role: "user",
                content: [
                    { type: "text", text: "请详细分析这些素材的卖点、核心信息以及适合的小红书营销角度。" },
                    ...fileParts
                ]
            }
        ];

        const text = await callOpenAI(config, messages, false);
        return cleanText(text || "分析失败");
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
        const fileParts = await Promise.all(files.map(prepareOpenAIPart));
        
        const messages = [
            { role: "system", content: systemText },
            { 
                role: "user", 
                content: [
                    { type: "text", text: context },
                    ...fileParts
                ]
            }
        ];

        let accumulatedText = "";

        await callOpenAI(config, messages, true, (delta) => {
            accumulatedText += delta;
            // The existing UI expects the full text to be passed to onToken for replacement
            onToken(cleanText(accumulatedText), "");
        });

        const cleaned = cleanText(accumulatedText);
        let parsedNotes = count > 1 ? parseBulkNotes(cleaned) : [parseSingleNote(cleaned)].filter(n => n) as BulkNote[];
        return { dialogueText: cleaned, thought: "", notes: parsedNotes };

    } catch (e: any) {
        let errorMsg = e.message || "未知错误";
        if (errorMsg.includes('400')) errorMsg += "\n(请检查 Base URL 是否为 OpenAI 兼容格式，如 /v1)";
        return { dialogueText: `生成出错: ${errorMsg}`, thought: "", notes: [] };
    }
};

export const streamPersonaAnalysis = async (samples: string, onToken: (text: string) => void): Promise<PersonaAnalysis> => {
    try {
        const config = await configRepo.getSystemConfig();
        const messages = [
            { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
            { role: "user", content: `Analyze persona: ${samples}` }
        ];

        // Try to use JSON mode if supported by the gateway/model
        const text = await callOpenAI(config, messages, false, undefined, { type: "json_object" });
        
        onToken(text);
        return extractAndParseJSON(text) || { tone: "默认" };
    } catch (e: any) {
        return { tone: "分析失败", keywords: [], emojiDensity: "", structure: "", writerPersonaPrompt: "" };
    }
};

export const testConnection = async (inputConfig?: SystemConfig) => {
    try {
        const config = inputConfig || await configRepo.getSystemConfig();
        const messages = [{ role: "user", content: "ping" }];
        
        const text = await callOpenAI(config, messages, false);
        
        return { success: !!text, message: text ? `✅ 连接成功: ${text.substring(0, 30)}...` : "❌ 收到空响应" };

    } catch (e: any) {
        let msg = e.message || "未知错误";
        if (msg.includes('404')) msg += "\n(请检查 Base URL 是否正确，需包含 /v1)";
        return { success: false, message: msg };
    }
};
