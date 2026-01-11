
import { FidelityMode, PersonaAnalysis, BulkNote, AttachedFile, SystemConfig } from "../types";
import { configRepo } from "./repository";
import { ANALYSIS_SYSTEM_PROMPT } from "../constants";
import mammoth from "mammoth";

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
    // 🟢 强力去缓存：时间戳 + 随机数
    const timestampUrl = `${cleanUrl}?_t=${Date.now()}_${Math.random().toString(36).substring(7)}`; 
    try {
        const response = await fetch(timestampUrl, { cache: 'no-store', mode: 'cors', credentials: 'omit' }); 
        if (response.ok) return await response.blob();
    } catch (e) {}
    try {
        // Fallback to proxy
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl, { cache: 'no-store' });
        if (res.ok) return await res.blob();
    } catch (e) {}
    throw new Error("下载失败 (无法建立连接，请检查链接有效性或 CORS 配置)");
};

const extractDocxText = async (blob: Blob): Promise<string> => {
    try {
        const arrayBuffer = await blobToArrayBuffer(blob);
        if (mammoth) {
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value;
        }
    } catch (e: any) { return `ERROR:DOCX_PARSE_FAILED (${e.message})`; }
    return "";
};

// 🟢 确保 Worker 可以在任何地方被注入，带重启逻辑
const ensurePdfWorker = async () => {
    // @ts-ignore
    if (typeof window !== 'undefined') {
        // @ts-ignore
        if (!window.pdfjsLib) {
            // Last resort: Try to reload script dynamically if missing
            console.warn("PDF Lib missing, attempting hot reload...");
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.onload = resolve;
                script.onerror = resolve;
                document.head.appendChild(script);
            });
        }
        
        // @ts-ignore
        if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            // @ts-ignore
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }
};

const extractPdfText = async (blob: Blob): Promise<string> => {
    await ensurePdfWorker();
    try {
        // @ts-ignore
        if (typeof window !== 'undefined' && window.pdfjsLib) {
            const arrayBuffer = await blobToArrayBuffer(blob);
            // @ts-ignore
            const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer, cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/', cMapPacked: true });
            
            try {
                const pdf = await loadingTask.promise;
                let fullText = "";
                const maxPages = Math.min(pdf.numPages, 20); // Limit pages for performance
                for (let i = 1; i <= maxPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map((item: any) => item.str).join(' ');
                    if (pageText.trim()) {
                        fullText += `[第${i}页]: ${pageText}\n`;
                    }
                }
                
                if (!fullText.trim()) {
                    return "ERROR:PDF_SCANNED_OR_EMPTY";
                }
                return fullText;

            } catch (pdfErr: any) {
                console.error("PDF Parsing Structure Error:", pdfErr);
                if (pdfErr.name === 'PasswordException') return "ERROR:PDF_PASSWORD_PROTECTED";
                return `ERROR:PDF_INTERNAL (${pdfErr.message})`;
            }
        }
        return "ERROR:PDF_LIB_MISSING";
    } catch (e: any) {
        console.error("PDF Blob Error:", e);
        return `ERROR:PDF_LOAD_FAILED (${e.message})`; 
    }
};

// 🟢 核心：转换为 OpenAI 兼容格式的消息内容
const prepareOpenAIPart = async (file: AttachedFile): Promise<any> => {
    try {
        let mimeType = file.mimeType || 'text/plain';
        let base64Data = "";
        let blob: Blob | undefined = (file.file instanceof Blob) ? file.file : undefined;
        let usedRemote = false;

        // 🟢 FIX: Ensure proper MIME type for PDFs
        if (file.name.endsWith('.pdf') && (!mimeType || mimeType === 'application/octet-stream')) {
            mimeType = 'application/pdf';
        }

        // 🟢 FIX: Robust Blob Recovery Strategy
        if (!blob) {
            if (file.data.startsWith('http')) {
                // 1. Remote URL -> Fetch Blob
                try { 
                    blob = await fetchUrlAsBlob(file.data); 
                    mimeType = blob.type || mimeType; 
                    usedRemote = true;
                } catch (fetchErr: any) { 
                    return { type: "text", text: `[系统错误: 无法下载文件 ${file.name} - ${fetchErr.message}。请让用户重新上传]` }; 
                }
            } else if (file.data.startsWith('data:')) {
                // 2. Data URI -> Convert back to Blob
                // This fixes the issue where loaded projects only have base64 string but no blob object
                try {
                    const res = await fetch(file.data);
                    blob = await res.blob();
                    
                    // Also extract pure base64 for image usage later
                    const parts = file.data.split(',');
                    if (parts.length === 2) base64Data = parts[1];
                } catch (e) {
                    return { type: "text", text: `[系统错误: 本地缓存数据损坏 ${file.name}，请重新上传]` };
                }
            }
        } else {
            // If we already have a blob (e.g. fresh upload), we might need base64 later
            // (Base64 generation is handled on demand below for images)
        }

        if (!blob && !base64Data) return { type: "text", text: `[文件数据丢失: ${file.name}]` };

        // 1. PDF/DOCX (OpenAI Vision 不直接支持 PDF，转为纯文本)
        if (mimeType.includes('pdf') || file.name.endsWith('.pdf')) {
            if (blob) {
                let pdfText = await extractPdfText(blob);
                
                // 🟢 自动重试机制：如果解析失败且没试过远程，尝试从OSS重新下载
                if (pdfText.startsWith('ERROR:') && !usedRemote && file.data.startsWith('http')) {
                    try {
                        console.log(`[GeminiService] PDF本地解析失败 (${pdfText})，尝试从 OSS 重新下载: ${file.name}`);
                        const remoteBlob = await fetchUrlAsBlob(file.data);
                        const remoteText = await extractPdfText(remoteBlob);
                        if (!remoteText.startsWith('ERROR:')) {
                            pdfText = remoteText;
                        } else {
                            console.warn(`[GeminiService] OSS 远程文件解析也失败了: ${remoteText}`);
                        }
                    } catch (retryErr) {
                        console.warn("[GeminiService] OSS 重试下载失败:", retryErr);
                    }
                }

                // 🟢 详细错误处理
                if (pdfText.startsWith('ERROR:')) {
                    const code = pdfText.split(':')[1];
                    let reason = pdfText;
                    if (code === 'PDF_SCANNED_OR_EMPTY') reason = "文件看起来是纯图片(扫描件)或无内容，无法直接提取文字";
                    if (code === 'PDF_PASSWORD_PROTECTED') reason = "文件被密码加密";
                    if (code === 'PDF_LIB_MISSING') reason = "PDF解析库未加载";
                    if (code === 'PDF_LOAD_FAILED') reason = "文件数据流读取失败，可能已损坏";
                    return { type: "text", text: `[PDF解析失败: ${file.name}]\n原因: ${reason}\n建议: 请尝试删除文件后重新上传` };
                }

                if (pdfText && pdfText.trim().length > 10) return { type: "text", text: `[PDF内容: ${file.name}]:\n${pdfText}` };
                return { type: "text", text: `[PDF内容过短: ${file.name}]` };
            }
            return { type: "text", text: `[PDF处理错误: ${file.name} (数据流未重建)]` };
        } 
        else if (file.name.endsWith('.docx') && blob) {
            const docxText = await extractDocxText(blob);
            if (docxText.startsWith('ERROR:')) return { type: "text", text: `[DOCX解析失败: ${file.name} - ${docxText}]` };
            return { type: "text", text: `[DOCX内容: ${file.name}]:\n${docxText}` };
        }
        // 2. Images (OpenAI Vision Format)
        else if (mimeType.startsWith('image/')) {
            let finalBase64 = base64Data;
            if (!finalBase64 && blob) finalBase64 = await blobToBase64(blob);
            
            // Fallback for data URI if not split yet
            if (!finalBase64 && file.data.startsWith('data:')) {
                 const parts = file.data.split(',');
                 if (parts.length === 2) finalBase64 = parts[1];
            }

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

    } catch (e: any) { return { type: "text", text: `[系统错误: ${file.name} - ${e.message}]` }; }
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
    
    // 强制纠错：如果 Key 是 sk- 开头，但 URL 包含了 googleapis.com，直接报错阻止
    if (apiKey.startsWith('sk-') && baseUrl.includes('googleapis.com')) {
        throw new Error("配置错误：您使用了第三方 Key (sk-...)，但 Base URL 却是 Google 官方地址。请在设置中将 Base URL 改为中转网关地址 (如 https://api.vectorengine.ai/v1)");
    }

    // Normalize URL: Ensure no trailing slash
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    
    // 🟢 强制补全 /v1 (如果用户漏填，且不是特殊的无版本网关)
    if (!baseUrl.endsWith('/v1') && !baseUrl.endsWith('/v1beta')) {
        baseUrl = `${baseUrl}/v1`;
    }

    const endpoint = `${baseUrl}/chat/completions`;

    // 2. Request Body
    const body: any = {
        model: model,
        messages: messages,
        stream: stream
    };
    
    if (responseFormat) {
        body.response_format = responseFormat;
    }

    // 3. Execute Fetch
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}` // OpenAI Standard
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `请求失败 (${response.status})`;
        try {
            const errJson = JSON.parse(errText);
            if (errJson.error && errJson.error.message) errMsg = errJson.error.message;
        } catch (e) {}
        throw new Error(errMsg);
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
                        // Ignore parse errors
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

// --- 业务函数 (保持接口签名不变) ---

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
    // 🟢 严谨模式 (Strict Mode) 强化逻辑
    const strictInstruction = fidelity === FidelityMode.STRICT
        ? "【IMPORTANT: STRICT MODE ACTIVE】\n1. You MUST strictly base your content ONLY on the provided context (Context) and files. \n2. Do NOT hallucinate. If the context is missing specific details (e.g., price, specs), do NOT invent them. State that they are missing or write generally.\n3. Do NOT add external facts that are not in the source materials.\n4. If the provided context is empty or file content failed to load (e.g. SYSTEM ERROR), please politely inform the user to check their uploaded files instead of making up a story."
        : "【Creative Mode】\nYou are allowed to expand creatively on the topic, using your knowledge of social media trends to enhance the content.";

    const systemText = `You are a professional Xiaohongshu (RedNote) content expert. Output in Chinese (Simplified). 
    
    ${personaPrompt || ''}
    
    ${strictInstruction}

    CRITICAL RULES:
    1. The title MUST be extremely concise and strictly under 20 Chinese characters. This is a hard limit.
    2. Ensure the content flow is engaging.
    
    ${count > 1 ? 'Generate ' + count + ' distinct versions via ### 方案1 format.' : 'Generate 1 high-quality version.'}`;

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
        if (errorMsg.includes('400') || errorMsg.includes('API key')) {
             errorMsg += "\n(💡 提示: 请检查 Base URL 是否正确，通常应以 /v1 结尾)";
        }
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
        if (msg.includes('404')) msg += "\n(💡 提示: 路径 404，请检查 Base URL 是否包含 /v1)";
        if (msg.includes('400')) msg += "\n(💡 提示: 请求参数错误，请检查模型名称是否正确)";
        return { success: false, message: msg };
    }
};
