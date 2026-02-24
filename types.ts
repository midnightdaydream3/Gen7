
export enum MedicalSpecialty {
  INTERNAL_MEDICINE = "Internal Medicine",
  SURGERY = "Surgery",
  PEDIATRICS = "Pediatrics",
  OB_GYN = "OB/GYN",
  PSYCHIATRY = "Psychiatry",
  EMERGENCY_MEDICINE = "Emergency Medicine",
  FAMILY_MEDICINE = "Family Medicine",
  ETHICS = "Ethics & Biostatistics",
  ORTHOPEDICS = "Orthopedics",
  OPHTHALMOLOGY = "Ophthalmology",
  ENT = "ENT",
  DERMATOLOGY = "Dermatology"
}

export enum ExamType {
  STEP_2_CK = "Step 2 CK",
  STEP_3 = "Step 3",
  SHELF_BOARD = "Shelf/Board"
}

export enum ClinicalComplexity {
  EASY = "Foundational",
  MEDIUM = "Moderate Complexity",
  HARD = "High-Yield Complex"
}

export interface Question {
  id: string;
  vignette: string;
  options: string[];
  correctIndex: number;
  explanation: {
    correct: string;
    incorrect: string;
    keyLearningPoint: string;
  };
  tags?: string[];
  clinicalConcepts?: string[];
  cognitiveLevel?: 'Recall' | 'Application' | 'Integration';
  deepDive?: string;
}

export interface MasteryCard {
  id: string;
  parentId: string;
  type: 'Pathophysiology' | 'Diagnosis' | 'Management' | 'Differentiator';
  front: string;
  back: string;
}

export interface QuizSession {
  questions: Question[];
  currentQuestionIndex: number;
  userAnswers: number[];
  startTime: number;
  specialties: MedicalSpecialty[];
  examTypes: ExamType[];
  complexity: ClinicalComplexity;
  topics?: string;
  skippedIds?: string[];
  autoReinforce: boolean;
}

export interface HistoricalSession {
  id: string;
  timestamp: number;
  totalQuestions: number;
  correctAnswers: number;
  timeTakenMs: number;
  specialties: MedicalSpecialty[];
  examTypes: ExamType[];
  complexity?: ClinicalComplexity;
  details?: {
    questionId: string;
    isCorrect: boolean;
  }[];
}

export interface SRSState {
  cardId: string;
  nextReview: number;
  interval: number;
  ease: number;
  repetitions: number;
}

export type SRSRating = 'again' | 'hard' | 'good' | 'easy';

export interface StudyWeek {
  topics: string[];
  hours: number;
  resources: string[];
  focusDescription: string;
}

export interface StudyPlan {
  [weekKey: string]: StudyWeek;
}

export interface LifetimeStats {
  totalQuestions: number;
  totalCorrect: number;
  totalHours: number;
  avgAccuracy: number;
  firstSessionDate: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface GamificationStats {
  streak: number;
  unlockedAchievements: string[];
}
