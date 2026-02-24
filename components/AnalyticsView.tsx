
import React, { useMemo, useState, useRef } from 'react';
import { HistoricalSession, Question, LifetimeStats, ClinicalComplexity } from '../types';
import { Button } from './Button';
import { PredictiveScore } from './PredictiveScore';
import { dbService } from '../services/databaseService';
import { 
  LineChart, Line, Tooltip, ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, Cell
} from 'recharts';

const dissectClinicalTopic = (tags: string[]): string | null => {
  if (!tags || tags.length === 0) return null;
  
  const ignoreList = ['step 1', 'step 2', 'step 3', 'board', 'style', 'nbme', 'free 120', 'high yield', 'review', 'test', 'usmle', 'plab', 'comlex'];
  const broadSystems = ['surgery', 'medicine', 'pediatrics', 'obgyn', 'psychiatry', 'cardiology', 'gi', 'renal', 'respiratory', 'neurology', 'gastroenterology', 'pulmonology', 'endocrinology', 'hematology', 'oncology', 'infectious disease', 'rheumatology', 'dermatology', 'ophthalmology', 'ent', 'orthopedics', 'urology', 'gynecology', 'obstetrics', 'family medicine', 'emergency medicine', 'internal medicine'];
  
  let fallbackBroadSystem: string | null = null;
  
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    
    if (ignoreList.some(ignore => lowerTag.includes(ignore))) {
      continue;
    }
    
    if (broadSystems.some(broad => lowerTag.includes(broad))) {
      if (!fallbackBroadSystem) fallbackBroadSystem = tag;
      continue;
    }
    
    return tag;
  }
  
  return fallbackBroadSystem;
};

interface AnalyticsViewProps {
  history: HistoricalSession[];
  onClose: () => void;
  questionLibrary?: Record<string, Question>;
  lifetimeStats?: LifetimeStats;
  onStartQuizFromTopic?: (topic: string, count?: number, autoReinforce?: boolean) => void;
  onResetData?: () => void;
  generatingTopic?: string | null;
}

const QuizConfigModal: React.FC<{
  topic: string;
  onClose: () => void;
  onConfirm: (count: number, autoReinforce: boolean) => void;
}> = ({ topic, onClose, onConfirm }) => {
  const [count, setCount] = useState(10);
  const [autoReinforce, setAutoReinforce] = useState(true);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md p-8 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6 animate-in zoom-in-95 duration-200">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">Topic Reinforcement</h3>
          <p className="text-slate-500 text-sm mt-1">Generating custom block for <span className="text-blue-600 font-bold">{topic}</span></p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Question Count</label>
            <div className="flex items-center gap-4">
              <input 
                type="range" min="1" max="50" value={count} 
                onChange={(e) => setCount(parseInt(e.target.value))}
                className="flex-1 accent-blue-600"
              />
              <span className="text-xl font-black text-slate-800 dark:text-slate-100 w-8">{count}</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Adaptive Reinforcement</p>
              <p className="text-[10px] text-slate-500">Auto-generate remediation for missed concepts.</p>
            </div>
            <button 
              onClick={() => setAutoReinforce(!autoReinforce)}
              className={`w-12 h-6 rounded-full transition-all relative ${autoReinforce ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${autoReinforce ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => onConfirm(count, autoReinforce)} className="flex-1">Generate Block</Button>
        </div>
      </div>
    </div>
  );
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ 
  history, 
  onClose, 
  questionLibrary = {}, 
  lifetimeStats, 
  onStartQuizFromTopic, 
  onResetData,
  generatingTopic 
}) => {
  const [sortMethod, setSortMethod] = useState<'weakness' | 'strength' | 'alpha' | 'urgency'>('weakness');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDataModal, setShowDataModal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<{ date: string, count: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [activeTopicConfig, setActiveTopicConfig] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use persisted lifetime stats if available, otherwise fallback to calculation
  const lifetime = useMemo<LifetimeStats | null>(() => {
    if (lifetimeStats) return lifetimeStats;
    if (history.length === 0) return null;
    
    const totalQuestions = history.reduce((acc, s) => acc + s.totalQuestions, 0);
    const totalCorrect = history.reduce((acc, s) => acc + s.correctAnswers, 0);
    const totalTimeMs = history.reduce((acc, s) => acc + s.timeTakenMs, 0);
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    
    return {
      totalQuestions,
      totalCorrect,
      totalHours: Number((totalTimeMs / 3600000).toFixed(1)),
      avgAccuracy: Math.round((totalCorrect / totalQuestions) * 100),
      firstSessionDate: sorted[0].timestamp
    };
  }, [history, lifetimeStats]);

  const stats = useMemo(() => {
    if (history.length === 0 || !lifetime) return null;

    // Specialty Breakdown for Radar Chart
    const specialtyMap: Record<string, { correct: number, total: number }> = {};
    history.forEach(session => {
      session.specialties.forEach(spec => {
        const shortName = spec.split(' ')[0].substring(0, 10);
        if (!specialtyMap[shortName]) specialtyMap[shortName] = { correct: 0, total: 0 };
        specialtyMap[shortName].total += session.totalQuestions;
        specialtyMap[shortName].correct += session.correctAnswers;
      });
    });

    const radarData = Object.entries(specialtyMap).map(([name, data]) => ({
      subject: name,
      A: Math.round((data.correct / data.total) * 100),
      fullMark: 100
    })).slice(0, 6);

    // Exam Type Breakdown
    const examMap: Record<string, { correct: number, total: number }> = {};
    history.forEach(session => {
       session.examTypes.forEach(et => {
         if (!examMap[et]) examMap[et] = { correct: 0, total: 0 };
         examMap[et].total += session.totalQuestions;
         examMap[et].correct += session.correctAnswers;
       });
    });

    // Complexity Breakdown
    const complexityMap: Record<string, { correct: number, total: number }> = {};
    history.forEach(session => {
       if (session.complexity) {
          const comp = session.complexity;
          if (!complexityMap[comp]) complexityMap[comp] = { correct: 0, total: 0 };
          complexityMap[comp].total += session.totalQuestions;
          complexityMap[comp].correct += session.correctAnswers;
       }
    });
    
    const complexityData = Object.entries(complexityMap).map(([name, data]) => ({
       name,
       accuracy: Math.round((data.correct / data.total) * 100),
       total: data.total
    }));

    // Cognitive Complexity Breakdown
    const cognitiveMap: Record<string, { correct: number, total: number }> = {
      'Recall': { correct: 0, total: 0 },
      'Application': { correct: 0, total: 0 },
      'Integration': { correct: 0, total: 0 }
    };

    history.forEach(session => {
      if (session.details) {
        session.details.forEach(detail => {
          const q = questionLibrary[detail.questionId];
          if (q && q.cognitiveLevel) {
            cognitiveMap[q.cognitiveLevel].total += 1;
            if (detail.isCorrect) cognitiveMap[q.cognitiveLevel].correct += 1;
          }
        });
      }
    });

    const cognitiveData = Object.entries(cognitiveMap)
      .filter(([_, data]) => data.total > 0)
      .map(([name, data]) => ({
        name,
        accuracy: Math.round((data.correct / data.total) * 100),
        total: data.total
      }));

    // Tag Analysis
    const tagStats: Record<string, { correct: number, total: number, history: boolean[] }> = {};
    const conceptStats: Record<string, { correct: number, total: number }> = {};

    history.forEach(session => {
      if (session.details) {
        session.details.forEach(detail => {
          const q = questionLibrary[detail.questionId];
          if (q) {
            const cleanTopic = dissectClinicalTopic(q.tags || []);
            const concepts = q.clinicalConcepts || [];
            const keysToTrack = new Set<string>();

            if (cleanTopic) {
              if (concepts.length > 0) {
                concepts.forEach(concept => keysToTrack.add(`${cleanTopic}: ${concept}`));
              } else {
                keysToTrack.add(cleanTopic);
              }
            } else if (concepts.length > 0) {
               concepts.forEach(concept => keysToTrack.add(concept));
            }

            keysToTrack.forEach(key => {
              if (!tagStats[key]) tagStats[key] = { correct: 0, total: 0, history: [] };
              tagStats[key].total += 1;
              if (detail.isCorrect) tagStats[key].correct += 1;
              tagStats[key].history.push(detail.isCorrect);
            });

            if (q.clinicalConcepts) {
              q.clinicalConcepts.forEach(concept => {
                if (!conceptStats[concept]) conceptStats[concept] = { correct: 0, total: 0 };
                conceptStats[concept].total += 1;
                if (detail.isCorrect) conceptStats[concept].correct += 1;
              });
            }
          }
        });
      }
    });

    let subtopicData = Object.entries(tagStats).map(([name, data]) => {
      const accuracy = Math.round((data.correct / data.total) * 100);
      const recent5 = data.history.slice(0, 5);
      const recentCorrect = recent5.filter(Boolean).length;
      const recentAccuracy = recent5.length > 0 ? Math.round((recentCorrect / recent5.length) * 100) : accuracy;
      const urgency = data.total * (1 - (accuracy / 100));
      return {
        name,
        accuracy,
        correct: data.correct,
        total: data.total,
        recentAccuracy,
        urgency
      };
    });

    const conceptData = Object.entries(conceptStats).map(([name, data]) => ({
      name,
      accuracy: Math.round((data.correct / data.total) * 100),
      total: data.total
    })).sort((a, b) => b.total - a.total);

    if (sortMethod === 'weakness') {
      subtopicData.sort((a, b) => {
        const aValid = a.total >= 3;
        const bValid = b.total >= 3;
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        return a.accuracy - b.accuracy || b.total - a.total;
      });
    } else if (sortMethod === 'strength') {
      subtopicData.sort((a, b) => {
        const aValid = a.total >= 3;
        const bValid = b.total >= 3;
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        return b.accuracy - a.accuracy || b.total - a.total;
      });
    } else if (sortMethod === 'urgency') {
      subtopicData.sort((a, b) => b.urgency - a.urgency || a.accuracy - b.accuracy);
    } else {
      subtopicData.sort((a, b) => a.name.localeCompare(b.name));
    }

    const timelineData = [...history].reverse().map((s, idx) => ({
      name: `S${idx + 1}`,
      accuracy: Math.round((s.correctAnswers / s.totalQuestions) * 100),
      timePerQ: Math.round((s.timeTakenMs / 1000) / s.totalQuestions),
      date: new Date(s.timestamp).toLocaleDateString()
    }));
    
    // Activity Heatmap Data
    const activityMap: Record<string, number> = {};
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    // Populate map with 0s for all days
    for (let d = new Date(threeMonthsAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
        activityMap[d.toISOString().split('T')[0]] = 0;
    }
    
    // Fill with data
    history.forEach(s => {
        const day = new Date(s.timestamp).toISOString().split('T')[0];
        if (activityMap[day] !== undefined) {
            activityMap[day] += s.totalQuestions;
        }
    });
    
    const heatmapData = Object.entries(activityMap).map(([date, count]) => ({ date, count }));
    const maxDailyCount = Math.max(...heatmapData.map(d => d.count), 1);

    // Time Analysis
    const totalSeconds = lifetime.totalHours * 3600;
    const avgTimePerQuestionSec = Math.round(totalSeconds / lifetime.totalQuestions);

    // Consistency Score (Sessions per week)
    const firstDate = new Date(lifetime.firstSessionDate);
    const now = new Date();
    const weeksDiff = Math.max(1, Math.ceil((now.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const sessionsPerWeek = Number((history.length / weeksDiff).toFixed(1));

    return {
      sessionsCount: history.length,
      radarData,
      timelineData,
      subtopicData,
      conceptData,
      examMap,
      complexityData,
      cognitiveData,
      heatmapData,
      maxDailyCount,
      avgTimePerQuestionSec,
      sessionsPerWeek
    };
  }, [history, questionLibrary, sortMethod, lifetime]);

  const handleExport = async () => {
    try {
      const json = await dbService.backupAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `abdu_goat_backup_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert("Export failed");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingImportFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const executeImport = async () => {
    if (!pendingImportFile) return;
    
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result;
      if (typeof text !== 'string') {
        alert("Failed to read file");
        setIsImporting(false);
        setPendingImportFile(null);
        return;
      }
      
      try {
        const success = await dbService.fullImport(text);
        if (success) {
          alert("Import successful! Reloading...");
          localStorage.setItem('abdu_show_restore_msg', 'true');
          window.location.reload();
        } else {
          setIsImporting(false);
          setPendingImportFile(null);
        }
      } catch (err) {
        console.error(err);
        alert("Import failed");
        setIsImporting(false);
        setPendingImportFile(null);
      }
    };
    reader.onerror = () => {
      alert("Error reading file");
      setIsImporting(false);
      setPendingImportFile(null);
    };
    reader.readAsText(pendingImportFile);
  };

  // Render logic
  const renderContent = () => {
    if (!stats || !lifetime) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <div className="bg-slate-100 dark:bg-slate-800 p-8 rounded-[2rem] max-w-md">
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">No Data Yet</h2>
            <p className="text-slate-500 mb-6">Complete a session to generate insights.</p>
            <Button onClick={onClose}>Start Quiz</Button>
          </div>
        </div>
      );
    }

    const getBarColor = (accuracy: number) => {
      if (accuracy >= 70) return "bg-green-500";
      if (accuracy >= 50) return "bg-amber-400";
      return "bg-red-500";
    };
    
    const getHeatmapColor = (count: number) => {
        if (count === 0) return "bg-slate-100 dark:bg-slate-800";
        const intensity = Math.min(Math.ceil((count / stats.maxDailyCount) * 4), 4);
        switch(intensity) {
          case 1: return "bg-green-100 dark:bg-green-900/20";
          case 2: return "bg-green-300 dark:bg-green-700/50";
          case 3: return "bg-green-500 dark:bg-green-600";
          case 4: return "bg-green-700 dark:bg-green-500";
          default: return "bg-slate-100 dark:bg-slate-800";
        }
    };

    return (
      <>
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: #e2e8f0;
            border-radius: 20px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background-color: #cbd5e1;
          }
          .dark .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: #334155;
          }
          .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background-color: #475569;
          }
        `}</style>
        <PredictiveScore history={history} subtopicData={stats.subtopicData} />

        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
             <div className="absolute right-0 top-0 p-4 opacity-10">
               <svg className="w-16 h-16 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.55-2.91l6.01-10.01-1.42-1.42-5.14 8.56-2.93-2.93-1.42 1.42 4.9 4.38z"/></svg>
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Lifetime Acc.</p>
             <p className={`text-4xl font-black ${lifetime.avgAccuracy >= 70 ? 'text-green-500' : 'text-amber-500'}`}>{lifetime.avgAccuracy}%</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
             <div className="absolute right-0 top-0 p-4 opacity-10">
               <svg className="w-16 h-16 text-indigo-600" fill="currentColor" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Time / Question</p>
             <p className="text-4xl font-black text-slate-800 dark:text-slate-100">{stats.avgTimePerQuestionSec}<span className="text-lg text-slate-400 ml-1">s</span></p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
             <div className="absolute right-0 top-0 p-4 opacity-10">
               <svg className="w-16 h-16 text-purple-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vignettes</p>
             <p className="text-4xl font-black text-slate-800 dark:text-slate-100">{lifetime.totalQuestions}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
             <div className="absolute right-0 top-0 p-4 opacity-10">
                <svg className="w-16 h-16 text-cyan-600" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Blocks</p>
             <p className="text-4xl font-black text-slate-800 dark:text-slate-100">{stats.sessionsCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
             <div className="absolute right-0 top-0 p-4 opacity-10">
                 <svg className="w-16 h-16 text-emerald-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Consistency</p>
             <p className="text-4xl font-black text-slate-800 dark:text-slate-100">{stats.sessionsPerWeek}<span className="text-lg text-slate-400 ml-1">/wk</span></p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Radar Chart for Specialties */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
             <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-2 w-full text-left">Specialty Shape</h3>
             <p className="text-xs text-slate-500 w-full text-left mb-4">Relative performance across major disciplines.</p>
             <div className="w-full h-[300px]">
               <ResponsiveContainer width="100%" height="100%">
                 <RadarChart cx="50%" cy="50%" outerRadius="80%" data={stats.radarData}>
                   <PolarGrid stroke="#94a3b8" strokeOpacity={0.2} />
                   <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                   <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                   <Radar name="Accuracy" dataKey="A" stroke="#3b82f6" strokeWidth={3} fill="#3b82f6" fillOpacity={0.3} />
                   <Tooltip />
                 </RadarChart>
               </ResponsiveContainer>
             </div>
          </div>

          {/* Detailed List + Trend */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-[400px]">
             <div className="flex items-center justify-between mb-4">
               <div>
                 <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Trendline</h3>
                 <p className="text-xs text-slate-500">Longitudinal performance progression.</p>
               </div>
             </div>
             <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.timelineData}>
                    <Line type="monotone" dataKey="accuracy" stroke="#8b5cf6" strokeWidth={3} dot={{ fill: '#8b5cf6', r: 4 }} activeDot={{ r: 6 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: 'white' }} 
                      itemStyle={{ color: '#e2e8f0' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
             </div>
          </div>
        </div>
        
        {/* Activity Heatmap */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm relative">
           <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Study Volume (Last 3 Months)</h3>
              {hoveredDay && (
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 animate-in fade-in slide-in-from-right-2">
                  {new Date(hoveredDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {hoveredDay.count} Questions
                </div>
              )}
           </div>
           <div className="flex flex-wrap gap-1">
              {stats.heatmapData.map((d, i) => (
                 <div 
                   key={i} 
                   className={`w-3 h-3 rounded-sm transition-all cursor-pointer hover:ring-2 hover:ring-blue-400 ${getHeatmapColor(d.count)}`} 
                   onMouseEnter={() => setHoveredDay(d)}
                   onMouseLeave={() => setHoveredDay(null)}
                   onTouchStart={() => setHoveredDay(d)}
                 />
              ))}
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Knowledge Gap Analysis */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-[500px]">
             <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
               <div>
                 <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Micro-Analysis</h3>
                 <p className="text-xs text-slate-500">Performance by granular subtopic tags.</p>
               </div>
               <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <button onClick={() => setSortMethod('urgency')} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-colors ${sortMethod === 'urgency' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>Urgent</button>
                  <button onClick={() => setSortMethod('weakness')} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-colors ${sortMethod === 'weakness' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>Weakest</button>
                  <button onClick={() => setSortMethod('strength')} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-colors ${sortMethod === 'strength' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>Strongest</button>
               </div>
             </div>
             <div className="mb-4">
               <input 
                 type="search" 
                 placeholder="Search topics..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
               />
             </div>
             <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
               {stats.subtopicData
                 .filter(topic => topic.name.toLowerCase().includes(searchQuery.toLowerCase()))
                 .slice(0, searchQuery ? undefined : 20)
                 .map((topic, idx) => {
                   const isLowSample = topic.total < 3;
                   const showImprovement = topic.recentAccuracy > topic.accuracy + 10;
                   const showDecline = topic.recentAccuracy < topic.accuracy - 10;
                   return (
                     <div key={idx} className={`flex items-center justify-between gap-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors px-1 group ${isLowSample ? 'opacity-50' : ''}`}>
                        <div className="flex-1 min-w-0 pr-2">
                           <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate" title={topic.name}>{topic.name}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 w-32 sm:w-40">
                           <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${getBarColor(topic.accuracy)}`} style={{ width: `${topic.accuracy}%` }} />
                           </div>
                           <span className={`text-[10px] font-black w-6 text-right ${topic.accuracy >= 70 ? 'text-green-600' : topic.accuracy >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{topic.accuracy}%</span>
                           <div className="w-3 flex justify-center">
                             {showImprovement && <span className="text-green-500 text-[10px] font-black" title="Recent momentum up">↑</span>}
                             {showDecline && <span className="text-red-500 text-[10px] font-black" title="Recent momentum down">↓</span>}
                           </div>
                        </div>
                        <div className="hidden sm:block text-right text-[10px] font-bold text-slate-400 w-6 shrink-0">{topic.total}</div>
                        <div className="flex justify-end shrink-0">
                           <button 
                             onClick={() => setActiveTopicConfig(topic.name)}
                             disabled={!!generatingTopic}
                             className={`p-1.5 rounded-lg transition-all ${
                               generatingTopic === topic.name 
                                ? 'bg-amber-500 text-white animate-spin shadow-lg shadow-amber-500/50' 
                                : generatingTopic
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 opacity-50 cursor-not-allowed'
                                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white'
                             }`}
                             title={generatingTopic === topic.name ? "Generating..." : "Generate quiz from this topic"}
                           >
                             <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                             </svg>
                           </button>
                        </div>
                     </div>
                   );
               })}
             </div>
          </div>

          {/* Clinical Concept Distribution */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-[500px]">
             <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-4">Clinical Concepts</h3>
             <div className="space-y-3 overflow-y-auto custom-scrollbar pr-2">
               {stats.conceptData.length > 0 ? stats.conceptData.slice(0, 20).map((concept) => (
                 <div key={concept.name} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-[10px] font-black uppercase text-slate-500">{concept.name}</span>
                     <span className={`text-xs font-black ${concept.accuracy >= 70 ? 'text-green-500' : 'text-amber-500'}`}>{concept.accuracy}%</span>
                   </div>
                   <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${getBarColor(concept.accuracy)}`} style={{ width: `${concept.accuracy}%` }} />
                   </div>
                 </div>
               )) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-xs italic text-center px-6">
                    No clinical concept data.
                  </div>
               )}
             </div>
          </div>
        </div>

        {/* Time Trend Chart */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm">
           <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Speed Trend</h3>
                <p className="text-xs text-slate-500">Average seconds per question across blocks.</p>
              </div>
              <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Global Avg: {stats.avgTimePerQuestionSec}s</span>
              </div>
           </div>
           <div className="w-full h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(59, 130, 246, 0.05)', radius: 8 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl border border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{payload[0].payload.name}</p>
                            <p className="text-lg font-black">{payload[0].value} <span className="text-xs opacity-60">sec/Q</span></p>
                            <p className="text-[9px] text-blue-400 font-bold mt-1">{payload[0].payload.date}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar 
                    dataKey="timePerQ" 
                    radius={[8, 8, 8, 8]}
                    barSize={32}
                  >
                    {stats.timelineData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.timePerQ > stats.avgTimePerQuestionSec ? '#f43f5e' : '#3b82f6'} 
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* Cognitive Level Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm">
           <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-6">Cognitive Depth</h3>
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {stats.cognitiveData.map((cog) => (
                <div key={cog.name} className="flex flex-col items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                   <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
                      <span className="text-lg font-black">{cog.name[0]}</span>
                   </div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{cog.name}</p>
                   <p className={`text-2xl font-black ${cog.accuracy >= 70 ? 'text-green-500' : 'text-amber-500'}`}>{cog.accuracy}%</p>
                   <p className="text-[9px] text-slate-500 mt-1 font-bold">{cog.total} Questions</p>
                </div>
              ))}
           </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm">
           <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Session History</h3>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                {showHistory ? 'Hide Details' : 'Show All Sessions'}
              </button>
           </div>
           
           {showHistory && (
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                   <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                         <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Date</th>
                         <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Score</th>
                         <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Volume</th>
                         <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Time</th>
                         <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Specialties</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                      {history.map((session) => (
                         <tr key={session.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-4 text-xs font-bold text-slate-600 dark:text-slate-300">
                               {new Date(session.timestamp).toLocaleDateString()}
                            </td>
                            <td className="py-4">
                               <span className={`text-xs font-black ${Math.round((session.correctAnswers/session.totalQuestions)*100) >= 70 ? 'text-green-500' : 'text-amber-500'}`}>
                                  {session.correctAnswers}/{session.totalQuestions} ({Math.round((session.correctAnswers/session.totalQuestions)*100)}%)
                               </span>
                            </td>
                            <td className="py-4 text-xs font-bold text-slate-500">{session.totalQuestions} Qs</td>
                            <td className="py-4 text-xs font-bold text-slate-500">{Math.round(session.timeTakenMs / 60000)}m</td>
                            <td className="py-4">
                               <div className="flex flex-wrap gap-1">
                                  {session.specialties.slice(0, 2).map(s => (
                                     <span key={s} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[9px] font-bold rounded-md text-slate-500">{s}</span>
                                  ))}
                                  {session.specialties.length > 2 && <span className="text-[9px] font-bold text-slate-400">+{session.specialties.length - 2}</span>}
                               </div>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
           )}
        </div>
      </>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      
      {/* Topic Config Modal */}
      {activeTopicConfig && (
        <QuizConfigModal 
          topic={activeTopicConfig} 
          onClose={() => setActiveTopicConfig(null)}
          onConfirm={(count, autoReinforce) => {
            const topicToGenerate = activeTopicConfig;
            onStartQuizFromTopic?.(topicToGenerate, count, autoReinforce);
            setActiveTopicConfig(null);
          }}
        />
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 gap-4">
        <div className="text-center sm:text-left">
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">Analytics Board</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lifetime Clinical Performance</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-center">
           <Button variant="secondary" onClick={() => setShowDataModal(true)}>Data Management</Button>
           <Button variant="outline" onClick={onClose} className="border-slate-200 dark:border-slate-700">Close</Button>
        </div>
      </div>

      {renderContent()}

      {/* Import/Export Modal */}
      {showDataModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
           <div className="bg-white dark:bg-slate-900 w-full max-w-lg p-8 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-700 space-y-6 animate-in zoom-in-95 duration-200">
              <div className="text-center">
                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                   <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                 </div>
                 <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">Data Vault</h3>
                 <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                   Sync your progress across devices using secure file backup. Save the file to Google Drive to access it anywhere.
                 </p>
              </div>

              <div className="grid gap-4">
                 <button onClick={handleExport} className="flex items-center gap-4 p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border-2 border-transparent hover:border-blue-500 transition-all text-left group">
                    <div className="p-3 bg-blue-500 text-white rounded-xl shadow-md">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-800 dark:text-slate-100">Export Backup</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Download your entire history as a JSON file.</p>
                    </div>
                 </button>

                 <div className="relative group">
                    <input 
                      type="file" 
                      accept=".json"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    {!pendingImportFile ? (
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-transparent hover:border-slate-400 transition-all text-left w-full"
                      >
                          <div className="p-3 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl shadow-md">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                          </div>
                          <div>
                            <p className="text-base font-bold text-slate-800 dark:text-slate-100">Import Backup</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Restore from a previously saved JSON file.</p>
                          </div>
                      </button>
                    ) : (
                      <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800/50 p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-lg shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Overwrite Data?</p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                              Importing <span className="font-bold">{pendingImportFile.name}</span> will replace all your current progress.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={executeImport}
                            disabled={isImporting}
                            className="flex-1 flex justify-center items-center py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold uppercase rounded-lg shadow-sm transition-all disabled:opacity-50"
                          >
                            {isImporting ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              "Yes, Overwrite Data"
                            )}
                          </button>
                          <button 
                            onClick={() => setPendingImportFile(null)}
                            disabled={isImporting}
                            className="flex-1 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase rounded-lg transition-all disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                 </div>

                 {onResetData && (
                   <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border-2 border-transparent hover:border-red-500 transition-all group overflow-hidden">
                     {!confirmReset ? (
                       <button onClick={() => setConfirmReset(true)} className="flex items-center gap-4 p-4 w-full text-left">
                          <div className="p-3 bg-red-500 text-white rounded-xl shadow-md">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </div>
                          <div>
                            <p className="text-base font-bold text-red-700 dark:text-red-400">Reset All Data</p>
                            <p className="text-xs text-red-500/80 dark:text-red-400/70">Permanently clear history and bookmarks.</p>
                          </div>
                       </button>
                     ) : (
                       <div className="p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-right-4 duration-200">
                         <p className="text-sm font-bold text-red-600 dark:text-red-400 text-center">Are you absolutely sure?</p>
                         <div className="flex gap-2">
                           <button 
                             onClick={onResetData}
                             className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase rounded-lg shadow-lg shadow-red-500/30 transition-all"
                           >
                             Yes, Delete Everything
                           </button>
                           <button 
                             onClick={() => setConfirmReset(false)}
                             className="flex-1 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase rounded-lg transition-all"
                           >
                             Cancel
                           </button>
                         </div>
                       </div>
                     )}
                   </div>
                 )}
              </div>

              <button 
                onClick={() => setShowDataModal(false)}
                className="w-full py-3 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
           </div>
        </div>
      )}
    </div>
  );
};
