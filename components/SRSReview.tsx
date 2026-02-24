
import React, { useState } from 'react';
import { Question, SRSRating, MasteryCard } from '../types';
import { Button } from './Button';

interface SRSReviewProps {
  questions: Array<{ type: 'vignette' | 'mastery', data: Question | MasteryCard }>;
  onRate: (id: string, rating: SRSRating) => void;
  onClose: () => void;
}

export const SRSReview: React.FC<SRSReviewProps> = ({ questions, onRate, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionQuestions, setSessionQuestions] = useState(questions);

  const handleRate = (rating: SRSRating) => {
    const item = sessionQuestions[currentIndex];
    const id = item.type === 'vignette' ? (item.data as Question).id : (item.data as MasteryCard).id;
    
    onRate(id, rating);
    
    if (rating === 'again') {
      setSessionQuestions(prev => [...prev, item]);
    }

    if (currentIndex < sessionQuestions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
    } else {
      onClose();
    }
  };

  if (sessionQuestions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="bg-white dark:bg-slate-900 p-12 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-2xl">
           <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-2">Queue Mastery!</h2>
           <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">Concept layers fully cemented for today.</p>
           <Button onClick={onClose} className="w-full py-4 rounded-2xl">Return to Vault</Button>
        </div>
      </div>
    );
  }

  const current = sessionQuestions[currentIndex];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className={`px-4 py-1.5 rounded-full text-white text-[10px] font-black uppercase tracking-widest ${current.type === 'mastery' ? 'bg-indigo-600' : 'bg-blue-600'}`}>
            {current.type === 'mastery' ? 'Atomic Concept' : 'Clinical Vignette'}
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Item {currentIndex + 1} / {sessionQuestions.length}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold transition-colors">Exit Study</button>
      </div>

      <div className={`bg-white dark:bg-slate-900 p-8 sm:p-12 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-800 transition-all ${showAnswer ? 'ring-8 ring-blue-500/5' : ''}`}>
        <div className="prose prose-slate dark:prose-invert max-w-none mb-12">
          {current.type === 'mastery' ? (
            <div className="space-y-4">
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Review Layer: {(current.data as MasteryCard).type}</span>
              <p className="text-3xl font-black leading-tight text-slate-800 dark:text-slate-100">{(current.data as MasteryCard).front}</p>
            </div>
          ) : (
            <div className="space-y-4">
               <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Full Vignette Challenge</span>
               <p className="text-2xl leading-relaxed text-slate-800 dark:text-slate-100 font-medium italic">"{(current.data as Question).vignette}"</p>
            </div>
          )}
        </div>

        {!showAnswer ? (
          <Button variant="primary" className="w-full py-6 text-xl rounded-3xl" onClick={() => setShowAnswer(true)}>Reveal Solution</Button>
        ) : (
          <div className="space-y-8 animate-in zoom-in-95 duration-300">
             <div className="p-10 bg-blue-600 dark:bg-blue-700 rounded-[2.5rem] text-white shadow-2xl">
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-70">Clinical High-Yield</h4>
                <p className="text-3xl font-black leading-tight italic">
                  "{current.type === 'mastery' ? (current.data as MasteryCard).back : (current.data as Question).explanation.keyLearningPoint}"
                </p>
             </div>

             <div className="pt-10 border-t border-slate-100 dark:border-slate-800">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <button onClick={() => handleRate('again')} className="flex flex-col items-center gap-1 p-5 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 hover:scale-105 transition-all">
                    <span className="text-red-700 dark:text-red-400 font-black">Again</span>
                    <span className="text-[10px] text-red-400 font-bold uppercase tracking-tighter">&lt; 1min</span>
                  </button>
                  <button onClick={() => handleRate('hard')} className="flex flex-col items-center gap-1 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 hover:scale-105 transition-all">
                    <span className="text-slate-700 dark:text-slate-300 font-black">Hard</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">2d</span>
                  </button>
                  <button onClick={() => handleRate('good')} className="flex flex-col items-center gap-1 p-5 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-100 hover:scale-105 transition-all">
                    <span className="text-green-700 dark:text-green-400 font-black">Good</span>
                    <span className="text-[10px] text-green-400 font-bold uppercase tracking-tighter">4d</span>
                  </button>
                  <button onClick={() => handleRate('easy')} className="flex flex-col items-center gap-1 p-5 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 hover:scale-105 transition-all">
                    <span className="text-blue-700 dark:text-blue-400 font-black">Easy</span>
                    <span className="text-[10px] text-blue-400 font-bold uppercase tracking-tighter">7d</span>
                  </button>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
