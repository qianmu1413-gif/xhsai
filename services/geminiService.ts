
import { FidelityMode, PersonaAnalysis, BulkNote, AttachedFile } from "../types";
import { configRepo } from "./repository";
import { ANALYSIS_SYSTEM_PROMPT } from "../constants";

// 协议分隔符
const DATA_MARKER = "###MATRIX_DATA_START###";
const THOUGHT_START = "[[THOUGHT]]";
const THOUGHT_END = "[[/THOUGHT]]";

const cleanMarkdown = (text: string): string => {
    if (!text) return "";
    return text
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/`/g, "")
        .replace(/^#+\s*/gm, "")
        .trim();
};

const extractAndParseJSON = (text: string): any => {
    if (!text) return null;
    let json: any = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (!json) {
        let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        try { json = JSON.parse(cleanText); } catch (e) {}
    }
    if (!json) {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try { json = JSON.parse(match[0]); } catch (e) {}
        }
    }
    if (json) {
        if (json.tone) json.tone = cleanMarkdown(json.tone);
        if (json.structure) json.structure = cleanMarkdown(json.structure);
        if (json.emojiDensity) json.emojiDensity = cleanMarkdown(json.emojiDensity);
    }
    return json;
};

const urlToBase64 = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const res = reader.result as string;
                const base64 = res.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Image Fetch Error", e);
        return "";
    }
};

const fetchGemini = async (endpoint: string, googleBody: any, stream: boolean = false) => {
  const sysConfig = await configRepo.getSystemConfig();
  const { apiKey, baseUrl, model } = sysConfig.gemini;
  
  if (!apiKey) throw new Error("AI 密钥未配置，请联系管理员");

  const isOpenAI = apiKey.startsWith('sk-') || baseUrl.includes('vectorengine') || baseUrl.includes('openai');

  if (isOpenAI) {
      let targetUrl = baseUrl.replace(/\/$/, '');
      if (!targetUrl.endsWith('/v1/chat/completions')) {
          if (targetUrl.endsWith('/v1')) targetUrl += '/chat/completions';
          else targetUrl += '/v1/chat/completions';
      }

      const messages: any[] = [];
      if (googleBody.systemInstruction) {
          messages.push({ role: 'system', content: googleBody.systemInstruction.parts[0].text });
      }
      if (googleBody.contents) {
          for (const c of googleBody.contents) {
              const contentParts: any[] = [];
              if (c.parts) {
                  for (const p of c.parts) {
                      if (p.text) {
                          contentParts.push({ type: 'text', text: p.text });
                      } else if (p.inlineData) {
                          contentParts.push({ 
                              type: 'image_url', 
                              image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } 
                          });
                      }
                  }
              }
              const finalContent = (contentParts.length === 1 && contentParts[0].type === 'text') ? contentParts[0].text : contentParts;
              messages.push({ role: c.role || 'user', content: finalContent });
          }
      }

      const openAIBody = {
          model: model,
          messages: messages,
          stream: stream,
          temperature: googleBody.generationConfig?.temperature || 0.7,
          max_tokens: googleBody.generationConfig?.maxOutputTokens || 4096
      };

      const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(openAIBody)
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return response;

  } else {
      let finalUrl = "";
      const cleanBaseUrl = baseUrl.replace(/\/$/, '');
      if (cleanBaseUrl.includes('/models/')) {
          const separator = endpoint.includes('?') ? '&' : '?';
          finalUrl = `${cleanBaseUrl}${separator}key=${apiKey}`;
      } else {
          const separator = endpoint.includes('?') ? '&' : '?';
          finalUrl = `${cleanBaseUrl}/v1beta/models/${model}:${endpoint}${separator}key=${apiKey}`;
      }

      const response = await fetch(finalUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(googleBody)
      });

      if (!response.ok) throw new Error(`Google API Error: ${response.status}`);
      return response;
  }
};

export const analyzeMaterialContent = async (file: AttachedFile): Promise<string> => {
    let contentPart = {};
    if (file.type === 'image') {
        let base64Data = file.data;
        if (file.data.startsWith('data:image')) {
            base64Data = file.data.split(',')[1];
        } else if (file.isUrl || file.data.startsWith('http')) {
            base64Data = await urlToBase64(file.data);
        }
        contentPart = { inlineData: { mimeType: file.mimeType, data: base64Data } };
    } else {
        contentPart = { text: `文件名: ${file.name}\n内容片段: ${file.data.substring(0, 5000)}...` };
    }

    try {
        const response = await fetchGemini('generateContent', {
            contents: [{ 
                role: 'user', 
                parts: [
                    contentPart,
                    { text: "深度分析这份资料。" }
                ] 
            }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 2000 }
        });
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "无法提取分析结果";
    } catch (e: any) {
        throw new Error(`分析失败: ${e.message}`);
    }
};

export const analyzeMaterials = async (files: AttachedFile[]): Promise<string> => {
    if (files.length === 0) return "没有检测到可分析的文件。";

    const parts: any[] = [];
    
    // 强化后的指令：更偏向营销和干货提取，不仅仅是总结
    parts.push({ text: `你是一位顶级内容策略专家。请对以下 ${files.length} 份素材进行【深度拆解】，目的是为了辅助撰写最具转化率的小红书笔记。

请不要只做简单的摘要，我要的是【营销爆点】和【写作素材】。

请严格按以下结构输出分析报告（Markdown）：

## 1. 核心卖点提炼 (Unique Selling Points)
*请列出3-5个最强的产品/内容优势，用“痛点-解决方案”的逻辑描述。*
- **[卖点1]**: 针对 [什么痛点]，提供了 [什么解决]，优势是 [具体参数/成分/效果]。
- **[卖点2]**: ...

## 2. 目标人群画像 (Target Audience)
*谁最需要这个？*
- (例如：经常熬夜的学生党、追求性价比的宝妈...)

## 3. 内容细节素材库 (Content Details)
*提取具体的、可直接用于正文的数据、金句或场景描述。*
- **关键数据**: (价格、含量、实验数据等)
- **视觉描述**: (如果是图片，描述其氛围、颜色、构图)
- **专业背书**: (成分、原理、品牌背景)

## 4. 爆款选题切入点
*基于素材，给出 3 个高流量的笔记标题切入方向。*
1. [方向一]: ...
2. [方向二]: ...

---
以下是素材内容：` });

    for (const f of files) {
        if (f.type === 'image') {
            let base64Data = f.data;
            if (f.data.startsWith('data:image')) {
                base64Data = f.data.split(',')[1];
            } else if (f.isUrl || f.data.startsWith('http')) {
                base64Data = await urlToBase64(f.data);
            }
            if (base64Data) {
                parts.push({ text: `\n[图片素材: ${f.name}]` }); 
                parts.push({ inlineData: { mimeType: f.mimeType, data: base64Data } });
            }
        } else {
            const contentSnippet = f.data.length > 80000 ? f.data.substring(0, 80000) + "..." : f.data;
            parts.push({ text: `\n[文案素材: ${f.name}]\n${contentSnippet}` });
        }
    }

    try {
        const response = await fetchGemini('generateContent', {
            contents: [{ role: 'user', parts: parts }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
        });
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || "未能生成分析结果。";
    } catch (e: any) {
        throw new Error(`资料分析失败: ${e.message}`);
    }
};

export const streamExpertGeneration = async (
  context: string,
  files: AttachedFile[],
  personaPrompt: string,
  fidelity: FidelityMode,
  count: number = 1,
  wordCountLimit: number = 400,
  onToken?: (text: string, thought: string) => void
): Promise<{ dialogueText: string; thought: string; notes: BulkNote[] }> => {

  let modeInstruction = fidelity === FidelityMode.STRICT ? 
    `【专业/严谨模式】绝对忠实于参考资料，禁止虚构。` : 
    `【创意/素人模式】发挥创意，合理联想，情感渲染，口语化表达。`;

  const systemInstruction = {
    parts: [{ text: `你是一位顶级小红书内容专家。
博主风格设定：${personaPrompt}
${modeInstruction}

【绝对规则 - 必须遵守】
1. 语言：简体中文。
2. **字数红线**：你必须精准控制篇幅。每篇笔记的正文部分（不含标题和标签）必须控制在 **${wordCountLimit} 字以内**！
   - 请在生成前先规划字数。
   - 如果内容过多，请精简废话，只保留核心干货。
   - 任何超过 ${wordCountLimit} 字的输出都被视为失败。
3. 流程：
   - 先输出思考过程 [[THOUGHT]]...[[/THOUGHT]] (规划如何将内容压缩在 ${wordCountLimit} 字以内)
   - 再输出正文 (纯文本)
   - 最后输出数据分隔符 ${DATA_MARKER} 和 JSON数据: { "notes": [ { "title": "...", "content": "..." } ] }

篇数 ${count}。` }]
  };

  const processedFilesParts = await Promise.all(files.map(async f => {
      if (f.type === 'image') {
          let base64Data = f.data;
          if (f.data.startsWith('data:image')) {
              base64Data = f.data.split(',')[1];
          } else if (f.isUrl || f.data.startsWith('http')) {
              base64Data = await urlToBase64(f.data);
          }
          if (!base64Data) return { text: `[Image: ${f.name}]` };
          return { inlineData: { mimeType: f.mimeType, data: base64Data } };
      } else {
          return { text: `参考资料 [${f.name}]:\n${f.data}` };
      }
  }));

  const contents = [{ role: 'user', parts: [{ text: context }, ...processedFilesParts] }];

  try {
    const response = await fetchGemini('streamGenerateContent?alt=sse', {
      contents,
      systemInstruction,
      generationConfig: { 
          temperature: fidelity === FidelityMode.STRICT ? 0.2 : 0.9, 
      }
    }, true);

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let fullText = "";
    let thoughtBuffer = "";
    let dialogueBuffer = "";
    let inThought = false;
    let dataMarkerFound = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunkStr = decoder.decode(value, { stream: true });
      const lines = chunkStr.split('\n');
      
      for (const line of lines) {
        let content = "";
        const trimmed = line.trim();
        
        if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr === '[DONE]') continue;
            try {
                const data = JSON.parse(jsonStr);
                content = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                          data.choices?.[0]?.delta?.content || "";
            } catch (e) {}
        } 

        if (content) {
            fullText += content;

            if (dataMarkerFound) continue; 

            if (!inThought && content.includes(THOUGHT_START)) {
                inThought = true;
            }
            
            if (inThought) {
                thoughtBuffer += content;
                if (thoughtBuffer.includes(THOUGHT_END)) {
                    inThought = false;
                    const rawThought = thoughtBuffer.replace(THOUGHT_START, '').replace(THOUGHT_END, '');
                    if (onToken) onToken(dialogueBuffer, rawThought);
                } else {
                    if (onToken) onToken(dialogueBuffer, thoughtBuffer.replace(THOUGHT_START, ''));
                }
            } else {
                if (fullText.includes(DATA_MARKER)) {
                    dataMarkerFound = true;
                    const parts = fullText.split(DATA_MARKER);
                    dialogueBuffer = parts[0].replace(/\[\[THOUGHT\]\][\s\S]*?\[\[\/THOUGHT\]\]/g, '').trim();
                } else {
                    dialogueBuffer += content;
                }
                
                if (!inThought && onToken) {
                     const cleanDia = dialogueBuffer.replace(THOUGHT_END, '');
                     onToken(cleanDia, thoughtBuffer.replace(THOUGHT_START, '').replace(THOUGHT_END, ''));
                }
            }
        }
      }
    }

    let finalThought = "";
    let finalDialogue = fullText;
    let jsonPart = null;

    const tStart = fullText.indexOf(THOUGHT_START);
    const tEnd = fullText.indexOf(THOUGHT_END);
    if (tStart !== -1 && tEnd !== -1) {
        finalThought = fullText.substring(tStart + THOUGHT_START.length, tEnd).trim();
        finalDialogue = fullText.substring(0, tStart) + fullText.substring(tEnd + THOUGHT_END.length);
    }

    const splitParts = finalDialogue.split(DATA_MARKER);
    finalDialogue = splitParts[0].trim();
    if (splitParts.length > 1) {
        jsonPart = splitParts[1].trim();
    }

    let parsedNotes: BulkNote[] = [];
    if (jsonPart) {
        try { 
            const parsed = extractAndParseJSON(jsonPart); 
            parsedNotes = parsed?.notes || [];
        } catch (e) { console.error("Stream JSON Error", e); }
    }

    return {
      dialogueText: finalDialogue,
      thought: finalThought,
      notes: parsedNotes
    };

  } catch (error: any) {
    throw new Error(`生成中断: ${error.message}`);
  }
};

export const streamPersonaAnalysis = async (
    samples: string,
    onToken: (text: string) => void
): Promise<PersonaAnalysis> => {
    try {
        const response = await fetchGemini('streamGenerateContent?alt=sse', {
            contents: [{ role: 'user', parts: [{ text: `以下是我的样本，请分析风格并返回 JSON：\n\n${samples}` }] }],
            systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT + "\n\nIMPORTANT: Return ONLY valid JSON. The 'tone' field MUST be concise (max 8 characters). No Markdown." }] },
            generationConfig: { temperature: 0.4, maxOutputTokens: 8192, responseMimeType: "application/json" }
        }, true);

        if (!response.body) throw new Error("No response body");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for(const line of lines) {
                if(line.startsWith('data:') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(5));
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || data.choices?.[0]?.delta?.content;
                        if(text) { fullText += text; onToken(fullText); }
                    } catch(e){}
                }
            }
        }
        
        const result = extractAndParseJSON(fullText);
        
        if (result && result.tone) {
            return result;
        } else {
            return { 
                tone: "自定义风格 (自动提取)", 
                keywords: ["提取结果"], 
                emojiDensity: "未识别", 
                structure: "未识别", 
                writerPersonaPrompt: fullText.substring(0, 2000) || "提取失败，请重试。" 
            };
        }
    } catch (e: any) { throw new Error(e.message); }
};

export const testConnection = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const res = await fetchGemini('generateContent', {
        contents: [{ role: 'user', parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 5 }
    });
    const data = await res.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return { success: true, message: "网关已连接 (Proxy Active) ✅" };
    }
    return { success: false, message: "网关响应异常" };
  } catch (err: any) {
    return { success: false, message: `连接异常: ${err.message}` };
  }
};

export const generateComments = async (content: string): Promise<string[]> => {
  return ["绝绝子！❤️", "马住！", "真不错"];
};
