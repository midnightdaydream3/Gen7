
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MedicalSpecialty, ExamType, ClinicalComplexity, QuizSession, Question, HistoricalSession, SRSState, SRSRating, MasteryCard, StudyPlan, LifetimeStats } from './types';
import { generateQuestions, generateSimilarQuestions, generateMasteryCards, generateSessionSummary, generateStudyGuide } from './services/geminiService';
import { dbService } from './services/databaseService';
import { QuizSetup } from './components/QuizSetup';
import { QuestionCard } from './components/QuestionCard';
import { ResultsView } from './components/ResultsView';
import { BookmarksView } from './components/BookmarksView';
import { AnalyticsView } from './components/AnalyticsView';
import { SRSReview } from './components/SRSReview';
import { Button } from './components/Button';

// Extend Window interface for AI Studio helpers
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
    hasSelectedApiKey: () => Promise<boolean>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<'setup' | 'quiz' | 'results' | 'bookmarks' | 'analytics' | 'srs'>('setup');
  const [isReady, setIsReady] = useState(false);
  const [generatingTopic, setGeneratingTopic] = useState<string | null>(null);
  
  // States
  const [session, setSession] = useState<QuizSession | null>(null);
  const [completedSession, setCompletedSession] = useState<QuizSession | null>(null);
  const [lastCompletedSession, setLastCompletedSession] = useState<QuizSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [bookmarks, setBookmarks] = useState<Question[]>([]);
  const [masteryCards, setMasteryCards] = useState<Record<string, MasteryCard[]>>({});
  const [history, setHistory] = useState<HistoricalSession[]>([]);
  const [srsStates, setSrsStates] = useState<Record<string, SRSState>>({});
  const [questionLibrary, setQuestionLibrary] = useState<Record<string, Question>>({});
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | undefined>(undefined);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [pendingQuitAnswer, setPendingQuitAnswer] = useState<number | null>(null);

  // Time tracking refs
  const activeTimeMsRef = React.useRef(0);
  const lastActiveTimeRef = React.useRef(Date.now());

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const delta = Date.now() - lastActiveTimeRef.current;
        if (delta > 0 && delta < 86400000) { // Sanity check: less than 1 day
          activeTimeMsRef.current += delta;
        }
        localStorage.setItem('abdu_active_time', activeTimeMsRef.current.toString());
      } else {
        lastActiveTimeRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Database Initialization & Key Check
  useEffect(() => {
    const initData = async () => {
      try {
        console.log("Initializing App Data...");
        
        // 1. FAST PATH: Restore active session from localStorage immediately
        const savedSession = localStorage.getItem('abdu_active_session');
        if (savedSession) {
          try {
            const parsedSession = JSON.parse(savedSession);
            setSession(parsedSession);
            
            const savedTime = localStorage.getItem('abdu_active_time');
            if (savedTime && !isNaN(parseInt(savedTime, 10))) {
              activeTimeMsRef.current = parseInt(savedTime, 10);
            } else {
              activeTimeMsRef.current = 0;
            }
            lastActiveTimeRef.current = Date.now();

            if (parsedSession && Array.isArray(parsedSession.questions) && parsedSession.questions.length > 0) {
              setView('quiz');
            }
          } catch (e) {
            console.error("Failed to restore session", e);
            localStorage.removeItem('abdu_active_session');
          }
        }

        // Restore last completed session for recovery
        const savedLastSession = localStorage.getItem('abdu_last_completed_session');
        if (savedLastSession) {
          try {
             setLastCompletedSession(JSON.parse(savedLastSession));
          } catch (e) { localStorage.removeItem('abdu_last_completed_session'); }
        }

        // 2. BACKGROUND: Initialize DB and load heavy data
        // We don't block the UI for this, but we set isReady(true) after a short delay or success
        const dbPromise = async () => {
          // Add a timeout to IndexedDB initialization to prevent hanging on "Loading Clinical Environment"
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB Init Timeout")), 5000));
          const initTask = async () => {
            await dbService.init();
            return await dbService.getAllData();
          };
          
          try {
            const data = await Promise.race([initTask(), timeoutPromise]) as any;
            
            console.log("Data loaded from DB:", { 
              historyCount: data.history.length, 
              hasStats: !!data.lifetimeStats 
            });
            
            setHistory(data.history);
            setBookmarks(data.bookmarks);
            setMasteryCards(data.masteryCards);
            setSrsStates(data.srsStates);
            setQuestionLibrary(data.questionLibrary);
            setStudyPlan(data.studyPlan);
            setLifetimeStats(data.lifetimeStats);
          } catch (err) {
            console.warn("DB init timed out or failed, continuing with empty state", err);
          }
        };

        await dbPromise();

        setIsReady(true);
        // Clear restore message flag after successful init
        localStorage.removeItem('abdu_show_restore_msg');
      } catch (e) {
        console.error("Initialization failed:", e);
        // Force ready state even on error to allow UI to load (possibly with empty data)
        setIsReady(true);
        localStorage.removeItem('abdu_show_restore_msg');
      }
    };
    initData();
  }, []);

  const handleResetData = async () => {
    try {
      await dbService.resetData();
      localStorage.clear();
      localStorage.setItem('abdu_show_restore_msg', 'true');
      window.location.reload();
    } catch (e) {
      alert("Failed to reset data");
    }
  };

  // Sync to Database on changes
  useEffect(() => { if (isReady && !dbService.isImporting) dbService.set('bookmarks', bookmarks); }, [bookmarks, isReady]);
  useEffect(() => { if (isReady && !dbService.isImporting) dbService.set('masteryCards', masteryCards); }, [masteryCards, isReady]);
  useEffect(() => { if (isReady && !dbService.isImporting) dbService.set('srsStates', srsStates); }, [srsStates, isReady]);
  useEffect(() => { if (isReady && !dbService.isImporting) dbService.set('questionLibrary', questionLibrary); }, [questionLibrary, isReady]);
  useEffect(() => { if (isReady && !dbService.isImporting) dbService.set('studyPlan', studyPlan); }, [studyPlan, isReady]);

  useEffect(() => {
    if (session) localStorage.setItem('abdu_active_session', JSON.stringify(session));
    else localStorage.removeItem('abdu_active_session');
  }, [session]);

  useEffect(() => {
    if (lastCompletedSession) localStorage.setItem('abdu_last_completed_session', JSON.stringify(lastCompletedSession));
    else localStorage.removeItem('abdu_last_completed_session');
  }, [lastCompletedSession]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  const toggleTheme = () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    localStorage.setItem('theme', nextMode ? 'dark' : 'light');
  };

  const handleError = async (error: any) => {
    const errorMsg = error?.message || JSON.stringify(error);
    const status = error?.status || error?.error?.code;

    // Handle 403 (Permission Denied)
    if (status === 403 || errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED")) {
      alert("Permission Denied: API access is restricted.");
      return;
    }

    // Handle 429 (Rate Limit)
    if (status === 429 || errorMsg.includes("429")) {
      alert("API Quota Reached. Please wait 60s before trying again.");
      return;
    }

    console.error(error);
    if (isLoading) alert("API Error. Please try again.");
  };

  const addToLibrary = (questions: Question[]) => {
    setQuestionLibrary(prev => {
      const next = { ...prev };
      questions.forEach(q => { if (!next[q.id]) next[q.id] = q; });
      return next;
    });
  };

  const updateSRS = useCallback((cardId: string, rating: SRSRating) => {
    setSrsStates(prev => {
      const current = prev[cardId] || { cardId, nextReview: 0, interval: 0, ease: 2.3, repetitions: 0 };
      let { interval, ease, repetitions } = current;
      if (rating === 'again') {
        repetitions = 0;
        interval = 0;
        ease = Math.max(1.3, ease - 0.2);
      } else {
        if (repetitions === 0) interval = 1;
        else if (repetitions === 1) interval = 6;
        else interval = Math.ceil(interval * (rating === 'hard' ? 1.2 : rating === 'good' ? ease : ease * 1.5));
        repetitions += 1;
        if (rating === 'hard') ease = Math.max(1.3, ease - 0.15);
        if (rating === 'easy') ease += 0.15;
      }
      const nextReview = Date.now() + (interval * 24 * 60 * 60 * 1000);
      return { ...prev, [cardId]: { ...current, nextReview, interval, ease, repetitions } };
    });
  }, []);

  const toggleBookmark = (q: Question) => {
    const isAlreadyBookmarked = bookmarks.some(b => b.id === q.id);
    if (isAlreadyBookmarked) setBookmarks(prev => prev.filter(b => b.id !== q.id));
    else {
      setBookmarks(prev => [...prev, q]);
      addToLibrary([q]);
      setSrsStates(prev => {
        if (prev[q.id]) return prev;
        return { ...prev, [q.id]: { cardId: q.id, nextReview: Date.now(), interval: 0, ease: 2.3, repetitions: 0 } };
      });
    }
  };

  const updateDeepDive = (questionId: string, deepDiveContent: string) => {
    setQuestionLibrary(prev => {
      if (!prev[questionId]) return prev;
      return {
        ...prev,
        [questionId]: { ...prev[questionId], deepDive: deepDiveContent }
      };
    });
    
    if (session) {
      setSession(prev => {
        if (!prev) return null;
        const updatedQuestions = prev.questions.map(q => 
          q.id === questionId ? { ...q, deepDive: deepDiveContent } : q
        );
        return { ...prev, questions: updatedQuestions };
      });
    }
  };

  const dissectQuestion = async (q: Question, forceRegen: boolean = false) => {
    if (masteryCards[q.id] && !forceRegen) return;
    try {
      const layers = await generateMasteryCards(q);
      setMasteryCards(prev => ({ ...prev, [q.id]: layers }));
      layers.forEach(card => updateSRS(card.id, 'again'));
    } catch (err) { handleError(err); }
  };
  const startQuiz = async (
    specialties: MedicalSpecialty[], 
    examTypes: ExamType[], 
    complexity: ClinicalComplexity, 
    count: number, 
    topics: string, 
    autoReinforce: boolean
  ) => {
    setIsLoading(true); // Show loading immediately
    
    if (topics) setGeneratingTopic(topics);
    setSelectedAnswer(null); // Reset answer for new quiz
    try {
      const initialBatchSize = Math.min(count, 10);
      const questions = await generateQuestions(specialties, examTypes, complexity, initialBatchSize, topics);
      if (questions.length === 0) throw new Error("Empty response");
      
      addToLibrary(questions);
      const newSession: QuizSession = { 
        questions, 
        currentQuestionIndex: 0, 
        userAnswers: [], 
        startTime: Date.now(), 
        specialties, 
        examTypes, 
        complexity, 
        topics, 
        skippedIds: [],
        autoReinforce
      };
      
      activeTimeMsRef.current = 0;
      lastActiveTimeRef.current = Date.now();
      localStorage.setItem('abdu_active_time', '0');
      
      setSession(newSession);
      setCompletedSession(null);
      setView('quiz');

      // Background batch generation for large quizzes
      if (count > initialBatchSize) {
        setBackgroundProcessing(true);
        const remaining = count - initialBatchSize;
        const batchCount = Math.ceil(remaining / 10);
        
        (async () => {
          try {
            let accumulatedQuestions = [...questions];
            for (let i = 0; i < batchCount; i++) {
              const currentBatchSize = Math.min(remaining - (i * 10), 10);
              try {
                // Pass existing tags from THIS block only to avoid repetition
                const currentTags = accumulatedQuestions.flatMap(q => q.tags || []);
                
                const batch = await generateQuestions(specialties, examTypes, complexity, currentBatchSize, topics, currentTags);
                addToLibrary(batch);
                accumulatedQuestions = [...accumulatedQuestions, ...batch];
                
                setSession(prev => {
                  if (!prev) return null;
                  return { ...prev, questions: [...prev.questions, ...batch] };
                });
              } catch (err) {
                console.error("Background batch generation failed", err);
                break;
              }
            }
          } finally {
            setBackgroundProcessing(false);
            setGeneratingTopic(null);
          }
        })();
      } else {
        setGeneratingTopic(null);
      }
    } catch (error) { 
      handleError(error); 
      setGeneratingTopic(null);
    } finally { 
      setIsLoading(false); 
    }
  };

  const handlePrev = () => {
    if (!session) return;
    if (session.currentQuestionIndex > 0) {
      const prevIdx = session.currentQuestionIndex - 1;
      setSession(prev => prev ? { ...prev, currentQuestionIndex: prevIdx } : null);
      setSelectedAnswer(session.userAnswers[prevIdx] ?? null);
    }
  };

  const handleNext = (userFocus?: string, manualReinforce?: boolean) => {
    if (!session || selectedAnswer === null) return;
    const currentIdx = session.currentQuestionIndex;
    const currentQuestion = session.questions[currentIdx];
    const isCorrect = selectedAnswer === currentQuestion.correctIndex;

    const updatedAnswers = [...session.userAnswers];
    updatedAnswers[currentIdx] = selectedAnswer;
    const shouldReinforce = manualReinforce || (!isCorrect && session.userAnswers[currentIdx] === undefined && session.autoReinforce);

    const nextIndex = currentIdx + 1;
    if (nextIndex < session.questions.length) {
      setSession(prev => prev ? { ...prev, currentQuestionIndex: nextIndex, userAnswers: updatedAnswers } : null);
      setSelectedAnswer(session.userAnswers[nextIndex] ?? null);
    } else {
      const finalSession = { ...session, userAnswers: updatedAnswers };
      processSessionCompletion(finalSession);
      
      setCompletedSession(finalSession);
      setLastCompletedSession(finalSession);
      setSession(null);
      setView('results');
    }

    if (shouldReinforce) {
      setBackgroundProcessing(true);
      generateSimilarQuestions(currentQuestion, session.examTypes, session.complexity, 3, userFocus)
        .then(remediation => {
          if (remediation.length === 0) return;
          addToLibrary(remediation);
          setSession(prev => {
            if (!prev) return null;
            const updatedQuestions = [...prev.questions];
            remediation.forEach(newQ => { updatedQuestions.push(newQ); });
            return { ...prev, questions: updatedQuestions };
          });
        }).catch(err => console.error(err)).finally(() => setBackgroundProcessing(false));
    }
  };

  // updateDeepDive moved to line 187

  const processSessionCompletion = async (finalSession: QuizSession) => {
    const correctCount = finalSession.userAnswers.reduce((acc, ans, idx) => ans === finalSession.questions[idx].correctIndex ? acc + 1 : acc, 0);
    
    // Calculate final active time
    if (!document.hidden) {
      activeTimeMsRef.current += Date.now() - lastActiveTimeRef.current;
      lastActiveTimeRef.current = Date.now();
    }
    const finalTimeTaken = activeTimeMsRef.current;
    localStorage.removeItem('abdu_active_time');

    const details = finalSession.questions.map((q, idx) => ({
      questionId: q.id,
      isCorrect: finalSession.userAnswers[idx] === q.correctIndex
    }));

    const newHistoryEntry: HistoricalSession = {
      id: crypto.randomUUID(), 
      timestamp: Date.now(), 
      totalQuestions: finalSession.questions.length,
      correctAnswers: correctCount, 
      timeTakenMs: finalTimeTaken,
      specialties: finalSession.specialties, 
      examTypes: finalSession.examTypes,
      complexity: finalSession.complexity, // Save complexity for analysis
      details: details
    };
    
    // Update local state and Persist to DB
    setHistory(prev => [newHistoryEntry, ...prev]);
    const newLifetimeStats = await dbService.saveSession(newHistoryEntry);
    setLifetimeStats(newLifetimeStats);
  };

  const downloadTxt = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportGuide = async () => {
    if (!completedSession) return;
    setIsExporting(true);
    try {
      const textContent = await generateStudyGuide(completedSession.questions);
      downloadTxt(textContent, `Clinical_Study_Guide_${new Date().toISOString().slice(0,10)}.txt`);
    } catch (err) {
      console.error(err);
      alert("Failed to export study guide. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSummary = async () => {
    if (!completedSession) return;
    setIsExporting(true);
    try {
      const textContent = await generateSessionSummary(completedSession.questions);
      downloadTxt(textContent, `High_Yield_Summary_${new Date().toISOString().slice(0,10)}.txt`);
    } catch (err) {
      console.error(err);
      alert("Failed to export summary. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const dueSRSItems = useMemo(() => {
    const now = Date.now();
    const due = (Object.values(srsStates) as SRSState[]).filter(s => s.nextReview <= now);
    return due.map(s => {
      if (questionLibrary[s.cardId]) return { type: 'vignette' as const, data: questionLibrary[s.cardId] };
      for (const parentId in masteryCards) {
        const card = masteryCards[parentId].find(c => c.id === s.cardId);
        if (card) return { type: 'mastery' as const, data: card };
      }
      return null;
    }).filter(i => !!i);
  }, [srsStates, questionLibrary, masteryCards]);

  const startQuizFromTopic = (topic: string, count: number = 10, autoReinforce: boolean = false) => {
    startQuiz([MedicalSpecialty.INTERNAL_MEDICINE], [ExamType.STEP_2_CK], ClinicalComplexity.MEDIUM, count, topic, autoReinforce);
  };

  const handleQuitQuiz = (currentAnswer: number | null) => {
    if (!session) return;
    setPendingQuitAnswer(currentAnswer);
    setShowQuitConfirm(true);
  };

  const executeQuit = () => {
    setShowQuitConfirm(false);
    if (!session) return;
    
    let finalAnswers = [...session.userAnswers];
    let finalQuestions = [...session.questions];

    if (pendingQuitAnswer !== null) {
      finalAnswers[session.currentQuestionIndex] = pendingQuitAnswer;
    }

    const answeredCount = finalAnswers.filter(a => a !== undefined && a !== null).length;
    if (answeredCount === 0) {
      setSession(null);
      setView('setup');
      return;
    }
    
    finalQuestions = finalQuestions.slice(0, answeredCount);
    finalAnswers = finalAnswers.slice(0, answeredCount);
    
    const finalSession = { ...session, questions: finalQuestions, userAnswers: finalAnswers };
    processSessionCompletion(finalSession);
    setCompletedSession(finalSession);
    setLastCompletedSession(finalSession);
    setSession(null);
    setView('results');
  };

  if (!isReady) {
    const showRestoreMsg = localStorage.getItem('abdu_show_restore_msg') === 'true';
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 animate-in fade-in duration-700">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] animate-pulse">
            {showRestoreMsg ? 'Restoring Clinical Memory...' : 'Loading Clinical Environment...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 overflow-x-hidden">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => setView('setup')} role="button">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg sm:rounded-xl flex items-center justify-center text-white font-bold shadow-lg">A</div>
            <h1 className="text-sm sm:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">Abdu is the goat</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
             {backgroundProcessing && (
               <div className="flex items-center gap-2 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 animate-in fade-in zoom-in duration-300 shadow-sm cursor-help hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors" title="Additional questions are being generated in the background">
                 <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></div>
                 <span className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest whitespace-nowrap">Generating...</span>
               </div>
             )}
             <button onClick={() => setView('analytics')} className={`p-2 rounded-xl ${view === 'analytics' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800'}`}>📊</button>
             <button onClick={() => setView('bookmarks')} className={`p-2 rounded-xl border-2 transition-all ${view === 'bookmarks' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 hover:border-blue-200'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
             </button>
             <button onClick={() => setView('srs')} className={`p-2 rounded-xl relative ${view === 'srs' ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800'}`}>
               {dueSRSItems.length > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] flex items-center justify-center text-white">{dueSRSItems.length}</span>}
               🗃️
             </button>
             <button onClick={toggleTheme} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">{isDarkMode ? '🌞' : '🌙'}</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 relative">
        {view === 'setup' && (
          <QuizSetup 
            onStart={startQuiz} 
            isLoading={isLoading} 
            dueSRSCount={dueSRSItems.length} 
            onStartSRS={() => setView('srs')} 
            onResume={() => setView('quiz')} 
            onDiscardSession={() => setSession(null)} 
            activeSessionProgress={session ? { current: session.currentQuestionIndex + 1, total: session.questions.length, skippedCount: session.skippedIds?.length || 0 } : undefined} 
            lastCompletedSession={lastCompletedSession}
            onViewLastResults={() => { setCompletedSession(lastCompletedSession); setView('results'); }}
          />
        )}

        {view === 'quiz' && session && (
          <QuestionCard 
            question={session.questions[session.currentQuestionIndex]} 
            selectedAnswer={selectedAnswer} 
            onAnswer={setSelectedAnswer} 
            onNext={handleNext} 
            onPrev={handlePrev}
            isLast={session.currentQuestionIndex === session.questions.length - 1} 
            isFirst={session.currentQuestionIndex === 0} 
            onToggleBookmark={() => toggleBookmark(session.questions[session.currentQuestionIndex])}
            isBookmarked={bookmarks.some(b => b.id === session.questions[session.currentQuestionIndex].id)}
            progress={(session.currentQuestionIndex / session.questions.length) * 100} 
            currentIndex={session.currentQuestionIndex} 
            totalQuestions={session.questions.length} 
            autoReinforce={session.autoReinforce} 
            onDissect={dissectQuestion} 
            masteryCards={masteryCards[session.questions[session.currentQuestionIndex].id]} 
            onUpdateDeepDive={(insight) => updateDeepDive(session.questions[session.currentQuestionIndex].id, insight)}
            onQuit={handleQuitQuiz}
            activeTimeMsRef={activeTimeMsRef}
            lastActiveTimeRef={lastActiveTimeRef}
          />
        )}

        {view === 'results' && completedSession && (
          <ResultsView session={completedSession} onRestart={() => setView('setup')} onViewAnalytics={() => setView('analytics')} onViewBookmarks={() => setView('bookmarks')} onExportGuide={handleExportGuide} onExportSummary={handleExportSummary} isExporting={isExporting} />
        )}

        {view === 'analytics' && <AnalyticsView history={history} onClose={() => setView('setup')} questionLibrary={questionLibrary} lifetimeStats={lifetimeStats} onStartQuizFromTopic={startQuizFromTopic} onResetData={handleResetData} generatingTopic={generatingTopic} />}
        {view === 'srs' && <SRSReview questions={dueSRSItems} onRate={updateSRS} onClose={() => setView('setup')} />}
        {view === 'bookmarks' && <BookmarksView bookmarks={bookmarks} onClose={() => setView('setup')} onRemove={toggleBookmark} masteryLayers={masteryCards} onDissect={dissectQuestion} />}
      </main>

      {showQuitConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-[2rem] shadow-2xl max-w-md w-full border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-300">
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-3">End Block Early?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">
              Your progress will be saved and analyzed based on the questions you've completed so far.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowQuitConfirm(false)}>Cancel</Button>
              <Button variant="primary" className="flex-1 bg-red-600 hover:bg-red-700 shadow-red-500/20" onClick={executeQuit}>Quit Block</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
