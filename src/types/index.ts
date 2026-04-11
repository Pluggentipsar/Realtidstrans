// ============================================================
// Core Types for Realtidstrans
// ============================================================

// --- Session ---

export interface Session {
  id: string;
  code: string; // 6-digit audience join code
  title: string;
  description: string;
  context: string; // Legacy free-text context
  briefing: SessionBriefing; // Structured pre-session context
  hostName: string;
  speakers: Speaker[];
  status: SessionStatus;
  settings: SessionSettings;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

// Structured briefing — everything the AI needs to be the smartest person in the room
export interface SessionBriefing {
  topic: string; // What is this session about?
  goal: string; // What should the audience walk away with?
  format: SessionFormat;
  agenda: AgendaItem[];
  preparedQuestions: PreparedQuestion[];
  speakerBios: SpeakerBio[];
  backgroundMaterial: string; // Free text: reports, data, context the AI should know
  avoidTopics: string; // Topics to NOT bring up
  customInstructions: string; // Free text: anything else for the AI
}

export type SessionFormat = 'interview' | 'panel' | 'lecture' | 'workshop' | 'fireside_chat' | 'qa' | 'other';

export const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  interview: 'Intervju',
  panel: 'Panelsamtal',
  lecture: 'Foreläsning',
  workshop: 'Workshop',
  fireside_chat: 'Fireside chat',
  qa: 'Frågestund',
  other: 'Annat',
};

export type AgendaItemStatus = 'upcoming' | 'in_progress' | 'done';

export interface AgendaItem {
  id: string;
  title: string;
  description: string;
  durationMinutes?: number;
  order: number;
  status: AgendaItemStatus;
  startedAt?: number;
  completedAt?: number;
}

export interface PreparedQuestion {
  id: string;
  question: string;
  targetSpeaker?: string; // Who it's for
  priority: 'must_ask' | 'nice_to_ask' | 'if_time';
  status: 'pending' | 'asked' | 'skipped';
  notes?: string; // Private notes for moderator
}

export interface SpeakerBio {
  name: string;
  title: string; // Job title / role
  organization: string;
  expertise: string; // What they're known for
  stance?: string; // Known positions/opinions on the topic
  background?: string; // Relevant background info
}

export const DEFAULT_BRIEFING: SessionBriefing = {
  topic: '',
  goal: '',
  format: 'panel',
  agenda: [],
  preparedQuestions: [],
  speakerBios: [],
  backgroundMaterial: '',
  avoidTopics: '',
  customInstructions: '',
};

export type SessionStatus = 'setup' | 'soundcheck' | 'live' | 'paused' | 'ended';

export interface SessionSettings {
  language: string; // e.g. 'sv-SE'
  summaryMode: SummaryMode; // How AI summarizes
  summaryIntervalSeconds: number; // Interval for 'interval' mode (default 60)
  smartSummaryEnabled: boolean; // Auto-detect topic shifts (for 'auto' mode)
  maxAudienceQuestions: number;
  questionClusterThreshold: number; // Min questions before clustering
  aiInsightsEnabled: boolean;
  enablePunctuation: boolean; // Auto punctuation & formatting
  enableQuoteExtraction: boolean; // Extract quotable moments
  questionFocus: QuestionFocus; // What type of questions to generate
  questionCount: number; // How many questions per cycle (2-5)
  questionTarget: QuestionTarget; // Who to direct questions toward
}

export type SummaryMode = 'interval' | 'topic_shift' | 'auto';

// What kind of questions the AI should focus on
export type QuestionFocus =
  | 'balanced'          // Mix of all types (default)
  | 'challenging'       // Devils advocate, challenge assumptions
  | 'perspectives'      // Blind spots, missing viewpoints, other angles
  | 'gaps'              // What's been missed, unexplored areas
  | 'connections'       // Links to broader context, implications
  | 'clarifying';       // Ambiguities, need for precision

// Who to direct AI questions toward
export type QuestionTarget =
  | 'anyone'              // No specific target (default)
  | 'least_active'        // The person who's spoken least
  | 'most_active'         // Challenge the dominant speaker
  | 'specific';           // A named speaker (set separately)

export const QUESTION_TARGET_OPTIONS: Array<{ key: QuestionTarget; label: string; icon: string; description: string }> = [
  { key: 'anyone', label: 'Alla', icon: '\uD83D\uDC65', description: 'Ingen specifik riktning' },
  { key: 'least_active', label: 'Tystast', icon: '\uD83E\uDD2B', description: 'Rikta till den som pratat minst' },
  { key: 'most_active', label: 'Mest aktiv', icon: '\uD83D\uDCE2', description: 'Utmana den som dominerar' },
  { key: 'specific', label: 'Specifik', icon: '\uD83C\uDFAF', description: 'Rikta till en namngiven talare' },
];

export const QUESTION_FOCUS_OPTIONS: Array<{ key: QuestionFocus; label: string; description: string; icon: string }> = [
  { key: 'balanced', label: 'Balanserad', description: 'Blandning av alla typer', icon: '\u2696\uFE0F' },
  { key: 'challenging', label: 'Utmanande', description: 'Djävulens advokat, ifrågasätt antaganden', icon: '\uD83D\uDD25' },
  { key: 'perspectives', label: 'Perspektiv', description: 'Blinda fläckar, saknade synvinklar', icon: '\uD83D\uDC41\uFE0F' },
  { key: 'gaps', label: 'Luckor', description: 'Vad har missats, outforskade områden', icon: '\uD83E\uDDE9' },
  { key: 'connections', label: 'Kopplingar', description: 'Bredare sammanhang, konsekvenser', icon: '\uD83D\uDD17' },
  { key: 'clarifying', label: 'Förtydligande', description: 'Oklarheter, behov av precision', icon: '\uD83D\uDD0D' },
];

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  language: 'sv-SE',
  summaryMode: 'auto',
  summaryIntervalSeconds: 60,
  smartSummaryEnabled: true,
  maxAudienceQuestions: 500,
  questionClusterThreshold: 5,
  aiInsightsEnabled: true,
  enablePunctuation: true,
  enableQuoteExtraction: true,
  questionFocus: 'balanced',
  questionCount: 3,
  questionTarget: 'anyone',
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

// --- Speaker Profiles (long-term) ---

export interface SpeakerProfile {
  id: string;
  name: string;
  sessionsCount: number;
  totalSpeakingTimeMs: number;
  favoriteWords: Array<{ word: string; count: number }>;
  averageSentenceLength: number;
  topicsDiscussed: string[];
  lastSeenAt: Date;
}

// --- Transcription ---

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  timestamp: number; // ms from session start
  endTimestamp?: number; // ms from session start
  isFinal: boolean;
  confidence: number;
  wordTimestamps?: WordTimestamp[]; // Word-level timing
}

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
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
  topicLabel?: string; // For topic_shift type
  createdAt: Date;
}

export type SummaryType = 'interval' | 'topic_shift' | 'final_chronological' | 'final_thematic' | 'final_agenda_structured' | 'gap_analysis';

export interface AIQuestion {
  id: string;
  sessionId: string;
  question: string;
  category: QuestionCategory;
  relevanceScore: number;
  context: string; // Why this question is relevant
  targetSpeaker?: string; // If directed at a specific person
  status: 'new' | 'highlighted' | 'used' | 'dismissed'; // Moderator triage
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

// --- Quotable Moments ---

export interface QuotableMoment {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  quote: string;
  context: string; // Why this quote is notable
  timestamp: number;
  impactScore: number; // 1-10
  category: 'insight' | 'provocative' | 'emotional' | 'humorous' | 'key_argument';
}

export const QUOTE_CATEGORY_LABELS: Record<QuotableMoment['category'], string> = {
  insight: 'Insikt',
  provocative: 'Provocerande',
  emotional: 'Emotionellt',
  humorous: 'Humoristiskt',
  key_argument: 'Nyckelargument',
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

// --- Polls ---

export interface Poll {
  id: string;
  sessionId: string;
  question: string;
  options: PollOption[];
  status: 'active' | 'closed';
  createdAt: Date;
  closedAt?: Date;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

// --- Audience Reactions ---

export type ReactionType = 'thumbs_up' | 'thinking' | 'question' | 'clap' | 'surprised';

export interface ReactionBurst {
  sessionId: string;
  type: ReactionType;
  count: number;
  timestamp: number;
}

export const REACTION_EMOJIS: Record<ReactionType, string> = {
  thumbs_up: '\uD83D\uDC4D',
  thinking: '\uD83E\uDD14',
  question: '\u2753',
  clap: '\uD83D\uDC4F',
  surprised: '\uD83D\uDE2E',
};

// --- Engagement / Temperature ---

export interface EngagementSnapshot {
  timestamp: number;
  reactionRate: number; // reactions per minute
  questionRate: number; // questions per minute
  activeUsers: number;
  temperature: number; // 0-100 composite score
  dominantReaction?: ReactionType;
}

export interface SessionEngagement {
  sessionId: string;
  snapshots: EngagementSnapshot[];
  peakMoments: Array<{
    timestamp: number;
    temperature: number;
    reason: string; // What caused the peak
  }>;
  totalReactions: Record<ReactionType, number>;
  averageTemperature: number;
}

// --- Speaker Analytics ---

export interface SpeakerAnalytics {
  speakerId: string;
  speakerName: string;
  totalSpeakingTimeMs: number;
  segmentCount: number;
  averageSegmentLengthMs: number;
  wordCount: number;
  topWords: Array<{ word: string; count: number }>;
  speakingPercentage: number;
}

// --- Multi-device Audio ---

export interface AudioDevice {
  id: string;
  sessionId: string;
  deviceName: string;
  speakerId?: string; // Linked speaker
  isActive: boolean;
  joinedAt: Date;
}

// --- Socket.io Events ---

export interface ServerToClientEvents {
  'transcript:partial': (segment: TranscriptSegment) => void;
  'transcript:final': (segment: TranscriptSegment) => void;
  'ai:summary': (summary: AISummary) => void;
  'ai:questions': (questions: AIQuestion[]) => void;
  'ai:quotes': (quotes: QuotableMoment[]) => void;
  'ai:gap_analysis': (analysis: AISummary) => void;
  'ai:topic_shift': (data: { topic: string; timestamp: number }) => void;
  'audience:question_added': (question: AudienceQuestion) => void;
  'audience:question_voted': (data: { questionId: string; votes: number }) => void;
  'audience:clusters_updated': (clusters: QuestionCluster[]) => void;
  'poll:created': (poll: Poll) => void;
  'poll:updated': (poll: Poll) => void;
  'poll:closed': (poll: Poll) => void;
  'reaction:burst': (burst: ReactionBurst) => void;
  'engagement:update': (snapshot: EngagementSnapshot) => void;
  'speakers:analytics': (analytics: SpeakerAnalytics[]) => void;
  'session:status_changed': (status: SessionStatus) => void;
  'session:speaker_identified': (speaker: Speaker) => void;
  'audio:device_joined': (device: AudioDevice) => void;
  'audio:device_left': (deviceId: string) => void;
  // Moderator → Projector control
  'projector:set_view': (data: { view: string; secondary?: string; content?: string }) => void;
  'moderator:question_highlighted': (data: { questionId: string; source: 'ai' | 'audience' }) => void;
  'moderator:question_dismissed': (data: { questionId: string; source: 'ai' | 'audience' }) => void;
  'session:error': (error: { message: string; code: string }) => void;
  'agenda:item_updated': (data: { itemId: string; status: AgendaItemStatus; detectedByAi?: boolean }) => void;
  'agenda:current_detected': (data: { itemId: string; confidence: number; reason: string }) => void;
  'ai:question_suggestion': (data: { suggestedQuestionId: string; reasoning: string; confidence: number }) => void;
  // AI Participant
  'ai_participant:draft': (statement: AIParticipantStatement) => void;
  'ai_participant:shown': (statement: AIParticipantStatement) => void;
  'ai_participant:generating': (data: { persona: AIParticipantPersona }) => void;
}

export interface ClientToServerEvents {
  'session:join': (data: { sessionId: string; role: 'host' | 'audience' }) => void;
  'session:leave': (sessionId: string) => void;
  'audio:chunk': (data: { sessionId: string; chunk: ArrayBuffer; deviceId?: string }) => void;
  'audio:join_as_mic': (data: { sessionId: string; deviceName: string; speakerId?: string }) => void;
  'audio:leave_as_mic': (data: { sessionId: string; deviceId: string }) => void;
  'transcription:start': (sessionId: string) => void;
  'transcription:stop': (sessionId: string) => void;
  'audience:submit_question': (data: {
    sessionId: string;
    text: string;
    authorName?: string;
  }) => void;
  'audience:vote_question': (data: { sessionId: string; questionId: string }) => void;
  'audience:react': (data: { sessionId: string; type: ReactionType }) => void;
  'poll:create': (data: { sessionId: string; question: string; options: string[] }) => void;
  'poll:vote': (data: { sessionId: string; pollId: string; optionId: string }) => void;
  'poll:close': (data: { sessionId: string; pollId: string }) => void;
  'settings:update_question_focus': (data: { sessionId: string; focus: QuestionFocus; count?: number }) => void;
  'settings:update_question_target': (data: { sessionId: string; target: QuestionTarget; specificSpeaker?: string }) => void;
  // Moderator actions
  'moderator:highlight_question': (data: { sessionId: string; questionId: string; source: 'ai' | 'audience' }) => void;
  'moderator:dismiss_question': (data: { sessionId: string; questionId: string; source: 'ai' | 'audience' }) => void;
  'moderator:set_projector_view': (data: { sessionId: string; view: string; secondary?: string; content?: string }) => void;
  'moderator:update_agenda_item': (data: { sessionId: string; itemId: string; status: AgendaItemStatus }) => void;
  // AI Participant
  'ai_participant:request': (data: { sessionId: string; persona: AIParticipantPersona; customPrompt?: string }) => void;
  'ai_participant:approve': (data: { sessionId: string; statement: AIParticipantStatement }) => void;
  'ai_participant:reject': (data: { sessionId: string; statementId: string }) => void;
}

// --- AI Participant ---

export type AIParticipantPersona = 'critic' | 'synthesizer' | 'challenger' | 'researcher' | 'custom';

export const AI_PARTICIPANT_PERSONAS: Record<AIParticipantPersona, {
  label: string;
  icon: string;
  description: string;
  shortDescription: string;
}> = {
  critic: {
    label: 'Kritikern',
    icon: '\uD83D\uDD25',
    description: 'Skarpt ifragasattande, letar efter svagheter i argument',
    shortDescription: 'Ifragasatter allt',
  },
  synthesizer: {
    label: 'Syntesaren',
    icon: '\uD83E\uDDE9',
    description: 'Kopplar ihop tradar, ser monster och samband ingen annan sett',
    shortDescription: 'Kopplar ihop',
  },
  challenger: {
    label: 'Utmanaren',
    icon: '\u26A1',
    description: 'Provocerande, ber om bevis, testar pastaenden',
    shortDescription: 'Provocerar',
  },
  researcher: {
    label: 'Forskaren',
    icon: '\uD83D\uDCDA',
    description: 'Drar in data, fakta, historiska paralleller och bredare kunskap',
    shortDescription: 'Tillfor fakta',
  },
  custom: {
    label: 'Fri',
    icon: '\u270D\uFE0F',
    description: 'Skriv egna instruktioner for AI:ns rost',
    shortDescription: 'Egen prompt',
  },
};

export interface AIParticipantStatement {
  id: string;
  sessionId: string;
  persona: AIParticipantPersona;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'shown';
  createdAt: Date;
}
