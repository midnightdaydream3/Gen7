
import React, { useState } from 'react';
import { Question, MasteryCard } from '../types';
import { Button } from './Button';
import { deepDiveExplanation } from '../services/geminiService';

interface BookmarksViewProps {
  bookmarks: Question[];
  onClose: () => void;
  onRemove: (q: Question) => void;
  masteryLayers: Record<string, MasteryCard[]>;
  onDissect: (q: Question) => Promise<void>;
}

const SimpleMarkdown: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;

  const lines = content.split('\n');
  return (
    <div className="space-y-3 text-[11px] sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      {lines.map((line, idx) => {
        let processedLine = line.trim();
        if (!processedLine) return <div key={idx} className="h-2" />;

        // Headers
        if (processedLine.startsWith('### ')) {
          return <h4 key={idx} className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 mt-2 mb-1">{processedLine.replace('### ', '')}</h4>;
        }
        if (processedLine.startsWith('## ')) {
          return <h3 key={idx} className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 mt-3 mb-2">{processedLine.replace('## ', '')}</h3>;
        }

        // List items
        if (processedLine.startsWith('* ') || processedLine.startsWith('- ')) {
           const cleanText = processedLine.substring(2);
           return (
             <div key={idx} className="flex gap-2 pl-2">
               <span className="text-blue-500 font-bold">•</span>
               <span dangerouslySetInnerHTML={{ __html: parseBold(cleanText) }} />
             </div>
           );
        }

        // Standard paragraph
        return <p key={idx} dangerouslySetInnerHTML={{ __html: parseBold(processedLine) }} />;
      })}
    </div>
  );
};

const parseBold = (text: string) => {
  // Replace **text** with <strong>text</strong>
  let parsed = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');
  // Replace *text* with <em>text</em>
  parsed = parsed.replace(/\*(.*?)\*/g, '<em class="italic text-slate-600 dark:text-slate-400">$1</em>');
  return parsed;
};

export const BookmarksView: React.FC<BookmarksViewProps> = ({ bookmarks, onClose, onRemove, masteryLayers, onDissect }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deepDives, setDeepDives] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [dissectingIds, setDissectingIds] = useState<Set<string>>(new Set());
  const [activeLayer, setActiveLayer] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const handleDeepDive = async (q: Question) => {
    if (deepDives[q.id]) return;
    setLoadingIds(prev => new Set(prev).add(q.id));
    try {
      const insight = await deepDiveExplanation(q);
      setDeepDives(prev => ({ ...prev, [q.id]: insight }));
    } finally {
      setLoadingIds(prev => { const next = new Set(prev); next.delete(q.id); return next; });
    }
  };

  const handleManualDissect = async (q: Question) => {
    setDissectingIds(prev => new Set(prev).add(q.id));
    try {
      await onDissect(q);
    } finally {
      setDissectingIds(prev => { const next = new Set(prev); next.delete(q.id); return next; });
    }
  };

  const nextLayer = (total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeLayer < total - 1) {
      setActiveLayer(prev => prev + 1);
      setIsFlipped(false);
    }
  };

  const prevLayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeLayer > 0) {
      setActiveLayer(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const getLayerColor = (type: string) => {
    switch(type) {
      case 'Pathophysiology': return 'bg-purple-600';
      case 'Diagnosis': return 'bg-amber-600';
      case 'Management': return 'bg-green-600';
      case 'Differentiator': return 'bg-blue-600';
      default: return 'bg-slate-600';
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-1 sm:px-0 space-y-5 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-x-hidden w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-[1.25rem] sm:rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 gap-4 w-full box-border">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100">Clinical Vault</h2>
          <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-sm font-medium">{bookmarks.length} Concept Threads Pinned</p>
        </div>
        <Button variant="outline" className="rounded-xl sm:rounded-2xl w-full sm:w-auto h-10 sm:h-auto text-xs sm:text-base" onClick={onClose}>Finish Review</Button>
      </div>

      <div className="grid gap-3.5 sm:gap-4 w-full">
        {bookmarks.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-[1.5rem] sm:rounded-[2rem] border border-dashed border-slate-200 dark:border-slate-800 w-full">
            <p className="text-slate-400 font-black uppercase tracking-widest text-xs sm:text-sm px-4">Your vault is empty</p>
          </div>
        ) : (
          bookmarks.map((q, idx) => {
            const isExpanded = expandedId === q.id;
            const layers = masteryLayers[q.id] || [];
            const currentLayer = layers[activeLayer];

            return (
              <div key={q.id} className={`bg-white dark:bg-slate-900 rounded-[1.25rem] sm:rounded-[2.5rem] border transition-all duration-300 w-full overflow-hidden ${
                isExpanded ? 'border-blue-300 dark:border-blue-900 shadow-xl' : 'border-slate-100 dark:border-slate-800 shadow-sm hover:border-blue-200'
              }`}>
                <div 
                  className="p-4 sm:p-8 flex items-center justify-between cursor-pointer gap-3 sm:gap-4 w-full overflow-hidden" 
                  onClick={() => { 
                    setExpandedId(isExpanded ? null : q.id); 
                    setActiveLayer(0); 
                    setIsFlipped(false); 
                  }}
                >
                  <div className="flex items-center gap-3 sm:gap-6 overflow-hidden min-w-0 flex-1">
                    <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl flex items-center justify-center font-black flex-shrink-0 transition-colors text-xs sm:text-base ${
                      isExpanded ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'
                    }`}>
                      {idx + 1}
                    </div>
                    <p className="text-xs sm:text-lg font-bold text-slate-800 dark:text-slate-200 italic break-words whitespace-pre-wrap min-w-0 flex-1">"{q.vignette}"</p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onRemove(q); }} 
                    className="p-2 text-slate-300 hover:text-red-500 transition-all flex-shrink-0"
                  >
                    <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-4 sm:px-8 pb-6 sm:pb-10 space-y-6 sm:space-y-10 animate-in slide-in-from-top-4 duration-500 overflow-hidden w-full box-border">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-start w-full">
                      <div className="space-y-4 sm:space-y-6 w-full overflow-hidden">
                        <div className="flex justify-between items-center px-1">
                          <h4 className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Atomic Layers</h4>
                          {layers.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-slate-400 mr-2">{activeLayer + 1} / {layers.length}</span>
                              <button 
                                onClick={prevLayer} 
                                disabled={activeLayer === 0}
                                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                              >
                                <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                              </button>
                              <button 
                                onClick={(e) => nextLayer(layers.length, e)} 
                                disabled={activeLayer === layers.length - 1}
                                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                              >
                                <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                              </button>
                            </div>
                          )}
                        </div>

                        {layers.length > 0 ? (
                          <div className="perspective-1000 w-full group">
                            <div 
                              onClick={() => setIsFlipped(!isFlipped)}
                              className={`relative w-full cursor-pointer transition-all duration-700 transform-style-3d grid grid-cols-1 ${isFlipped ? 'rotate-y-180' : ''}`}
                            >
                              {/* Front Face */}
                              <div className="col-start-1 row-start-1 backface-hidden flex flex-col items-center justify-center p-6 sm:p-12 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shadow-inner z-10">
                                <span className={`px-3 py-1 mb-4 rounded-full text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${getLayerColor(currentLayer.type)}`}>
                                  {currentLayer.type}
                                </span>
                                <p className="text-base sm:text-2xl font-black text-center leading-tight text-slate-800 dark:text-slate-100 break-words w-full whitespace-pre-wrap">{currentLayer.front}</p>
                                <div className="mt-6 flex items-center gap-2 text-slate-400">
                                   <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Tap to flip</span>
                                   <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </div>
                              </div>
                              {/* Back Face */}
                              <div className="col-start-1 row-start-1 backface-hidden rotate-y-180 flex flex-col items-center justify-center p-6 sm:p-12 rounded-[1.5rem] sm:rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl">
                                <p className="text-lg sm:text-3xl font-black text-center leading-tight italic break-words w-full whitespace-pre-wrap">"{currentLayer.back}"</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-48 sm:h-80 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/30 rounded-[1rem] sm:rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-3 sm:space-y-6 p-6 sm:p-10 text-center w-full">
                            <div className="w-10 h-10 sm:w-16 sm:h-16 bg-white dark:bg-slate-800 rounded-xl sm:rounded-3xl flex items-center justify-center shadow-sm">
                               <svg className="w-5 h-5 sm:w-8 sm:h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            </div>
                            <Button 
                              variant="primary" 
                              className="px-5 py-2 sm:px-8 sm:py-3 rounded-xl sm:rounded-2xl text-[10px] sm:text-base h-auto" 
                              onClick={() => handleManualDissect(q)}
                              isLoading={dissectingIds.has(q.id)}
                            >
                              Synthesize Cards
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4 sm:space-y-6 w-full">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Mastery Narrative</h4>
                          <Button 
                              variant="outline" 
                              className="text-[7px] sm:text-[10px] py-1 px-2.5 sm:px-4 rounded-lg sm:rounded-full h-7 sm:h-auto"
                              onClick={() => handleDeepDive(q)} 
                              isLoading={loadingIds.has(q.id)}
                           >
                             {deepDives[q.id] ? "Regen" : "Narrative"}
                           </Button>
                        </div>

                        {deepDives[q.id] ? (
                          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[1.25rem] sm:rounded-[2rem] shadow-xl overflow-hidden animate-in zoom-in-95 duration-700 flex flex-col w-full">
                             <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
                                <h5 className="text-[8px] sm:text-[9px] font-black text-blue-600 uppercase mb-1 tracking-widest">Case Context</h5>
                                <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 italic leading-relaxed font-medium break-words whitespace-pre-wrap">"{q.vignette}"</p>
                             </div>
                             <div className="p-5 sm:p-8 max-h-[300px] sm:max-h-[500px] overflow-y-auto custom-scrollbar">
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                  <SimpleMarkdown content={deepDives[q.id]} />
                                </div>
                             </div>
                             <div className="bg-blue-600 p-2.5 text-center">
                                <span className="text-[7px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest">AI Mastery Synthesis</span>
                             </div>
                          </div>
                        ) : (
                          <div className="p-6 sm:p-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[1.25rem] sm:rounded-[2rem] text-center w-full">
                             <p className="text-slate-400 font-bold text-[10px] sm:text-sm leading-relaxed px-2 whitespace-pre-wrap">Synthesis bridging conceptual gaps.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        @media (min-width: 640px) {
          .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
      `}</style>
    </div>
  );
};
