
import { HistoricalSession, Question, MasteryCard, SRSState, StudyPlan, LifetimeStats } from '../types';

const DB_NAME = 'AbduGoatDB';
const DB_VERSION = 2;

export interface AppData {
  history: HistoricalSession[];
  bookmarks: Question[];
  masteryCards: Record<string, MasteryCard[]>;
  srsStates: Record<string, SRSState>;
  questionLibrary: Record<string, Question>;
  studyPlan: StudyPlan | null;
  lifetimeStats: LifetimeStats;
}

class DatabaseService {
  private db: IDBDatabase | null = null;
  public isImporting: boolean = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => {
        this.initPromise = null; // Reset on error so we can try again
        reject(request.error);
      };
    });

    return this.initPromise;
  }

  async set(key: string, value: any): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['kv'], 'readwrite');
      const store = transaction.objectStore('kv');
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['kv'], 'readonly');
      const store = transaction.objectStore('kv');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Core Persistence Functions ---

  async saveSession(session: HistoricalSession): Promise<LifetimeStats> {
    const history = await this.loadHistory();
    const updatedHistory = [session, ...history];
    await this.set('history', updatedHistory);
    return await this.updateAnalytics(updatedHistory);
  }

  async loadHistory(): Promise<HistoricalSession[]> {
    return await this.get<HistoricalSession[]>('history') || [];
  }

  async updateAnalytics(historyOverride?: HistoricalSession[]): Promise<LifetimeStats> {
    const history = historyOverride || await this.loadHistory();
    
    if (history.length === 0) {
      const empty: LifetimeStats = { totalQuestions: 0, totalCorrect: 0, totalHours: 0, avgAccuracy: 0, firstSessionDate: Date.now() };
      await this.set('lifetimeStats', empty);
      return empty;
    }

    const totalQuestions = history.reduce((acc, s) => acc + s.totalQuestions, 0);
    const totalCorrect = history.reduce((acc, s) => acc + s.correctAnswers, 0);
    const totalTimeMs = history.reduce((acc, s) => acc + s.timeTakenMs, 0);
    
    // Sort chronologically to find first session date
    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const firstSessionDate = sortedHistory[0].timestamp;

    const stats: LifetimeStats = {
      totalQuestions,
      totalCorrect,
      totalHours: Number((totalTimeMs / 3600000).toFixed(1)),
      avgAccuracy: Math.round((totalCorrect / totalQuestions) * 100),
      firstSessionDate
    };

    await this.set('lifetimeStats', stats);
    return stats;
  }

  async backupAllData(): Promise<string> {
    const data = await this.getAllData();
    return JSON.stringify(data);
  }

  async fullImport(jsonData: string): Promise<boolean> {
    try {
      this.isImporting = true;
      console.log("Starting full import...");
      const parsed = JSON.parse(jsonData);
      if (!parsed || typeof parsed !== 'object') throw new Error("Invalid backup format");

      const data: Partial<AppData> = parsed;
      
      // Clear existing data first
      await this.resetData();

      if (!this.db) await this.init();
      
      const keys: (keyof AppData)[] = [
        'history', 
        'bookmarks', 
        'masteryCards', 
        'srsStates', 
        'questionLibrary', 
        'studyPlan', 
        'lifetimeStats'
      ];

      // Use a single transaction for all puts
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction(['kv'], 'readwrite');
        const store = transaction.objectStore('kv');
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);

        keys.forEach(key => {
          let value = data[key];
          
          if (value === undefined || value === null) {
            if (key === 'history' || key === 'bookmarks') value = [];
            else if (key === 'masteryCards' || key === 'srsStates' || key === 'questionLibrary') value = {};
            else if (key === 'studyPlan') value = null;
            else if (key === 'lifetimeStats') return; // Skip
          }
          
          store.put(value, key);
        });
      });

      // Recalculate analytics after import
      await this.updateAnalytics(data['history'] || []);
      console.log("Import and analytics update complete");
      return true;
    } catch (e) {
      console.error("Import failed details:", e);
      alert(`Import Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      return false;
    } finally {
      this.isImporting = false;
    }
  }

  async resetData(): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['kv'], 'readwrite');
      const store = transaction.objectStore('kv');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllData(): Promise<AppData> {
    const history = await this.get<HistoricalSession[]>('history') || [];
    const bookmarks = await this.get<Question[]>('bookmarks') || [];
    const masteryCards = await this.get<Record<string, MasteryCard[]>>('masteryCards') || {};
    const srsStates = await this.get<Record<string, SRSState>>('srsStates') || {};
    const questionLibrary = await this.get<Record<string, Question>>('questionLibrary') || {};
    const studyPlan = await this.get<StudyPlan>('studyPlan') || null;
    let lifetimeStats = await this.get<LifetimeStats>('lifetimeStats');

    // Auto-migration: Calculate lifetime stats if missing but history exists
    if (!lifetimeStats) {
      if (history.length > 0) {
         lifetimeStats = await this.updateAnalytics(history);
      } else {
         lifetimeStats = { totalQuestions: 0, totalCorrect: 0, totalHours: 0, avgAccuracy: 0, firstSessionDate: Date.now() };
         await this.set('lifetimeStats', lifetimeStats);
      }
    }

    return { history, bookmarks, masteryCards, srsStates, questionLibrary, studyPlan, lifetimeStats };
  }
}

export const dbService = new DatabaseService();
