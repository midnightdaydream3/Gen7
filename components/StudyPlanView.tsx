
import React, { useState } from 'react';
import { StudyPlan, HistoricalSession, Question, StudyWeek } from '../types';
import { Button } from './Button';
import { generateStudyPlan } from '../services/geminiService';

interface StudyPlanViewProps {
  history: HistoricalSession[];
  questionLibrary: Record<string, Question>;
  onClose: () => void;
}

export const StudyPlanView: React.FC<StudyPlanViewProps> = ({ history, questionLibrary, onClose }) => {
  const [examDate, setExamDate] = useState('');
  const [dailyHours, setDailyHours] = useState(4);
  const [isLoading, setIsLoading] = useState(false);
  const [plan, setPlan] = useState<StudyPlan | null>(() => {
    const saved = localStorage.getItem('abdu_study_plan');
    return saved ? JSON.parse(saved) : null;
  });

  const handleGenerate = async () => {
    if (!examDate) {
      alert("Please select your exam date.");
      return;
    }

    setIsLoading(true);
    try {
      // 1. Calculate Weak Areas for context
      const tagStats: Record<string, { correct: number, total: number }> = {};
      history.forEach(session => {
        session.details?.forEach(detail => {
          const q = questionLibrary[detail.questionId];
          if (q?.tags) {
            q.tags.forEach(tag => {
              if (!tagStats[tag]) tagStats[tag] = { correct: 0, total: 0 };
              tagStats[tag].total += 1;
              if (detail.isCorrect) tagStats[tag].correct += 1;
            });
          }
        });
      });

      const performanceSummary = Object.entries(tagStats)
        .map(([name, data]) => {
          const acc = Math.round((data.correct / data.total) * 100);
          return `${name}: ${acc}% accuracy (${data.total} Qs)`;
        })
        .join(', ');

      const targetExam = history.length > 0 ? history[0].examTypes.join('/') : 'USMLE';

      const generatedPlan = await generateStudyPlan(
        performanceSummary || "No historical data yet.",
        examDate,
        dailyHours,
        targetExam
      );

      setPlan(generatedPlan);
      localStorage.setItem('abdu_study_plan', JSON.stringify(generatedPlan));
    } catch (err) {
      console.error(err);
      alert("Failed to generate plan. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    if (confirm("Clear current study plan?")) {
      setPlan(null);
      localStorage.removeItem('abdu_study_plan');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">AI Strategist</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Personalized Board Exam Roadmap</p>
        </div>
        <div className="flex gap-2">
          {plan && <Button variant="outline" onClick={handleClear} className="text-red-500 border-red-100">Reset</Button>}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>

      {!plan ? (
        <div className="bg-white dark:bg-slate-900 p-8 sm:p-12 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl space-y-8">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">Build Your Roadmap</h3>
            <p className="text-slate-500 text-sm">We'll analyze your {history.length} recent sessions to prioritize topics.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Exam Date</label>
              <input 
                type="date" 
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Daily Study Capacity</label>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="1" 
                  max="12" 
                  value={dailyHours}
                  onChange={(e) => setDailyHours(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-xl font-black text-blue-600 w-12 text-center">{dailyHours}h</span>
              </div>
            </div>
          </div>

          <Button 
            className="w-full py-5 text-xl rounded-3xl shadow-xl shadow-blue-500/20" 
            onClick={handleGenerate}
            isLoading={isLoading}
          >
            Generate AI Strategy
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[2.5rem] text-white shadow-xl">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-2xl font-black">Current Study Plan</h3>
               <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md">Target: {examDate}</span>
             </div>
             <p className="opacity-80 text-sm leading-relaxed max-w-2xl">
               This plan is dynamically weighted toward your identified knowledge gaps in Internal Medicine and Specialty clerkships.
             </p>
          </div>

          <div className="grid gap-6">
            {/* Fix: Added explicit casting to [string, StudyWeek][] to resolve property access errors on type 'unknown' */}
            {(Object.entries(plan) as [string, StudyWeek][]).map(([week, data], idx) => (
              <div key={week} className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-8 hover:border-blue-200 transition-colors group">
                <div className="md:w-32 flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-50 dark:border-slate-800 pr-8">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Timeline</span>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100">W{idx + 1}</p>
                  <div className="mt-2 flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-lg">
                    <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-[10px] font-black text-blue-600">{data.hours}h</span>
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <h4 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-2">High-Yield Topics</h4>
                    <div className="flex flex-wrap gap-2">
                      {data.topics.map((t, i) => (
                        <span key={i} className="px-3 py-1 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold border border-slate-100 dark:border-slate-700">{t}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Weekly Strategy</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">{data.focusDescription}</p>
                  </div>

                  <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-50 dark:border-blue-900/20">
                    <h4 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-3">Recommended Resources</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {data.resources.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                           <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                           {r}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
