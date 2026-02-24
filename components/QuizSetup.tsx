
import React from 'react';
import { MedicalSpecialty, ExamType, ClinicalComplexity } from '../types';
import { Button } from './Button';

interface QuizSetupProps {
  onStart: (specialties: MedicalSpecialty[], examTypes: ExamType[], complexity: ClinicalComplexity, count: number, topics: string, autoReinforce: boolean) => void;
  isLoading: boolean;
  hasBookmarks?: boolean;
  onReviewBookmarks?: () => void;
  dueSRSCount?: number;
  onStartSRS?: () => void;
  activeSessionProgress?: { current: number; total: number; skippedCount: number };
  onResume?: () => void;
  onDiscardSession?: () => void;
  lastCompletedSession?: any;
  onViewLastResults?: () => void;
}

export const QuizSetup: React.FC<QuizSetupProps> = ({ 
  onStart, 
  isLoading, 
  hasBookmarks, 
  onReviewBookmarks, 
  dueSRSCount = 0, 
  onStartSRS,
  activeSessionProgress,
  onResume,
  onDiscardSession,
  lastCompletedSession,
  onViewLastResults
}) => {
  const [selectedSpecialties, setSelectedSpecialties] = React.useState<MedicalSpecialty[]>([MedicalSpecialty.INTERNAL_MEDICINE]);
  const [selectedExamTypes, setSelectedExamTypes] = React.useState<ExamType[]>([ExamType.STEP_2_CK]);
  const [complexity, setComplexity] = React.useState<ClinicalComplexity>(ClinicalComplexity.MEDIUM);
  const [count, setCount] = React.useState(5);
  const [topics, setTopics] = React.useState("");
  const [autoReinforce, setAutoReinforce] = React.useState(true);

  const toggleSpecialty = (s: MedicalSpecialty) => {
    setSelectedSpecialties(prev => 
      prev.includes(s) 
        ? prev.filter(item => item !== s) 
        : [...prev, s]
    );
  };

  const toggleExamType = (e: ExamType) => {
    setSelectedExamTypes(prev => 
      prev.includes(e) 
        ? (prev.length > 1 ? prev.filter(item => item !== e) : prev) 
        : [...prev, e]
    );
  };

  const handleStart = () => {
    if (selectedSpecialties.length === 0 && !topics.trim()) {
      alert("Please select at least one specialty or provide custom topics.");
      return;
    }
    if (selectedExamTypes.length === 0) {
      alert("Please select at least one exam type.");
      return;
    }
    onStart(selectedSpecialties, selectedExamTypes, complexity, count, topics, autoReinforce);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {activeSessionProgress && onResume && (
        <div className="bg-blue-600 dark:bg-blue-700 p-8 rounded-[2rem] text-white shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6 animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-black">Active Block Found</p>
              <p className="text-blue-100/80 text-sm font-medium">
                Question {activeSessionProgress.current} of {activeSessionProgress.total} in progress.
                {activeSessionProgress.skippedCount > 0 && (
                  <span className="block mt-1 bg-white/10 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest inline-block">
                    {activeSessionProgress.skippedCount} Deferred at End
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={onDiscardSession}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-blue-200 hover:text-white transition-colors"
            >
              Discard
            </button>
            <Button 
              variant="primary" 
              className="bg-white text-blue-600 hover:bg-blue-50 flex-1 sm:flex-none py-3 px-8" 
              onClick={onResume}
            >
              Resume Quiz
            </Button>
          </div>
        </div>
      )}

      {lastCompletedSession && onViewLastResults && !activeSessionProgress && (
        <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2" />
              </svg>
            </div>
            <div>
              <p className="text-slate-800 dark:text-slate-200 font-black">Last Session Recovery</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">View analysis for your last completed block.</p>
            </div>
          </div>
          <Button variant="secondary" className="bg-white dark:bg-slate-700" onClick={onViewLastResults}>View Results</Button>
        </div>
      )}

      {dueSRSCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-3xl border border-amber-100 dark:border-amber-800 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-amber-800 dark:text-amber-200 font-black">Retention Check Due</p>
              <p className="text-amber-600 dark:text-amber-400 text-xs font-medium">{dueSRSCount} concepts ready for spaced repetition review.</p>
            </div>
          </div>
          <Button variant="primary" className="bg-amber-600 hover:bg-amber-700 shadow-amber-500/20" onClick={onStartSRS}>Review Now</Button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100">Clinical Mastery</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Curate your high-yield study session.</p>
          </div>
          {hasBookmarks && (
            <button 
              onClick={onReviewBookmarks}
              className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-100 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-tight">Vault</span>
            </button>
          )}
        </div>
        
        <div className="space-y-8 mt-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Exam Target</label>
            <div className="grid grid-cols-2 gap-4">
              {Object.values(ExamType).map((e) => (
                <button
                  key={e}
                  onClick={() => toggleExamType(e)}
                  className={`p-4 rounded-2xl border-2 transition-all text-sm font-bold ${
                    selectedExamTypes.includes(e) 
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 shadow-sm" 
                      : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/50"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Clinical Complexity</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(ClinicalComplexity).map((c) => (
                <button
                  key={c}
                  onClick={() => setComplexity(c)}
                  className={`px-2 py-4 rounded-2xl border-2 transition-all text-[10px] sm:text-[11px] font-bold uppercase tracking-tight text-center leading-tight flex items-center justify-center min-h-[64px] ${
                    complexity === c 
                      ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400" 
                      : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Specialties Focus</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.values(MedicalSpecialty).map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSpecialty(s)}
                  className={`px-3 py-3 rounded-xl border text-[11px] font-bold transition-all text-center ${
                    selectedSpecialties.includes(s)
                      ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-800"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Custom Focus Areas</label>
            <textarea
              placeholder="e.g. Blistering skin diseases, Aortic dissection, Glaucoma management..."
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none transition-all text-sm min-h-[100px] resize-none dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Adaptive Reinforcement</p>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Auto-generate 3 concepts on miss</p>
            </div>
            <button 
              onClick={() => setAutoReinforce(!autoReinforce)}
              className={`w-12 h-6 rounded-full transition-colors relative ${autoReinforce ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${autoReinforce ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Block Depth</label>
              <span className="text-blue-600 dark:text-blue-400 font-black text-xl">{count}</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="100" 
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-500"
            />
          </div>

          <Button 
            variant="primary" 
            className="w-full py-5 text-lg rounded-2xl shadow-xl shadow-blue-500/20" 
            isLoading={isLoading}
            onClick={handleStart}
          >
            {isLoading ? "Synthesizing Vignettes..." : "Generate Session"}
          </Button>
        </div>
      </div>
    </div>
  );
};
