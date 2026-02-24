
import React from 'react';
import { Achievement, GamificationStats } from '../types';

export const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: 'centurion', name: 'Centurion', description: 'Complete 100 clinical vignettes', icon: '🏛️' },
  { id: 'deadeye', name: 'Deadeye', description: '80% accuracy on a 10+ block', icon: '🎯' },
  { id: 'immortal', name: 'Immortal', description: 'Maintain a 5-day study streak', icon: '🔥' },
  { id: 'professor', name: 'The Professor', description: 'Synthesize 50 Mastery Cards', icon: '🎓' },
  { id: 'night-owl', name: 'Night Owl', description: 'Complete a block after 10 PM', icon: '🦉' },
  { id: 'strategist', name: 'Strategist', description: 'Generate your first AI Study Plan', icon: '📜' }
];

export const Badge: React.FC<{ achievement: Achievement; isUnlocked: boolean }> = ({ achievement, isUnlocked }) => (
  <div className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-500 group ${
    isUnlocked 
      ? 'bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border-blue-200 dark:border-blue-900 shadow-lg shadow-blue-500/5' 
      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-40 grayscale'
  }`}>
    <div className={`text-4xl mb-2 transition-transform duration-500 ${isUnlocked ? 'group-hover:scale-125' : ''}`}>
      {achievement.icon}
    </div>
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-slate-100 text-center">{achievement.name}</span>
    <p className="text-[8px] text-slate-500 font-bold text-center mt-1 leading-tight">{achievement.description}</p>
    {isUnlocked && (
      <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-white dark:border-slate-900 shadow-sm">
        <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
      </div>
    )}
  </div>
);

export const StreakIndicator: React.FC<{ streak: number }> = ({ streak }) => (
  <div className="flex items-center gap-1 bg-orange-100 dark:bg-orange-900/20 px-2.5 py-1 rounded-full border border-orange-200 dark:border-orange-900/40">
    <span className="text-sm">🔥</span>
    <span className="text-xs font-black text-orange-600 dark:text-orange-400">{streak}</span>
  </div>
);
