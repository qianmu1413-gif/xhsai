
import { FidelityMode, PersonaAnalysis, BulkNote, AttachedFile } from "../types";
import { configRepo } from "./repository";
import { ANALYSIS_SYSTEM_PROMPT } from "../constants";
import mammoth from "mammoth";
import { GoogleGenAI, Type } from "@google/genai";

// 协议分隔符
const DATA_MARKER = "###MATRIX_DATA_START###";

// --- 文本清洗工具 (缓冲区清洗) ---
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

// 🛡️ Safe ArrayBuffer extraction (Compatible with old browsers & non-standard Blobs)
const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        if (!(blob instanceof Blob)) {
            return reject(new Error("Input is not a Blob"));
        }
        // Prefer standard method if available and robust
        if (typeof blob.arrayBuffer === 'function') {
            blob.arrayBuffer().then(resolve).catch(() => {
                // Fallback to FileReader if arrayBuffer() fails (e.g. some polyfills)
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as ArrayBuffer);
                reader.onerror = () => reject(new Error("FileReader failed to read ArrayBuffer"));
                reader.readAsArrayBuffer(blob);
            });
        } else {
            // Fallback for older environments
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(new Error("FileReader failed to read ArrayBuffer"));
            reader.readAsArrayBuffer(blob);
        }
    });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        // 安全检查
        if (!blob || !(blob instanceof Blob)) {
             return reject(new Error("File blob is empty or invalid type"));
        }
        const reader = new FileReader();
        reader.onload = () => {
             const result = reader.result as string;
             // 兼容不同浏览器返回格式，确保只取 base64 部分
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
    // 🛡️ 核心修复：添加时间戳，强制浏览器忽略缓存，解决“刷新后CORS报错”的问题
    const cleanUrl = url.split('?')[0]; 
    const timestampUrl = `${cleanUrl}?_t=${Date.now()}`; 

    // 1. 尝试直连 (带时间戳)
    try {
        const response = await fetch(timestampUrl, { 
            cache: 'no-store', 
            mode: 'cors',
            credentials: 'omit'  // 不发送 Cookie，防止身份验证导致的 CORS 失败
        }); 
        if (response.ok) return await response.blob();
        if (response.status === 403) throw new Error("403 Forbidden");
    } catch (e: any) { 
        if (e.message.includes('403')) {
            throw new Error("403 权限拒绝: 请检查腾讯云 COS 的【防盗链】是否设置了允许空 Referer");
        }
    }

    // 2. 尝试代理 1 (corsproxy.io) - 专门解决 CORS 问题
    try {
        // 代理也加上原始 URL，不加时间戳防止破坏签名(如果是私有桶)
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) return await res.blob();
    } catch (e) {
        // console.warn("Proxy 1 failed...", e);
    }

    // 3. 尝试代理 2 (allorigins.win) - 备用线路
    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) return await res.blob();
    } catch (e) {
        // console.warn("Proxy 2 failed...", e);
    }

    throw new Error("无法从云端下载文件 (可能原因: 防盗链拦截、CORS配置未生效或浏览器缓存锁死)");
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

// 🟢 PDF 解析工具 (依赖 index.html 中的 pdf.js)
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
            const maxPages = Math.min(pdf.numPages, 15); // 限制页数防止过载
            
            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += `[第${i}页]: ${pageText}\n`;
            }
            return fullText;
        }
    } catch (e) {
        console.error("PDF Parse Error", e);
    }
    return "";
};

const prepareFilePart = async (file: AttachedFile): Promise<any> => {
    try {
        let mimeType = file.mimeType || 'text/plain';
        let base64Data = "";
        
        // 🛡️ 核心修复: JSON序列化后的 file 对象会变成空对象 {}，必须通过 instanceof Blob 过滤
        let blob: Blob | undefined = (file.file instanceof Blob) ? file.file : undefined;

        // 1. 如果有有效的 File/Blob 对象 (刚上传，内存中)，直接使用
        if (blob) {
            mimeType = blob.type || mimeType;
        } 
        // 2. 如果只有 URL (页面刷新后，或者 file 对象无效)，尝试下载 Blob
        else if (file.data.startsWith('http')) {
            try {
                blob = await fetchUrlAsBlob(file.data);
                mimeType = blob.type || mimeType; // 更新真实的 MIME
            } catch (fetchErr: any) {
                console.warn(`Remote fetch failed for ${file.name}:`, fetchErr);
                // 🟢 智能降级：返回给 AI 一个明确的 System Prompt
                return { 
                    text: `[系统警告: 附件 "${file.name}" 读取失败。\n错误原因: ${fetchErr.message}。\n请告知用户："抱歉，我无法读取历史文件 ${file.name}。通常是因为云存储连接超时，请尝试**删除该附件并重新上传**。"]` 
                };
            }
        }
        // 3. 如果是 Base64 (旧数据)
        else if (file.data.startsWith('data:')) {
            const parts = file.data.split(',');
            base64Data = parts[1];
            // 尝试恢复 blob 用于 PDF 解析
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

        // 🟢 PDF 智能处理
        if (mimeType.includes('pdf') || file.name.endsWith('.pdf')) {
            if (blob) {
                const pdfText = await extractPdfText(blob);
                if (pdfText && pdfText.trim().length > 20) {
                     return { text: `[PDF文档内容 ${file.name}]:\n${pdfText}` };
                }
            }
            // 降级：如果解析不出文本，尝试发图片 (Base64)
            if (base64Data) return { inlineData: { mimeType: 'application/pdf', data: base64Data } };
            if (blob) return { inlineData: { mimeType: 'application/pdf', data: await blobToBase64(blob) } };
        } 
        
        // 图片
        else if (mimeType.startsWith('image/')) {
            if (base64Data) return { inlineData: { mimeType, data: base64Data } };
            if (blob) return { inlineData: { mimeType, data: await blobToBase64(blob) } };
        } 
        
        // DOCX
        else if (file.name.endsWith('.docx') && blob) {
            return { text: `[文档内容 ${file.name}]:\n${await extractDocxText(blob)}` };
        } 
        
        // 纯文本
        else if (blob) {
            // text() also needs to be handled if blob is not standard, but assuming blobToBase64 check passed
            return { text: `[文档内容 ${file.name}]:\n${await blob.text()}` };
        }
        
        return { text: `[未知文件类型: ${file.name}]` };

    } catch (e: any) { 
        console.error(`File processing error for ${file.name}:`, e);
        return { text: `[文件处理错误: ${file.name} - ${e.message}]` }; 
    }
};

const getAIClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const analyzeMaterials = async (files: AttachedFile[]): Promise<string> => {
    if (files.length === 0) return "无文件可分析";
    const ai = getAIClient();
    try {
        const fileParts = await Promise.all(files.map(prepareFilePart));
        const prompt = `分析提供的素材，提取核心营销卖点。全中文输出。结构化展示核心卖点、目标人群和素材金句。`;
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: { parts: [{ text: prompt }, ...fileParts] },
            config: { temperature: 0.2 }
        });
        return cleanText(response.text || "分析失败");
    } catch (e: any) {
        return `分析过程发生错误: ${e.message || '未知错误'}`;
    }
};

// 解析批量生成的笔记
const parseBulkNotes = (text: string): BulkNote[] => {
    const notes: BulkNote[] = [];
    // 匹配 "### 方案N" 或 "### 笔记N" 这样的分隔符
    const parts = text.split(/###\s*(?:方案|笔记|Version)\s*\d+/i);
    
    // 忽略第一个空部分（如果文本以分隔符开头）
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;

        // 尝试提取标题和正文
        // 格式通常是 "标题：xxx \n 正文：xxx"
        let title = "";
        let content = "";

        const titleMatch = part.match(/(?:标题|Title)[:：]\s*(.*?)(?:\n|$)/i);
        if (titleMatch) {
            title = titleMatch[1].trim();
            // 剩下的部分，去掉标题行就是正文
            content = part.replace(titleMatch[0], "").trim();
            // 去掉可能的 "正文：" 前缀
            content = content.replace(/^(?:正文|Content)[:：]\s*/i, "").trim();
        } else {
            // 如果没有明确的标题标签，取第一行做标题
            const lines = part.split('\n');
            title = lines[0].trim();
            content = lines.slice(1).join('\n').trim();
        }

        if (title || content) {
            notes.push({ title, content });
        }
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
    const ai = getAIClient();
    
    // 极致的字数硬约束
    const wordCountConstraint = `
🚨 **字数硬性指标 (非常重要)**:
生成的笔记正文内容（不含结尾标签）必须严格控制在 **${wordLimit} 字以内**。
- 如果目标是短篇，请务必精炼，直击痛点。
- 如果目标是长篇，请丰富细节，增强沉浸感。
- **严禁超出或大幅少于设定字数，请以此字数为基准进行排版。**
`;

    const chineseStrictRules = `
🚨 **内容创作铁律**:
1. 语言：必须全中文。
2. 标题：吸睛且控制在 20 字以内。
3. 结构：符合小红书分段习惯，每段配有 Emoji。
${wordCountConstraint}
`;

    const commonRules = `🚨 **核心规范**: 1. 严禁输出 <thinking> 标签。2. 语气符合小红书博主身份。${chineseStrictRules}`;
    
    let systemText = "";
    if (fidelity === FidelityMode.STRICT) {
        systemText = `【角色】：你是一个专业、严谨的内容重构专家。你的任务是基于提供的素材撰写笔记，而不是自由创作。\n${commonRules}\n🚨 **严谨模式规则 (Strict Mode)**:\n1. **绝对忠实于素材**：你只能使用用户提供的【背景】、【文档内容】和【图片】中的信息。\n2. **严禁虚构 (No Hallucination)**：严禁编造素材中未提及的数据、故事、参数或细节。如果素材信息不足，请侧重于强化已有信息的表达，而不要捏造新信息。\n3. 语气权威，逻辑严密，不使用过于浮夸的形容词。`;
    } else {
        systemText = `【角色】：你是一个亲切、真实的个人号小红书博主。\n${commonRules}\n1. 语气口语化、亲和力强。2. 可以适当发挥想象力补充生活化细节，强调个人感受。`;
    }

    if (personaPrompt) {
        systemText += `\n\n【风格指令】:\n${personaPrompt}`;
    }

    // 🟢 批量生成的核心指令注入
    if (count > 1) {
        systemText += `\n\n🚨 **批量生成指令**:\n请务必生成 **${count}** 篇完全不同的笔记方案。
请严格按照以下格式输出，以便系统解析：
### 方案1
标题：(方案1的标题)
正文：(方案1的内容)

### 方案2
标题：(方案2的标题)
正文：(方案2的内容)

...以此类推。不要包含其他开场白或结束语。`;
    }

    try {
        const fileParts = await Promise.all(files.map(prepareFilePart));
        
        const response = await ai.models.generateContentStream({
            model: 'gemini-3-pro-preview',
            contents: { parts: [{ text: context || "请根据提供的背景和资料开始创作。" }, ...fileParts] },
            config: {
                systemInstruction: systemText,
                temperature: fidelity === FidelityMode.STRICT ? 0.2 : 0.85
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

        // 🟢 流式结束后，解析批量笔记
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
    const ai = getAIClient();
    const prompt = `分析以下笔记的人设风格. 必须使用全中文输出. 严禁出现任何英文说明. Notes:\n${samples}`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
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

export const testConnection = async () => {
    try {
        const ai = getAIClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'ping',
            config: { thinkingConfig: { thinkingBudget: 0 } }
        });
        return { success: !!response.text, message: response.text ? "连接正常" : "收到空响应" };
    } catch (e: any) {
        return { success: false, message: e.message || "连接发生未知错误" };
    }
};
