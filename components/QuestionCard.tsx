
import React, { useState, useEffect } from 'react';
import { Question, MasteryCard } from '../types';
import { Button } from './Button';
import { deepDiveExplanation } from '../services/geminiService';

interface QuestionCardProps {
  question: Question;
  selectedAnswer: number | null;
  onAnswer: (index: number) => void;
  onNext: (userFocus?: string, manualReinforce?: boolean) => void;
  onPrev?: () => void;
  onSkip?: () => void;
  isLast: boolean;
  isFirst: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  progress: number;
  currentIndex: number;
  totalQuestions: number;
  autoReinforce: boolean;
  masteryCards?: MasteryCard[];
  onDissect?: (q: Question, forceRegen?: boolean) => Promise<void>;
  onUpdateDeepDive?: (insight: string) => void;
  onQuit?: (currentAnswer: number | null) => void;
  activeTimeMsRef?: React.MutableRefObject<number>;
  lastActiveTimeRef?: React.MutableRefObject<number>;
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
  let parsed = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');
  parsed = parsed.replace(/\*(.*?)\*/g, '<em class="italic text-slate-600 dark:text-slate-400">$1</em>');
  return parsed;
};

export const QuestionCard: React.FC<QuestionCardProps> = ({ 
  question, 
  selectedAnswer, 
  onAnswer, 
  onNext, 
  onPrev,
  onSkip,
  isLast,
  isFirst,
  isBookmarked,
  onToggleBookmark,
  progress,
  currentIndex,
  totalQuestions,
  autoReinforce,
  masteryCards,
  onDissect,
  onUpdateDeepDive,
  onQuit,
  activeTimeMsRef,
  lastActiveTimeRef
}) => {
  const isAnswered = selectedAnswer !== null;
  const isCorrect = selectedAnswer === question.correctIndex;
  const [showToast, setShowToast] = useState(false);
  const [interactionReady, setInteractionReady] = useState(false);
  const [userFocus, setUserFocus] = useState("");
  const [manualReinforce, setManualReinforce] = useState(false);

  // New features state
  const [activeLayer, setActiveLayer] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [dissecting, setDissecting] = useState(false);

  // Use persistent narrative if available
  const [narrative, setNarrative] = useState<string | null>(question.deepDive || null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeTimeMsRef || !lastActiveTimeRef) return;
    
    const updateTimer = () => {
      if (!document.hidden) {
        const delta = Date.now() - lastActiveTimeRef.current;
        const currentElapsed = activeTimeMsRef.current + (delta > 0 && delta < 86400000 ? delta : 0);
        setElapsed(currentElapsed);
        localStorage.setItem('abdu_active_time', currentElapsed.toString());
      } else {
        setElapsed(activeTimeMsRef.current);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeTimeMsRef, lastActiveTimeRef]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    // Reset ALL local state when question changes
    setInteractionReady(false);
    setShowToast(false); 
    setUserFocus("");
    setManualReinforce(false);
    
    // Reset new features on question change
    setActiveLayer(0);
    setIsFlipped(false);
    setNarrative(question.deepDive || null);
    setLoadingNarrative(false);
    setDissecting(false);

    // Increased delay to 1000ms to absolutely prevent phantom touches
    const timer = setTimeout(() => setInteractionReady(true), 1000);
    return () => clearTimeout(timer);
  }, [question.id, question.deepDive]);

  useEffect(() => {
    if (isBookmarked) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 2000);
      return () => clearTimeout(timer);
    } else {
      setShowToast(false);
    }
  }, [isBookmarked, question.id]);

  const handleAnswerClick = (idx: number) => {
    if (!interactionReady || isAnswered) return;
    onAnswer(idx);
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

  const handleDeepDive = async () => {
    setLoadingNarrative(true);
    try {
      const insight = await deepDiveExplanation(question);
      setNarrative(insight);
      if (onUpdateDeepDive) onUpdateDeepDive(insight);
    } catch (e) {
      console.error(e);
      alert("Failed to generate deep dive. Please check your connection and try again.");
    } finally {
      setLoadingNarrative(false);
    }
  };

  const handleDissect = async (forceRegen: boolean = false) => {
    if (!onDissect) return;
    setDissecting(true);
    try {
      await onDissect(question, forceRegen);
    } finally {
      setDissecting(false);
    }
  };

  const currentLayer = masteryCards && masteryCards.length > 0 ? masteryCards[activeLayer] : null;

  // Derived state for Concept Reinforcement visual logic
  const autoReinforceActive = !isCorrect && autoReinforce;
  const isReinforcementActive = manualReinforce || autoReinforceActive;

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-in fade-in duration-700 relative pb-12 w-full px-0">
      
      {/* Invisible Interaction Blocker for Phantom Touches */}
      {!interactionReady && (
        <div className="absolute inset-0 z-[100] bg-transparent cursor-wait" onClick={(e) => e.stopPropagation()} />
      )}

      <div className="space-y-2 px-1">
        <div className="flex justify-between items-end text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span>Item {currentIndex + 1} / {totalQuestions}</span>
          <div className="flex items-center gap-3">
            {activeTimeMsRef && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-slate-500 dark:text-slate-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="tabular-nums">{formatTime(elapsed)}</span>
              </div>
            )}
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
        <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-blue-600 text-white px-5 py-2.5 rounded-2xl shadow-xl font-bold flex items-center gap-2 animate-in slide-in-from-top-4 duration-300 text-xs sm:text-sm whitespace-nowrap shadow-blue-500/30">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          Saved to Vault
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-5 sm:p-12 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 relative group/card w-full box-border">
        <div className="flex justify-between items-start mb-5 sm:mb-8 gap-3 sm:gap-4 w-full">
          <div className="flex-1 min-w-0 prose prose-slate dark:prose-invert max-w-none">
            <p className="text-base sm:text-xl leading-relaxed text-slate-800 dark:text-slate-200 font-medium whitespace-pre-wrap break-words overflow-visible">
              {question.vignette}
            </p>
          </div>
          <button 
            onClick={onToggleBookmark}
            className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl transition-all active:scale-90 flex-shrink-0 border-2 ${
              isBookmarked 
              ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/30' 
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-blue-500 hover:border-blue-300'
            }`}
          >
            <svg className={`w-5 h-5 sm:w-6 sm:h-6 ${isBookmarked ? 'fill-current' : 'fill-none'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:gap-3 mb-6 sm:mb-8 w-full">
          {question.options.map((option, idx) => {
            let variant = "default";
            if (isAnswered) {
              if (idx === question.correctIndex) variant = "correct";
              else if (idx === selectedAnswer) variant = "incorrect";
            }

            const styles = {
              default: `border-slate-100 dark:border-slate-800 ${interactionReady ? 'hover:border-blue-400 dark:hover:border-blue-700 bg-slate-50/50 dark:bg-slate-800/30' : 'bg-slate-50/50 dark:bg-slate-800/30 cursor-wait'} text-slate-700 dark:text-slate-300`,
              correct: "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 ring-2 ring-green-500/10 shadow-lg shadow-green-500/10",
              incorrect: "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 shadow-lg shadow-red-500/10"
            };

            return (
              <button
                key={idx}
                disabled={!interactionReady || isAnswered}
                onClick={() => handleAnswerClick(idx)}
                className={`w-full text-left p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border-2 transition-all flex items-start gap-3 sm:gap-4 group ${styles[variant as keyof typeof styles]} ${!interactionReady && !isAnswered ? 'opacity-80' : ''}`}
              >
                <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex-shrink-0 flex items-center justify-center font-black border-2 text-[10px] sm:text-xs ${
                  isAnswered && idx === question.correctIndex 
                    ? "border-green-600 bg-green-600 text-white" 
                    : isAnswered && idx === selectedAnswer
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-slate-200 dark:border-slate-700 group-hover:border-blue-500 text-slate-400"
                }`}>
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="flex-1 text-sm sm:text-base font-semibold break-words leading-tight sm:leading-normal">{option}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-50 dark:border-slate-800 pt-4 mt-2 w-full">
           <div className="flex gap-2 min-w-0">
            {!isFirst && (
              <button 
                onClick={onPrev}
                className="px-2 sm:px-4 py-1.5 text-[10px] sm:text-xs font-bold text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 transition-colors flex items-center gap-1 group/back truncate"
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 transform group-hover/back:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}
           </div>
           
          <div className="flex items-center gap-2 ml-auto">
            {onQuit && (
               <button 
                onClick={() => onQuit(selectedAnswer)}
                className="px-3 sm:px-6 py-1.5 text-[10px] sm:text-sm font-bold text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 flex items-center gap-1 sm:gap-2 transition-colors truncate"
               >
                 Quit
               </button>
            )}
            {!isAnswered && onSkip && (
               <button 
                onClick={onSkip}
                className="px-3 sm:px-6 py-1.5 text-[10px] sm:text-sm font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 flex items-center gap-1 sm:gap-2 transition-colors group/skip truncate"
               >
                 Skip
                 <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 transform group-hover/skip:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                 </svg>
               </button>
            )}
          </div>
        </div>
      </div>

      {isAnswered && (
        <div className="bg-white dark:bg-slate-900 p-5 sm:p-12 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 animate-in slide-in-from-bottom-8 duration-500 w-full box-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
            <div className="flex items-center gap-2.5 sm:gap-4">
              <div className={`px-3 py-1 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase ${
                isCorrect ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}>
                {isCorrect ? "Correct" : "Missed"}
              </div>
              <h3 className="text-base sm:text-xl font-black text-slate-800 dark:text-slate-100">Clinical Pearl</h3>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6 w-full">
            <div className="p-4 sm:p-6 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl sm:rounded-3xl text-white shadow-xl shadow-blue-500/20 w-full">
              <h4 className="text-[8px] sm:text-[9px] font-black uppercase opacity-70 mb-1.5 sm:mb-2 tracking-widest">Key Learning Point</h4>
              <p className="text-sm sm:text-lg font-bold italic leading-snug break-words">"{question.explanation.keyLearningPoint}"</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 w-full">
              <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <h4 className="text-[8px] sm:text-[9px] font-black text-green-600 dark:text-green-400 mb-1.5 uppercase tracking-widest">Correct Path</h4>
                <p className="text-[11px] sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed break-words whitespace-pre-wrap">{question.explanation.correct}</p>
              </div>
              <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <h4 className="text-[8px] sm:text-[9px] font-black text-red-600 dark:text-red-400 mb-1.5 uppercase tracking-widest">Logic Distractor</h4>
                <p className="text-[11px] sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed break-words whitespace-pre-wrap">{question.explanation.incorrect}</p>
              </div>
            </div>

            {/* Atomic Layers Section */}
            <div className="w-full overflow-hidden mt-6">
                <div className="flex justify-between items-center px-1 mb-2">
                  <h4 className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Atomic Layers</h4>
                  <div className="flex items-center gap-2">
                    {currentLayer && masteryCards && masteryCards.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-slate-400 mr-2">{activeLayer + 1} / {masteryCards.length}</span>
                        <button onClick={prevLayer} disabled={activeLayer === 0} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors">
                          <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button onClick={(e) => nextLayer(masteryCards.length, e)} disabled={activeLayer === masteryCards.length - 1} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors">
                          <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    )}
                    <button 
                      onClick={() => handleDissect(true)} 
                      disabled={dissecting}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-blue-500"
                      title="Regenerate Atomic Layers"
                    >
                      <svg className={`w-3.5 h-3.5 ${dissecting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                  </div>
                </div>

               {currentLayer ? (
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
                  <div className="h-48 sm:h-64 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/30 rounded-[1rem] sm:rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-3 sm:space-y-6 p-6 sm:p-10 text-center w-full">
                    <Button 
                      variant="primary" 
                      className="px-5 py-2 sm:px-8 sm:py-3 rounded-xl sm:rounded-2xl text-[10px] sm:text-base h-auto" 
                      onClick={handleDissect}
                      isLoading={dissecting}
                    >
                      Synthesize Atomic Cards
                    </Button>
                  </div>
               )}
            </div>

            {/* Mastery Narrative Section */}
            <div className="w-full mt-6">
              <div className="flex items-center justify-between px-1 mb-2">
                <h4 className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Mastery Narrative</h4>
                <Button 
                    variant="outline" 
                    className="text-[7px] sm:text-[10px] py-1 px-2.5 sm:px-4 rounded-lg sm:rounded-full h-7 sm:h-auto"
                    onClick={handleDeepDive} 
                    isLoading={loadingNarrative}
                 >
                   {narrative ? "Regen" : "Deep Dive"}
                 </Button>
              </div>

              {narrative ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[1.25rem] sm:rounded-[2rem] shadow-xl overflow-hidden animate-in zoom-in-95 duration-700 flex flex-col w-full">
                   <div className="p-5 sm:p-8 max-h-[300px] sm:max-h-[500px] overflow-y-auto custom-scrollbar">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <SimpleMarkdown content={narrative} />
                      </div>
                   </div>
                   <div className="bg-blue-600 p-2.5 text-center">
                      <span className="text-[7px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest">AI Mastery Synthesis</span>
                   </div>
                </div>
              ) : (
                <div className="p-6 sm:p-10 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[1.25rem] sm:rounded-[2rem] text-center w-full">
                   <p className="text-slate-400 font-bold text-[10px] sm:text-sm leading-relaxed px-2 whitespace-pre-wrap">Generate deep dive explanation?</p>
                </div>
              )}
            </div>

            {/* Concept Reinforcement - UNIFIED UI for Correct & Incorrect */}
            <div className="p-5 sm:p-6 bg-blue-50 dark:bg-blue-900/20 rounded-[1.5rem] border border-blue-100 dark:border-blue-800 animate-in fade-in duration-300 space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <h4 className="text-xs sm:text-sm font-black uppercase tracking-widest">Concept Reinforcement</h4>
                    </div>
                    
                    <button 
                       onClick={() => !autoReinforceActive && setManualReinforce(!manualReinforce)}
                       disabled={autoReinforceActive}
                       className={`px-4 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-2 ${
                         isReinforcementActive 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30' 
                          : 'bg-transparent border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white hover:border-blue-600'
                       }`}
                    >
                       {isReinforcementActive ? (autoReinforceActive ? "Auto-Active" : "Mastery Active") : "Reinforce Mastery?"}
                    </button>
                </div>

                <input 
                    type="text"
                    placeholder="Type specific focus (e.g. 'mechanism of action', 'complications')..."
                    value={userFocus}
                    onChange={(e) => setUserFocus(e.target.value)}
                    className="w-full p-4 text-xs sm:text-sm bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-blue-900/50 rounded-xl outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-slate-100 placeholder-slate-400"
                />
                
                <p className="text-[10px] sm:text-[11px] text-blue-600/70 dark:text-blue-400/50 uppercase font-black tracking-widest">
                    {isReinforcementActive 
                      ? "Insert 3 random clinical cases testing this concept" 
                      : "Reinforcement disabled for next block"}
                </p>
            </div>
          </div>

          <div className="mt-6 sm:mt-8 flex justify-end w-full">
            <Button onClick={() => onNext(userFocus, manualReinforce)} variant="primary" className="w-full sm:w-auto px-10 py-3.5 sm:py-4 text-sm sm:text-base rounded-2xl shadow-xl shadow-blue-500/20">
              {isLast ? "Performance" : "Continue"}
            </Button>
          </div>
        </div>
      )}
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
