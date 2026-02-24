
import { GoogleGenAI, Type } from "@google/genai";
import { MedicalSpecialty, ExamType, ClinicalComplexity, Question, MasteryCard, StudyPlan } from "../types";

// Helper for exponential backoff to handle 429s and RPC errors gracefully
const fetchWithRetry = async (fn: () => Promise<any>, maxRetries = 5, initialDelay = 3000) => {
  let retries = 0;
  while (retries <= maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      // Robust parsing for potentially nested error objects from GoogleGenAI SDK
      const rawMsg = error?.message || error?.error?.message || JSON.stringify(error);
      const status = error?.status || error?.code || error?.error?.code || error?.error?.status;
      
      const msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
      
      // 429: Rate Limit / Quota Exceeded
      const isRateLimit = msg.includes('429') || status === 429 || status === 'RESOURCE_EXHAUSTED' || msg.includes('quota');
      
      // 500/503/Unknown: Transient Server/Network errors (RPC, XHR)
      const isRpcError = msg.includes('Rpc failed') || msg.includes('xhr error') || msg.includes('code: 6') || msg.includes('500') || status === 500 || status === 503 || status === 'UNKNOWN' || msg.includes('Failed to fetch') || msg.includes('NetworkError');
      
      if ((isRateLimit || isRpcError) && retries < maxRetries) {
        const delay = initialDelay * Math.pow(2, retries) + (Math.random() * 1000);
        console.warn(`API Attempt ${retries + 1} failed (Status: ${status}). Retrying in ${Math.round(delay)}ms... Error: ${msg.substring(0, 100)}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
        continue;
      }
      
      if (error && typeof error === 'object' && !error.status && status) {
        error.status = status;
      }
      throw error;
    }
  }
};

const getAIInstance = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const QUESTION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      vignette: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING } },
      correctIndex: { type: Type.INTEGER },
      explanation: {
        type: Type.OBJECT,
        properties: {
          correct: { type: Type.STRING },
          incorrect: { type: Type.STRING },
          keyLearningPoint: { type: Type.STRING }
        },
        required: ["correct", "incorrect", "keyLearningPoint"]
      },
      tags: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: "Specific subtopics (e.g. 'Cardiology', 'Trauma', 'Antibiotics')"
      },
      clinicalConcepts: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Core clinical concepts (e.g. 'Pathophysiology', 'Pharmacology', 'Anatomy', 'Physical Exam', 'Diagnostic Testing')"
      },
      cognitiveLevel: {
        type: Type.STRING,
        enum: ["Recall", "Application", "Integration"],
        description: "Recall: simple fact retrieval. Application: single-step reasoning. Integration: multi-step clinical synthesis."
      }
    },
    required: ["id", "vignette", "options", "correctIndex", "explanation", "tags", "cognitiveLevel"]
  }
};

const cleanMedicalText = (text: string): string => {
  return text
    .replace(/\$\s*\\rightarrow\s*\$/g, "→")
    .replace(/\\rightarrow/g, "→")
    .replace(/\$\s*CO_2\s*\$/g, "CO₂")
    .replace(/CO_2/g, "CO₂")
    .replace(/\$\s*PaO_2\s*\$/g, "PaO₂")
    .replace(/PaO_2/g, "PaO₂")
    .replace(/\$\s*H_2O\s*\$/g, "H₂O")
    .replace(/H_2O/g, "H₂O")
    .replace(/\$\s*HCO_3\s*\$/g, "HCO₃")
    .replace(/HCO_3/g, "HCO₃")
    .replace(/\$\s*O_2\s*\$/g, "O₂")
    .replace(/O_2/g, "O₂")
    .replace(/\\ge/g, "≥")
    .replace(/\\le/g, "≤")
    .replace(/\\approx/g, "≈")
    .replace(/\$\s*(.*?)\s*\$/g, "$1") // Remove remaining $ symbols
    .replace(/####/g, "•")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<");
};

const GENERATION_PROTOCOL = `
### GLOBAL QUESTION GENERATION PROTOCOL (USMLE/SHELF LEVEL) ###

1. ANTI-REPETITION & RANDOMIZATION:
- DO NOT randomize the options yourself. ALWAYS place the correct answer at index 0 of the options array. Our system will handle the randomization and shuffling.
- ALWAYS set correctIndex to 0.

2. DISTRACTOR LOGIC:
- No "Throwaway" Answers: Every wrong choice must be clinically plausible, sharing at least 2 features with the correct answer but wrong for a specific key distinction.
- Avoid "Direct Associations": Do not use buzzwords. Describe findings instead of naming them (e.g., "Linear, peroxidase-positive cytoplasmic inclusions" instead of "Auer Rods").
- Use "Logic Distractors": Include choices that would be correct if the patient's age were different, if the question asked for mechanism vs treatment, or gold standard vs initial test.

3. SECOND & THIRD ORDER LOGIC:
- Avoid Direct Recall: Do not ask "What is the treatment for X?"
- Use Clinical Vignettes: Present a scenario where the user must first identify the diagnosis (Step 1) and then answer a question about a specific attribute (Step 2/3).

4. OUTPUT INSTRUCTION:
- Distractors must be indistinguishable from the correct answer in length and complexity.
`;

export const generateQuestions = async (
  specialties: MedicalSpecialty[],
  examTypes: ExamType[],
  complexity: ClinicalComplexity,
  count: number = 5,
  topics?: string
): Promise<Question[]> => {
  return fetchWithRetry(async () => {
    const ai = getAIInstance();
    const prompt = `Act as an expert Medical Board Exam constructor.
    USMLE ${examTypes.join("/")} ${complexity} level. Specialties: ${specialties.join(", ")}. ${topics ? "Topics: " + topics : ""}. 
    Generate ${count} vignettes with 5 options and detailed rationale. 
    
    ${GENERATION_PROTOCOL}

    IMPORTANT: For each question, provide:
    1. 'tags': 2-3 HIGHLY SPECIFIC subtopics (e.g., 'Aortic Dissection', 'Hyperkalemia Management'). DO NOT use broad specialty names.
    2. 'clinicalConcepts': 2-3 core concepts (e.g., 'Pathophysiology', 'Management').
    3. 'cognitiveLevel' (Recall, Application, or Integration).`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: QUESTION_SCHEMA,
      }
    });

    const questions = JSON.parse(response.text || "[]");
    
    return questions.map((q: any) => {
      let actualCorrectIndex = q.correctIndex;
      if (actualCorrectIndex === undefined || actualCorrectIndex < 0 || actualCorrectIndex >= q.options.length) {
        actualCorrectIndex = 0;
      }
      
      const originalCorrectOption = q.options[actualCorrectIndex];
      const shuffledOptions = [...q.options];
      for (let i = shuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
      }
      const newCorrectIndex = shuffledOptions.indexOf(originalCorrectOption);

      return {
        ...q,
        options: shuffledOptions,
        correctIndex: newCorrectIndex,
        id: q.id && !q.id.startsWith('IM-') ? q.id : `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tags: [
          ...(q.tags || []), 
          ...examTypes, 
          "Board Style"
        ]
      };
    });
  });
};

export const generateStudyPlan = async (
  performanceSummary: string,
  examDate: string,
  dailyHours: number,
  targetExam: string
): Promise<StudyPlan> => {
  return fetchWithRetry(async () => {
    const ai = getAIInstance();
    const prompt = `Act as an elite USMLE tutor.
    USER PERFORMANCE SUMMARY: ${performanceSummary}
    TARGET EXAM: ${targetExam}
    EXAM DATE: ${examDate}
    DAILY AVAILABILITY: ${dailyHours} hours

    Generate a personalized weekly study plan from today until the exam date. 
    Focus HEAVILY on the weak areas identified in the performance summary.
    For each week, provide specific high-yield resources (e.g., 'First Aid Step 2 - Cardiology chapter', 'UWorld Endocrinology block', 'OnlineMedEd Surgery videos').

    Return a JSON object where keys are "week1", "week2", etc.
    Each value must be an object with: 
    - "topics": string[]
    - "hours": number (total for the week)
    - "resources": string[]
    - "focusDescription": string (brief explanation of the weekly strategy)
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    return JSON.parse(response.text || "{}");
  });
};

export const generateSimilarQuestions = async (
  failedQuestion: Question,
  examTypes: ExamType[],
  complexity: ClinicalComplexity,
  count: number = 3,
  userFocus?: string
): Promise<Question[]> => {
  return fetchWithRetry(async () => {
    const ai = getAIInstance();
    const prompt = `Act as an expert Medical Board Exam constructor and USMLE tutor. 
    Concepts missed: "${failedQuestion.explanation.keyLearningPoint}". 
    ${userFocus ? `User specific focus request: "${userFocus}".` : "Determine the best focus area based on the missed learning point."}
    Generate exactly ${count} unique clinical vignettes for USMLE ${examTypes.join("/")} at ${complexity} level testing this concept.
    
    ${GENERATION_PROTOCOL}

    Include HIGHLY SPECIFIC subtopic 'tags' (e.g., 'Aortic Dissection', not 'Cardiology'), 'clinicalConcepts', and 'cognitiveLevel'.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: QUESTION_SCHEMA,
      }
    });

    const questions = JSON.parse(response.text || "[]");
    
    return questions.map((q: any) => {
      let actualCorrectIndex = q.correctIndex;
      if (actualCorrectIndex === undefined || actualCorrectIndex < 0 || actualCorrectIndex >= q.options.length) {
        actualCorrectIndex = 0;
      }
      
      const originalCorrectOption = q.options[actualCorrectIndex];
      const shuffledOptions = [...q.options];
      for (let i = shuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
      }
      const newCorrectIndex = shuffledOptions.indexOf(originalCorrectOption);

      return {
        ...q,
        options: shuffledOptions,
        correctIndex: newCorrectIndex,
        id: q.id && !q.id.startsWith('IM-') ? q.id : `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tags: [
          ...(q.tags || []), 
          ...examTypes, 
          "Remediation",
          "Board Style"
        ]
      };
    });
  });
};

export const generateMasteryCards = async (question: Question): Promise<MasteryCard[]> => {
  return fetchWithRetry(async () => {
    const ai = getAIInstance();
    const prompt = `Create 4 study cards (Pathophysiology, Diagnosis, Management, Differentiator) for this clinical scenario: "${question.vignette}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING },
              front: { type: Type.STRING },
              back: { type: Type.STRING }
            },
            required: ["id", "type", "front", "back"]
          }
        },
      }
    });

    const cards = JSON.parse(response.text || "[]");
    return cards.map((c: any) => ({ ...c, parentId: question.id }));
  });
};

export const deepDiveExplanation = async (question: Question): Promise<string> => {
  return fetchWithRetry(async () => {
    const ai = getAIInstance();
    const prompt = `Masterclass explanation for this USMLE vignette: "${question.vignette}". 
    Explain why ${question.options[question.correctIndex]} is correct and distractors are wrong.
    
    FORMATTING RULES:
    - Use proper superscripts and subscripts (e.g., CO₂, PaO₂).
    - Use standard arrows (→) instead of LaTeX symbols.
    - Use clean bullets (•) instead of ####.
    - NO LaTeX formatting (no $ symbols).
    - NO raw symbols like &ge; or &amp;. Use ≥ and &.
    - Output must be clinically readable and human-friendly.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });

    return cleanMedicalText(response.text || "Deep dive generation failed.");
  });
};

export const generateSessionSummary = async (questions: Question[]): Promise<string> => {
  return fetchWithRetry(async () => {
    const ai = getAIInstance();
    const inputData = questions.map((q, i) => `
    [CASE ${i+1}]
    Vignette: ${q.vignette}
    Options: ${q.options.join(", ")}
    Correct Answer: ${q.options[q.correctIndex]}
    Explanation: ${q.explanation.correct} ${q.explanation.incorrect}
    Key Point: ${q.explanation.keyLearningPoint}
    ${q.deepDive ? `Deep Dive: ${q.deepDive}` : ""}
    `).join("\n\n");
    
    const prompt = `
    STRUCTURED HIGH-YIELD NOTE (MATCH FILE STYLE)
    You will receive a USMLE-style quiz including question stems, answer choices, correct answers, full explanations, and deep dives.
    
    TASK:
    Convert ALL provided material into a clean, structured, high-yield study note formatted like a polished board-review sheet.
    
    RULES:
    - Use ONLY information present in the quiz and its explanations.
    - Do NOT add outside knowledge.
    - Do NOT invent missing sections.
    - Remove question-style phrasing (e.g., "The correct answer is...", "This patient has...").
    - Remove meta labels (e.g., Clinical Pearl, Deep Dive, Key Learning Point, Case 1).
    - Use clear section titles in ALL CAPS.
    - Use simple bullet points (-).
    - Use clean spacing between sections.
    - Use light decorative separators (---) between major topics.
    - Make it visually pleasant and easy to scan.
    - No weird symbols or encoding artifacts.
    - No emojis.
    - No Markdown headers (###).
    
    STRUCTURE:
    - Organize content logically based on what appears in the explanation.
    - Group related ideas under clean headers (e.g., PATHOPHYSIOLOGY, CLINICAL PRESENTATION, DIAGNOSTIC WORKUP, MANAGEMENT).
    - Integrate reasoning and differentiations naturally.
    - End with a short RAPID-REVIEW SUMMARY (3-5 bullets).

    INPUT DATA:
    ${inputData}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });

    return response.text || "Summary generation failed";
  });
};

export const generateStudyGuide = async (questions: Question[]): Promise<string> => {
  return fetchWithRetry(async () => {
    const ai = getAIInstance();
    
    const contentStr = questions.map((q, i) => `
    [QUESTION ${i+1}]
    Vignette: ${q.vignette}
    Options: ${q.options.map((opt, idx) => `(${String.fromCharCode(65+idx)}) ${opt}`).join(' ')}
    Correct Answer: ${q.options[q.correctIndex]}
    Key Point: ${q.explanation.keyLearningPoint}
    Rationale (Correct): ${q.explanation.correct}
    Rationale (Incorrect): ${q.explanation.incorrect}
    ${q.deepDive ? `Deep Dive: ${q.deepDive}` : ""}
    `).join('\n\n');

    const prompt = `
    You are an expert medical educator who creates clear, high-quality, exam-oriented study content.

    Take the following raw input and transform it into a professional, human-readable PLAIN TEXT (.txt) Q&A document.

    Rules / Style:
    - DO NOT USE MARKDOWN (like **bold** or ## headers) or HTML tags.
    - NO LaTeX symbols ($). Use plain text (CO₂, ≥, →).
    - Separate each case with a thick separator line:
      ********************************************************************************
    - Use [BRACKETED CAPS] for section headers (e.g. [SCENARIO], [QUESTION], [ANALYSIS]).
    - Indent the vignette text slightly or separate it clearly.
    - List options clearly as (A), (B), (C), etc.
    - Mark the correct answer clearly: >>> CORRECT ANSWER: (X)
    - Explanation: Use clear paragraphs. Separate paragraphs with blank lines.
    - Clinical Pearl: Use a star box for emphasis:
      ****************************************************************
      CLINICAL PEARL: [Text]
      ****************************************************************
    - Use arrows (→) for flow where appropriate.
    - Ensure excellent spacing (double newlines) between sections for readability.

    TECHNICAL REQUIREMENT:
    Return ONLY the plain text string. No code blocks.
    
    INPUT DATA:
    ${contentStr}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "Export Failed. Please try again.";
  });
};
