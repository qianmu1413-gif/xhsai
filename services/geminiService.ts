
import { FidelityMode, PersonaAnalysis, BulkNote, AttachedFile } from "../types";
import { configRepo } from "./repository";
import { ANALYSIS_SYSTEM_PROMPT } from "../constants";
import mammoth from "mammoth";
import { GoogleGenAI, Type } from "@google/genai";

// ==========================================
// 🛠️ Custom Proxy Client (Robust Gateway Support)
// ==========================================
class ProxyClient {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string, baseUrl: string) {
        this.apiKey = apiKey;
        // Ensure valid base URL format (remove trailing slash)
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    get models() {
        return {
            generateContent: async (args: any) => this.generateContent(args),
            generateContentStream: async (args: any) => this.generateContentStream(args)
        };
    }

    private normalizeContents(contents: any) {
        // SDK accepts various formats, REST expects Content[]
        // If it's a simple string or object, wrap it in an array
        return Array.isArray(contents) ? contents : [contents];
    }

    // 🟢 核心修复：格式化 System Instruction
    // 中转网关通常要求严格的 { parts: [{ text: "" }] } 结构，不支持纯字符串
    private formatSystemInstruction(instruction: any) {
        if (!instruction) return undefined;
        
        // 如果已经是纯字符串，封装成对象
        if (typeof instruction === 'string') {
            return { parts: [{ text: instruction }] };
        }
        
        // 如果已经是对象但没有 parts (兼容性处理)，尝试修复
        if (typeof instruction === 'object' && !instruction.parts && !instruction.role) {
             return { parts: [{ text: JSON.stringify(instruction) }] };
        }

        return instruction;
    }

    private async generateContent(args: any) {
        const { model, contents, config } = args;
        const url = `${this.baseUrl}/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        
        // 分离 systemInstruction 和其他配置
        const { systemInstruction, ...genConfig } = config || {};

        const payload = {
            contents: this.normalizeContents(contents),
            generationConfig: genConfig,
            systemInstruction: this.formatSystemInstruction(systemInstruction)
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                // Add header auth support for gateways that strip query params
                'x-goog-api-key': this.apiKey 
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Proxy Error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        
        // Add SDK-like .text getter
        return {
            ...data,
            get text() {
                return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }
        };
    }

    private async *generateContentStream(args: any) {
        const { model, contents, config } = args;
        // Use SSE (Server-Sent Events) for reliable streaming across proxies
        const url = `${this.baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
        
        // 分离 systemInstruction 和其他配置
        const { systemInstruction, ...genConfig } = config || {};

        const payload = {
            contents: this.normalizeContents(contents),
            generationConfig: genConfig,
            systemInstruction: this.formatSystemInstruction(systemInstruction)
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                // Add header auth support for gateways that strip query params
                'x-goog-api-key': this.apiKey 
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
             const errText = await response.text();
             throw new Error(`Proxy Stream Error (${response.status}): ${errText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) return;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; 
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6).trim();
                    if (jsonStr === '[DONE]') return;
                    try {
                        const data = JSON.parse(jsonStr);
                        yield {
                            ...data,
                            get text() { return data.candidates?.[0]?.content?.parts?.[0]?.text || ""; }
                        };
                    } catch (e) {
                        // Ignore parse errors for partial chunks
                    }
                }
            }
        }
    }
}

// --- Text Cleaning Utilities ---
const cleanText = (text: string | undefined): string => {
    if (!text) return "";
    let cleaned = text;

    // 🔥 1. 移除思维链标签
    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
    cleaned = cleaned.replace(/\[\[THOUGHT\]\][\s\S]*?\[\[\/THOUGHT\]\]/gi, "");
    cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");
    
    // 🔥 2. 靶向移除特定的英文旁白模式
    const narrativeRegex = /^(My current task|I am|I'm|I have|I've|Refining|Developing|Creating|Now,|My goal|This post|The content|Based on)[\s\S]*?(\n|$)/gim;
    cleaned = cleaned.replace(narrativeRegex, "");
    
    // 🔥 3. 【中文锚点截断法】 - 终极过滤方案
    // 逻辑：寻找第一个中文字符。如果前面有大段英文，直接切除。
    const lines = cleaned.split('\n');
    const filteredLines = [];
    let contentStarted = false;
    
    // 检测中文的正则
    const hasChinese = /[\u4e00-\u9fa5]/;
    // 检测 Emoji 的正则
    const hasEmoji = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;
    
    for (const line of lines) {
         const trimmed = line.trim();
         if (!trimmed) continue;

         if (!contentStarted) {
             // 如果这一行包含中文，标记正文开始
             if (hasChinese.test(trimmed)) {
                 contentStarted = true;
                 filteredLines.push(line);
             } 
             // 如果是 Emoji 开头且没有大量英文（防止 "Analyzing 🧐..." 这种），也标记开始
             else if (hasEmoji.test(trimmed) && !/[a-zA-Z]{5,}/.test(trimmed)) {
                  contentStarted = true;
                  filteredLines.push(line);
             }
             // 否则，这行就是英文废话，丢弃
         } else {
             // 正文已经开始，保留后续所有内容
             filteredLines.push(line);
         }
    }
    
    if (filteredLines.length > 0) {
        cleaned = filteredLines.join('\n');
    }

    // 最后的清理
    cleaned = cleaned.replace(/^#+\s*(Analysis|Thinking Process|Plan|Strategy).*$/gmi, "");
    cleaned = cleaned.replace(/\*\*Persona\*\*:/gi, "**人设定位**:");
    cleaned = cleaned.replace(/\*\*Topic\*\*:/gi, "**主题分析**:");
    cleaned = cleaned.replace(/\*\*Target Audience\*\*:/gi, "**目标人群**:");
    
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

// --- File Handling Helpers ---
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

// 🟢 Smart Client Factory
// Switches between official SDK and ProxyClient based on configuration
const getAIClient = async () => {
    const config = await configRepo.getSystemConfig();
    const apiKey = config.gemini.apiKey;
    let baseUrl = config.gemini.baseUrl;

    if (!apiKey) throw new Error("❌ 未配置 API Key");

    const useProxy = baseUrl && baseUrl.trim() !== "" && !baseUrl.includes("googleapis.com");
    
    if (useProxy && baseUrl) {
        console.log(`[Matrix System] Using Custom Gateway: ${baseUrl}`);
        return {
            client: new ProxyClient(apiKey, baseUrl), // Use custom implementation
            modelName: config.gemini.model
        };
    }

    console.log(`[Matrix System] Using Google Official SDK`);
    return {
        client: new GoogleGenAI({ apiKey: apiKey }), // Use official SDK
        modelName: config.gemini.model
    };
};

export const analyzeMaterials = async (files: AttachedFile[]): Promise<string> => {
    if (files.length === 0) return "无文件可分析";
    try {
        const { client, modelName } = await getAIClient();
        const fileParts = await Promise.all(files.map(prepareFilePart));
        // 🔥 强化中文输出指令 - 强制翻译模式
        const prompt = `Task: Analyze the provided materials.
Output Language: Simplified Chinese (简体中文).

CRITICAL INSTRUCTION: 
Even if the source material is in English, you MUST translate your analysis into Simplified Chinese.
Do NOT output any English text in the final response.
Start the response immediately with the analysis in Chinese.`;

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
    
    // 🔥 核弹级 System Instruction：定义为 API，开启静默模式，禁止旁白
    const strictSystemPrompt = `Role: Professional Chinese Copywriting Engine for Xiaohongshu (RedNote).
Task: Generate high-quality social media content based on the user's input.

⚠️ FATAL RULES (SILENT MODE ON):
1. **LANGUAGE**: Output MUST be in **Simplified Chinese (简体中文)** ONLY.
2. **NO NARRATION**: Absolutely NO "I am writing...", "My current task...", "Refining...". You are NOT a chatbot.
3. **NO ANALYSIS**: Do NOT output your thinking process or draft plan.
4. **FORMAT**: Start strictly with the **Title** (containing Emojis).
5. **ACTION**: Just output the final result directly.

${wordCountConstraint}
`;
    
    let systemText = strictSystemPrompt;

    if (fidelity === FidelityMode.STRICT) {
        systemText += `\n【风格】: 严谨、专业、干货满满。`;
    } else {
        systemText += `\n【风格】: 活泼、网感强、像闺蜜聊天。`;
    }

    if (personaPrompt) systemText += `\n\n【人设指令 (Apply in Chinese)】:\n${personaPrompt}`;

    if (count > 1) {
        systemText += `\n\n【批量生成模式】: 请生成 ${count} 个不同版本。格式如下:\n### 方案1\n标题：...\n正文：...\n### 方案2...`;
    }

    try {
        const { client, modelName } = await getAIClient();
        const fileParts = await Promise.all(files.map(prepareFilePart));
        
        // 核心修改：在 User Prompt 中再次强调禁止废话
        const strictUserPrompt = `${context || "开始创作（请使用中文）。"}
        
-----------------------------------------
[STRICT OUTPUT FORMAT]
Start DIRECTLY with the Title and Content in Simplified Chinese.
DO NOT say "My task is...", "Developing content", or "Refining".
SILENCE MODE: ENABLED.
-----------------------------------------
`;

        const response = await client.models.generateContentStream({
            model: modelName, 
            contents: { parts: [{ text: strictUserPrompt }, ...fileParts] },
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
                // 实时清洗，防止用户看到英文开头
                onToken(cleanText(fullText), "");
            }
        }

        let parsedNotes: BulkNote[] = [];
        const finalCleanText = cleanText(fullText);
        if (count > 1) parsedNotes = parseBulkNotes(finalCleanText);
        return { dialogueText: finalCleanText, thought: "", notes: parsedNotes };
    } catch (e: any) { return { dialogueText: `生成出错: ${e.message}`, thought: "", notes: [] }; }
};

export const streamPersonaAnalysis = async (samples: string, onToken: (text: string) => void): Promise<PersonaAnalysis> => {
    try {
        const { client, modelName } = await getAIClient();
        // 🔥 强化中文输出指令
        const prompt = `Task: Analyze the writing style of the provided text.
Output Language: Simplified Chinese (简体中文).

Rules:
1. Translate all analysis terms (Tone, Keywords, etc.) to Chinese.
2. Do NOT output "Analyzing..." or any preamble.
3. Return the JSON object directly.

Samples:\n${samples}`;
        
        const response = await client.models.generateContent({
            model: modelName, 
            contents: prompt,
            config: {
                systemInstruction: ANALYSIS_SYSTEM_PROMPT,
                responseMimeType: "application/json",
                // Only use schema if using official SDK (ProxyClient handles raw JSON)
                responseSchema: (client instanceof GoogleGenAI) ? {
                    type: Type.OBJECT,
                    properties: {
                        tone: { type: Type.STRING },
                        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                        emojiDensity: { type: Type.STRING },
                        structure: { type: Type.STRING },
                        writerPersonaPrompt: { type: Type.STRING }
                    },
                    required: ["tone", "keywords", "emojiDensity", "structure", "writerPersonaPrompt"]
                } : undefined
            }
        });
        const resultText = response.text || "{}";
        onToken(resultText);
        return extractAndParseJSON(resultText) || { tone: "默认" };
    } catch (e: any) { return { tone: "分析失败", keywords: [], emojiDensity: "", structure: "", writerPersonaPrompt: "" }; }
};

export const testConnection = async () => {
    let activeConfig = { key: '未知', url: '未知', model: '未知' };
    
    try {
        const config = await configRepo.getSystemConfig();
        const apiKey = config.gemini.apiKey;
        let baseUrl = config.gemini.baseUrl;
        const model = config.gemini.model || 'gemini-3-flash-preview';

        if (!apiKey) return { success: false, message: "❌ API Key 为空" };

        if (baseUrl && baseUrl.trim() !== "") {
            baseUrl = baseUrl.replace(/\/$/, '');
        } else {
            baseUrl = "https://generativelanguage.googleapis.com";
        }

        activeConfig = { key: apiKey, url: baseUrl, model: model };

        // Simple REST check
        const targetUrl = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: "Respond with 'OK'" }] }]
        };

        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey // Header auth for broader compatibility
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            let errorMsg = JSON.stringify(data.error || data);
            if (res.status === 404) errorMsg = "404 Not Found (检查模型名称或网关地址是否正确)";
            if (res.status === 400) errorMsg = "400 Bad Request (Key 无效或格式错误)";
            return { 
                success: false, 
                message: `❌ 连接失败 (${res.status})\nGateway: ${baseUrl}\nResponse: ${errorMsg}` 
            };
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No Content";
        
        return { 
            success: true, 
            message: `✅ 连接成功\nGateway: ${baseUrl}\nModel: ${model}\nResponse: ${text}` 
        };

    } catch (e: any) {
        return { 
            success: false, 
            message: `❌ 网络错误 (Fetch Failed)\nError: ${e.message}\nTarget: ${activeConfig.url}` 
        };
    }
};
