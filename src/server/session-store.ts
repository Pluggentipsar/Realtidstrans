import {
  Session,
  SessionStatus,
  TranscriptSegment,
  AISummary,
  AIQuestion,
  AudienceQuestion,
  QuestionCluster,
  DEFAULT_SESSION_SETTINGS,
  Speaker,
} from '@/types';
import { generateId, generateSessionCode } from '@/lib/utils';

// In-memory session store (replace with PostgreSQL/Prisma for production)
class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private sessionsByCode: Map<string, string> = new Map(); // code -> sessionId
  private transcripts: Map<string, TranscriptSegment[]> = new Map();
  private summaries: Map<string, AISummary[]> = new Map();
  private aiQuestions: Map<string, AIQuestion[]> = new Map();
  private audienceQuestions: Map<string, AudienceQuestion[]> = new Map();
  private questionClusters: Map<string, QuestionCluster[]> = new Map();

  createSession(data: {
    title: string;
    description: string;
    context: string;
    hostName: string;
    speakers?: Speaker[];
  }): Session {
    const id = generateId();
    const code = generateSessionCode();

    const session: Session = {
      id,
      code,
      title: data.title,
      description: data.description,
      context: data.context,
      hostName: data.hostName,
      speakers: data.speakers || [],
      status: 'setup',
      settings: { ...DEFAULT_SESSION_SETTINGS },
      createdAt: new Date(),
    };

    this.sessions.set(id, session);
    this.sessionsByCode.set(code, id);
    this.transcripts.set(id, []);
    this.summaries.set(id, []);
    this.aiQuestions.set(id, []);
    this.audienceQuestions.set(id, []);
    this.questionClusters.set(id, []);

    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getSessionByCode(code: string): Session | undefined {
    const id = this.sessionsByCode.get(code);
    return id ? this.sessions.get(id) : undefined;
  }

  updateSessionStatus(id: string, status: SessionStatus): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    session.status = status;
    if (status === 'live' && !session.startedAt) {
      session.startedAt = new Date();
    }
    if (status === 'ended') {
      session.endedAt = new Date();
    }
    return session;
  }

  addSpeaker(sessionId: string, speaker: Speaker): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const existing = session.speakers.find((s) => s.id === speaker.id);
      if (!existing) {
        session.speakers.push(speaker);
      }
    }
  }

  // Transcript management
  addTranscriptSegment(segment: TranscriptSegment): void {
    const segments = this.transcripts.get(segment.sessionId);
    if (segments) {
      if (segment.isFinal) {
        // Replace any partial with same speaker that was most recent
        const lastIndex = segments.length - 1;
        if (
          lastIndex >= 0 &&
          !segments[lastIndex].isFinal &&
          segments[lastIndex].speakerId === segment.speakerId
        ) {
          segments[lastIndex] = segment;
          return;
        }
      }
      segments.push(segment);
    }
  }

  getTranscript(sessionId: string): TranscriptSegment[] {
    return this.transcripts.get(sessionId) || [];
  }

  getFinalTranscriptSince(sessionId: string, sinceTimestamp: number): TranscriptSegment[] {
    const segments = this.transcripts.get(sessionId) || [];
    return segments.filter((s) => s.isFinal && s.timestamp > sinceTimestamp);
  }

  getFullFinalTranscript(sessionId: string): string {
    const segments = this.transcripts.get(sessionId) || [];
    return segments
      .filter((s) => s.isFinal)
      .map((s) => `${s.speakerName}: ${s.text}`)
      .join('\n');
  }

  // AI data management
  addSummary(summary: AISummary): void {
    const summaries = this.summaries.get(summary.sessionId);
    if (summaries) summaries.push(summary);
  }

  getSummaries(sessionId: string): AISummary[] {
    return this.summaries.get(sessionId) || [];
  }

  addAIQuestions(questions: AIQuestion[]): void {
    if (questions.length === 0) return;
    const existing = this.aiQuestions.get(questions[0].sessionId);
    if (existing) existing.push(...questions);
  }

  getAIQuestions(sessionId: string): AIQuestion[] {
    return this.aiQuestions.get(sessionId) || [];
  }

  // Audience Q&A
  addAudienceQuestion(question: AudienceQuestion): void {
    const questions = this.audienceQuestions.get(question.sessionId);
    if (questions) questions.push(question);
  }

  getAudienceQuestions(sessionId: string): AudienceQuestion[] {
    return this.audienceQuestions.get(sessionId) || [];
  }

  voteQuestion(sessionId: string, questionId: string): number {
    const questions = this.audienceQuestions.get(sessionId);
    if (!questions) return 0;
    const question = questions.find((q) => q.id === questionId);
    if (!question) return 0;
    question.votes += 1;
    return question.votes;
  }

  updateQuestionClusters(sessionId: string, clusters: QuestionCluster[]): void {
    this.questionClusters.set(sessionId, clusters);
    // Mark clustered questions
    const questions = this.audienceQuestions.get(sessionId);
    if (questions) {
      for (const cluster of clusters) {
        for (const qId of cluster.questionIds) {
          const q = questions.find((question) => question.id === qId);
          if (q) {
            q.status = 'clustered';
            q.clusterId = cluster.id;
          }
        }
      }
    }
  }

  getQuestionClusters(sessionId: string): QuestionCluster[] {
    return this.questionClusters.get(sessionId) || [];
  }
}

export const sessionStore = new SessionStore();
