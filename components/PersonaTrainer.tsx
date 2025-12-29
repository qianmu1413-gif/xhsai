
import React, { useState } from 'react';
import { streamPersonaAnalysis } from '../services/geminiService';
import { PersonaAnalysis } from '../types';
import { Sparkles, Loader2, BrainCircuit, Quote, ArrowRight } from 'lucide-react';
import Toast from './Toast';

interface PersonaTrainerProps {
  initialSamples?: string[];
  onPersonaLocked: (persona: PersonaAnalysis, samples: string[]) => void;
  onSaveToLibrary: (title: string, content: string, type: 'prompt' | 'note') => void;
  onAnalysisComplete: (persona: PersonaAnalysis, sourceText: string) => void; // New callback
}

const PersonaTrainer: React.FC<PersonaTrainerProps> = ({ initialSamples, onAnalysisComplete }) => {
  const [inputText, setInputText] = useState(initialSamples?.join('\n\n') || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const handleStartAnalysis = async () => {
      if (!inputText.trim()) return;
      if (isAnalyzing) return;

      setIsAnalyzing(true);
      setShowToast(true); // Show immediate feedback

      try {
          const result = await streamPersonaAnalysis(inputText, () => {});
          // Instead of showing local UI, trigger the global modal via callback
          onAnalysisComplete(result, inputText);
      } catch (error: any) {
          console.error(error);
          alert(`分析出错: ${error.message}`);
      } finally {
          setIsAnalyzing(false);
          setShowToast(false);
      }
  };

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC] relative">
        {showToast && <Toast message="正在深入分析样本风格..." type="info" onClose={() => {}} />}
        
        {/* Full Screen Loading Overlay */}
        {isAnalyzing && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-fade-in">
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                    <Loader2 size={32} className="animate-spin text-indigo-600"/>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">正在提取人设特征...</h2>
                <p className="text-slate-500 text-sm">AI 正在分析语气、排版和用词习惯</p>
            </div>
        )}

        {/* Centered Input Area */}
        <div className="flex-1 flex flex-col h-full max-w-4xl mx-auto w-full p-6 md:p-12">
            <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500 shadow-sm">
                    <BrainCircuit size={32} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">风格提取实验室</h2>
                <p className="text-slate-500">将您的爆款笔记样本粘贴到下方，AI 将自动分析并生成可复用的人设模型。</p>
            </div>
            
            <div className="flex-1 flex flex-col relative bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider flex items-center gap-1"><Quote size={10}/> 参考样本</span>
                </div>
                <textarea 
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    disabled={isAnalyzing}
                    placeholder="在此粘贴文案... （建议粘贴 3-5 篇同风格的笔记，效果最佳）"
                    className="w-full flex-1 p-6 pt-12 bg-white outline-none text-sm resize-none disabled:opacity-50 font-mono leading-relaxed"
                />
                
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-medium">AI 将提取语气、排版、Emoji 习惯等特征</span>
                    <button 
                        onClick={handleStartAnalysis}
                        disabled={!inputText.trim() || isAnalyzing}
                        className="px-8 py-3 bg-slate-900 text-white rounded-xl hover:bg-black disabled:bg-slate-300 transition-all shadow-lg shadow-slate-300 font-bold flex items-center gap-2 active:scale-95"
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader2 size={18} className="animate-spin" /> 正在提取...
                            </>
                        ) : (
                            <>
                                开始提取 <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default PersonaTrainer;
