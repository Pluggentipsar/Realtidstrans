// ============================================================
// Core Types for Realtidstrans
// ============================================================

// --- Session ---

export interface Session {
  id: string;
  code: string; // 6-digit audience join code
  title: string;
  description: string;
  context: string; // Pre-session context about the topic
  hostName: string;
  speakers: Speaker[];
  status: SessionStatus;
  settings: SessionSettings;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export type SessionStatus = 'setup' | 'soundcheck' | 'live' | 'paused' | 'ended';

export interface SessionSettings {
  language: string; // e.g. 'sv-SE'
  summaryIntervalSeconds: number; // How often AI summarizes (default 60)
  smartSummaryEnabled: boolean; // Auto-detect topic shifts
  maxAudienceQuestions: number;
  questionClusterThreshold: number; // Min questions before clustering
  aiInsightsEnabled: boolean;
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  language: 'sv-SE',
  summaryIntervalSeconds: 60,
  smartSummaryEnabled: true,
  maxAudienceQuestions: 500,
  questionClusterThreshold: 5,
  aiInsightsEnabled: true,
};

// --- Speakers ---

export interface Speaker {
  id: string;
  name: string;
  role: SpeakerRole;
  voiceProfileId?: string; // Azure Speaker Recognition profile ID
  color: string; // For UI display
}

export type SpeakerRole = 'host' | 'guest' | 'panelist' | 'lecturer' | 'unknown';

export const SPEAKER_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];

// --- Transcription ---

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  timestamp: number; // ms from session start
  isFinal: boolean;
  confidence: number;
}

export interface TranscriptChunk {
  segments: TranscriptSegment[];
  startTime: number;
  endTime: number;
}

// --- AI Insights ---

export interface AISummary {
  id: string;
  sessionId: string;
  content: string;
  type: SummaryType;
  coveringFrom: number; // timestamp
  coveringTo: number; // timestamp
  createdAt: Date;
}

export type SummaryType = 'interval' | 'topic_shift' | 'final_chronological' | 'final_thematic';

export interface AIQuestion {
  id: string;
  sessionId: string;
  question: string;
  category: QuestionCategory;
  relevanceScore: number;
  context: string; // Why this question is relevant
  createdAt: Date;
}

export type QuestionCategory =
  | 'devils_advocate'
  | 'blind_spot'
  | 'deeper_perspective'
  | 'challenge'
  | 'clarification'
  | 'connection';

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  devils_advocate: 'Djävulens advokat',
  blind_spot: 'Blind fläck',
  deeper_perspective: 'Djupare perspektiv',
  challenge: 'Utmaning',
  clarification: 'Förtydligande',
  connection: 'Koppling',
};

// --- Audience Q&A ---

export interface AudienceQuestion {
  id: string;
  sessionId: string;
  text: string;
  authorName?: string;
  votes: number;
  status: QuestionStatus;
  clusterId?: string;
  submittedAt: Date;
}

export type QuestionStatus = 'pending' | 'highlighted' | 'answered' | 'clustered';

export interface QuestionCluster {
  id: string;
  sessionId: string;
  theme: string;
  summary: string;
  questionIds: string[];
  priority: number;
}

// --- Socket.io Events ---

export interface ServerToClientEvents {
  'transcript:partial': (segment: TranscriptSegment) => void;
  'transcript:final': (segment: TranscriptSegment) => void;
  'ai:summary': (summary: AISummary) => void;
  'ai:questions': (questions: AIQuestion[]) => void;
  'audience:question_added': (question: AudienceQuestion) => void;
  'audience:question_voted': (data: { questionId: string; votes: number }) => void;
  'audience:clusters_updated': (clusters: QuestionCluster[]) => void;
  'session:status_changed': (status: SessionStatus) => void;
  'session:speaker_identified': (speaker: Speaker) => void;
  'error': (error: { message: string; code: string }) => void;
}

export interface ClientToServerEvents {
  'session:join': (data: { sessionId: string; role: 'host' | 'audience' }) => void;
  'session:leave': (sessionId: string) => void;
  'audio:chunk': (data: { sessionId: string; chunk: ArrayBuffer }) => void;
  'transcription:start': (sessionId: string) => void;
  'transcription:stop': (sessionId: string) => void;
  'audience:submit_question': (data: {
    sessionId: string;
    text: string;
    authorName?: string;
  }) => void;
  'audience:vote_question': (data: { sessionId: string; questionId: string }) => void;
}
