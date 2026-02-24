
import React, { useState } from 'react';
import { QuizSession, Question } from '../types';
import { Button } from './Button';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ResultsViewProps {
  session: QuizSession;
  onRestart: () => void;
  onViewAnalytics: () => void;
  onViewBookmarks: () => void;
  onAddToSRS?: (q: Question) => void;
  onExportGuide?: () => void;
  onExportSummary?: () => void;
  isExporting?: boolean;
}

export const ResultsView: React.FC<ResultsViewProps> = ({ 
  session, 
  onRestart, 
  onViewAnalytics, 
  onViewBookmarks,
  onAddToSRS,
  onExportGuide,
  onExportSummary,
  isExporting
}) => {
  const [filterIncorrect, setFilterIncorrect] = useState(false);
  const [expandedIndices, setExpandedIndices] = useState<number[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);

  const toggleExpand = (idx: number) => {
    setExpandedIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const correctCount = session.userAnswers.reduce((acc, ans, idx) => 
    ans === session.questions[idx].correctIndex ? acc + 1 : acc, 0
  );
  
  const total = session.questions.length;
  const score = Math.round((correctCount / total) * 100);

  const data = [
    { name: 'Correct', value: correctCount, color: '#10B981' },
    { name: 'Incorrect', value: total - correctCount, color: '#EF4444' }
  ];

  const filteredQuestions = session.questions.map((q, idx) => ({ q, idx }))
    .filter(({ idx }) => !filterIncorrect || session.userAnswers[idx] !== session.questions[idx].correctIndex);

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-8 pb-20 animate-in fade-in duration-700 px-0 sm:px-0 w-full overflow-x-hidden">
      <div className="bg-white dark:bg-slate-900 p-5 sm:p-16 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 text-center overflow-hidden w-full box-border">
        <h2 className="text-2xl sm:text-4xl font-black text-slate-800 dark:text-slate-100 mb-3 sm:mb-4 tracking-tight">Block Analysis</h2>
        
        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mb-6 sm:mb-10">
          {session.examTypes.map(e => (
            <span key={e} className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-wider">{e}</span>
          ))}
          <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-wider">{session.complexity}</span>
        </div>
        
        <div className="flex flex-col md:flex-row items-center justify-around gap-6 sm:gap-12 mb-8 sm:mb-12 w-full">
          <div className="w-40 h-40 sm:w-64 sm:h-64 relative flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={8}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[8px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">Score</span>
              <span className="text-2xl sm:text-5xl font-black text-slate-800 dark:text-slate-100 leading-none">{score}%</span>
            </div>
          </div>

          <div className="text-center md:text-left space-y-5 w-full max-w-sm px-1">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4 w-full">
              <div className="p-3 sm:p-6 bg-green-50 dark:bg-green-900/10 rounded-xl sm:rounded-2xl border border-green-100 dark:border-green-900/20">
                <p className="text-[8px] sm:text-[10px] text-green-600 dark:text-green-400 font-black uppercase tracking-widest mb-1">Correct</p>
                <p className="text-xl sm:text-4xl font-black text-green-700 dark:text-green-300">{correctCount}</p>
              </div>
              <div className="p-3 sm:p-6 bg-red-50 dark:bg-red-900/10 rounded-xl sm:rounded-2xl border border-red-100 dark:border-red-900/20">
                <p className="text-[8px] sm:text-[10px] text-red-600 dark:text-red-400 font-black uppercase tracking-widest mb-1">Missed</p>
                <p className="text-xl sm:text-4xl font-black text-red-700 dark:text-red-300">{total - correctCount}</p>
              </div>
            </div>
            <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 font-medium italic leading-relaxed mx-auto md:mx-0 max-w-[220px] sm:max-w-none">
              Synthesize learning points or review vignettes below.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
          <Button onClick={onRestart} className="py-3.5 sm:py-5 text-base sm:text-xl rounded-xl sm:rounded-2xl shadow-xl shadow-blue-500/20">
            Launch New Block
          </Button>

          <Button 
            variant="secondary" 
            className="w-full py-3.5 sm:py-5 text-base sm:text-xl rounded-xl sm:rounded-2xl bg-blue-600 dark:bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => setShowExportModal(true)}
            isLoading={isExporting}
          >
            <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
            <span className="truncate">{isExporting ? "Generating Doc..." : "Export Results"}</span>
          </Button>
        </div>
      </div>

      {/* Export Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg p-6 sm:p-8 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-700 space-y-6 animate-in zoom-in-95 duration-200">
             <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </div>
                <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">Export Session</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Select your preferred document format</p>
             </div>
             
             <div className="grid gap-3">
                <button 
                  onClick={() => { setShowExportModal(false); if(onExportGuide) onExportGuide(); }}
                  className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-2 border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-all text-left group"
                >
                  <div className="p-3 bg-white dark:bg-slate-700 rounded-xl shadow-sm text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-300">Q&A Export</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Full breakdown with Questions, Answers, and Detailed Explanations.</p>
                  </div>
                </button>

                <button 
                  onClick={() => { setShowExportModal(false); if(onExportSummary) onExportSummary(); }}
                  className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-green-50 dark:hover:bg-green-900/20 border-2 border-transparent hover:border-green-200 dark:hover:border-green-800 transition-all text-left group"
                >
                  <div className="p-3 bg-white dark:bg-slate-700 rounded-xl shadow-sm text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-800 dark:text-slate-100 group-hover:text-green-700 dark:group-hover:text-green-300">High-Yield Notes</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Consolidated study notes. <b>No Q&A format.</b> Focus on Pathophysiology & Pearls.</p>
                  </div>
                </button>
             </div>
             
             <button 
               onClick={() => setShowExportModal(false)}
               className="w-full py-3 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
             >
               Cancel
             </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4 w-full">
        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-6 rounded-[1.25rem] sm:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
          <div className="w-7 h-7 sm:w-10 sm:h-10 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg sm:rounded-xl flex items-center justify-center mb-2 sm:mb-3">
            <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          </div>
          <h4 className="text-[10px] sm:text-sm font-black text-slate-800 dark:text-slate-100 mb-1">Vault</h4>
          <Button variant="secondary" className="w-full text-[9px] sm:text-[10px] py-1.5 mt-1 sm:mt-2 h-auto" onClick={onViewBookmarks}>Review</Button>
        </div>
        
        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-6 rounded-[1.25rem] sm:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
          <div className="w-7 h-7 sm:w-10 sm:h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center mb-2 sm:mb-3">
            <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </div>
          <h4 className="text-[10px] sm:text-sm font-black text-slate-800 dark:text-slate-100 mb-1">Filter</h4>
          <Button variant="secondary" className={`w-full text-[9px] sm:text-[10px] py-1.5 mt-1 sm:mt-2 h-auto ${filterIncorrect ? 'bg-red-500 text-white' : ''}`} onClick={() => setFilterIncorrect(!filterIncorrect)}>
            {filterIncorrect ? "All" : "Missed"}
          </Button>
        </div>

        <div className="col-span-2 md:col-span-1 bg-white dark:bg-slate-900 p-3.5 sm:p-6 rounded-[1.25rem] sm:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
          <div className="w-7 h-7 sm:w-10 sm:h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center mb-2 sm:mb-3">
            <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
          </div>
          <h4 className="text-[10px] sm:text-sm font-black text-slate-800 dark:text-slate-100 mb-1">Stats</h4>
          <Button variant="secondary" className="w-full text-[9px] sm:text-[10px] py-1.5 mt-1 sm:mt-2 h-auto" onClick={onViewAnalytics}>Analytics</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 w-full">
        {filteredQuestions.map(({ q, idx }) => {
          const isCorrect = session.userAnswers[idx] === q.correctIndex;
          const isExpanded = expandedIndices.includes(idx);
          
          return (
            <div key={q.id} className={`bg-white dark:bg-slate-900 rounded-xl sm:rounded-3xl border transition-all w-full overflow-hidden ${
              isExpanded ? 'border-blue-200 dark:border-blue-900 ring-1 ring-blue-100 dark:ring-blue-900/20 shadow-md' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 shadow-sm'
            }`}>
              <div 
                className="p-4 sm:p-6 flex items-center gap-3 sm:gap-6 cursor-pointer w-full overflow-hidden"
                onClick={() => toggleExpand(idx)}
              >
                <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl flex items-center justify-center font-black text-white flex-shrink-0 shadow-lg text-[10px] sm:text-base ${
                  isCorrect ? "bg-green-500" : "bg-red-500"
                }`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-lg font-semibold text-slate-800 dark:text-slate-200 italic break-words whitespace-pre-wrap">"{q.vignette}"</p>
                  <div className="flex gap-3 sm:gap-4 mt-1">
                    <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-tighter">Your: {String.fromCharCode(65 + session.userAnswers[idx])}</span>
                    <span className="text-[8px] sm:text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-tighter">Key: {String.fromCharCode(65 + q.correctIndex)}</span>
                  </div>
                </div>
                <svg className={`w-4 h-4 text-slate-300 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {isExpanded && (
                <div className="px-4 sm:px-6 pb-5 sm:pb-8 pt-1 sm:pt-2 space-y-3 sm:space-y-6 animate-in slide-in-from-top-2 duration-300 w-full box-border">
                  <div className="p-3 sm:p-5 bg-slate-50 dark:bg-slate-800/50 rounded-lg sm:rounded-2xl border-l-4 border-blue-500 text-[11px] sm:text-sm text-slate-600 dark:text-slate-400 italic leading-relaxed break-words whitespace-pre-wrap">
                    {q.vignette}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4 w-full">
                    <div className="p-3.5 sm:p-5 bg-white dark:bg-slate-900/50 rounded-xl sm:rounded-2xl border border-slate-100 dark:border-slate-800 shadow-inner">
                      <h5 className="text-[8px] sm:text-[10px] font-black text-green-600 uppercase mb-1.5 tracking-widest">Mastery Pearl</h5>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-bold italic break-words whitespace-pre-wrap">{q.explanation.keyLearningPoint}</p>
                    </div>
                    <div className="p-3.5 sm:p-5 bg-white dark:bg-slate-900/50 rounded-xl sm:rounded-2xl border border-slate-100 dark:border-slate-800 shadow-inner">
                      <h5 className="text-[8px] sm:text-[10px] font-black text-blue-600 uppercase mb-1.5 tracking-widest">Logic Analysis</h5>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 leading-relaxed break-words whitespace-pre-wrap">{q.explanation.correct}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
