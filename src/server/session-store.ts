import {
  Session,
  SessionStatus,
  SessionBriefing,
  DEFAULT_BRIEFING,
  TranscriptSegment,
  AISummary,
  AIQuestion,
  AudienceQuestion,
  QuestionCluster,
  DEFAULT_SESSION_SETTINGS,
  Speaker,
  Poll,
  PollOption,
  QuotableMoment,
  ReactionType,
  ReactionBurst,
  EngagementSnapshot,
  SessionEngagement,
  SpeakerAnalytics,
  AudioDevice,
} from '@/types';
import { generateId, generateSessionCode } from '@/lib/utils';

// In-memory session store — works standalone, Prisma layer can be added as a persistence backend
class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private sessionsByCode: Map<string, string> = new Map();
  private transcripts: Map<string, TranscriptSegment[]> = new Map();
  private summaries: Map<string, AISummary[]> = new Map();
  private aiQuestions: Map<string, AIQuestion[]> = new Map();
  private audienceQuestions: Map<string, AudienceQuestion[]> = new Map();
  private questionClusters: Map<string, QuestionCluster[]> = new Map();
  private polls: Map<string, Poll[]> = new Map();
  private pollVoters: Map<string, Set<string>> = new Map(); // pollId -> Set<voterId>
  private quotableMoments: Map<string, QuotableMoment[]> = new Map();
  private reactions: Map<string, Array<{ type: ReactionType; timestamp: number }>> = new Map();
  private reactionBuffers: Map<string, Map<ReactionType, number>> = new Map(); // session -> type -> count (buffered)
  private engagementSnapshots: Map<string, EngagementSnapshot[]> = new Map();
  private audioDevices: Map<string, AudioDevice[]> = new Map();
  private activeUsers: Map<string, Set<string>> = new Map(); // session -> Set<socketId>

  // ===== Session CRUD =====

  createSession(data: {
    title: string;
    description: string;
    context: string;
    hostName: string;
    speakers?: Speaker[];
    briefing?: Partial<SessionBriefing>;
  }): Session {
    const id = generateId();
    const code = generateSessionCode();

    const session: Session = {
      id,
      code,
      title: data.title,
      description: data.description,
      context: data.context,
      briefing: { ...DEFAULT_BRIEFING, ...data.briefing },
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
    this.polls.set(id, []);
    this.quotableMoments.set(id, []);
    this.reactions.set(id, []);
    this.reactionBuffers.set(id, new Map());
    this.engagementSnapshots.set(id, []);
    this.audioDevices.set(id, []);
    this.activeUsers.set(id, new Set());

    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
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

  updateBriefing(id: string, briefing: Partial<SessionBriefing>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    session.briefing = { ...session.briefing, ...briefing };
    return session;
  }

  updatePreparedQuestionStatus(sessionId: string, questionId: string, status: 'pending' | 'asked' | 'skipped'): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const q = session.briefing.preparedQuestions.find((q) => q.id === questionId);
    if (q) q.status = status;
  }

  linkSpeakerToProfile(sessionId: string, speakerId: string, speakerName: string, color: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    // Update existing speaker or add new
    const existing = session.speakers.find((s) => s.id === speakerId);
    if (existing) {
      existing.name = speakerName;
    } else {
      session.speakers.push({ id: speakerId, name: speakerName, role: 'guest', color });
    }
  }

  updateSessionSettings(id: string, settings: Partial<Session['settings']>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    session.settings = { ...session.settings, ...settings };
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

  // ===== Transcript =====

  addTranscriptSegment(segment: TranscriptSegment): void {
    const segments = this.transcripts.get(segment.sessionId);
    if (segments) {
      if (segment.isFinal) {
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

  getRecentFinalTranscript(sessionId: string, windowMs: number): TranscriptSegment[] {
    const segments = this.transcripts.get(sessionId) || [];
    const now = segments.length > 0 ? segments[segments.length - 1].timestamp : 0;
    return segments.filter((s) => s.isFinal && s.timestamp > now - windowMs);
  }

  getFullFinalTranscript(sessionId: string): string {
    const segments = this.transcripts.get(sessionId) || [];
    return segments
      .filter((s) => s.isFinal)
      .map((s) => `${s.speakerName}: ${s.text}`)
      .join('\n');
  }

  // ===== AI Summaries =====

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

  // ===== Quotable Moments =====

  addQuotableMoments(moments: QuotableMoment[]): void {
    if (moments.length === 0) return;
    const existing = this.quotableMoments.get(moments[0].sessionId);
    if (existing) existing.push(...moments);
  }

  getQuotableMoments(sessionId: string): QuotableMoment[] {
    return this.quotableMoments.get(sessionId) || [];
  }

  // ===== Audience Q&A =====

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

  // ===== Polls =====

  createPoll(sessionId: string, question: string, options: string[]): Poll {
    const poll: Poll = {
      id: generateId(),
      sessionId,
      question,
      options: options.map((text) => ({
        id: generateId(),
        text,
        votes: 0,
      })),
      status: 'active',
      createdAt: new Date(),
    };

    const polls = this.polls.get(sessionId);
    if (polls) polls.push(poll);
    this.pollVoters.set(poll.id, new Set());
    return poll;
  }

  votePoll(pollId: string, optionId: string, voterId: string): Poll | null {
    // Find poll across all sessions
    for (const polls of this.polls.values()) {
      const poll = polls.find((p) => p.id === pollId);
      if (poll && poll.status === 'active') {
        const voters = this.pollVoters.get(pollId);
        if (voters?.has(voterId)) return null; // Already voted
        voters?.add(voterId);

        const option = poll.options.find((o: PollOption) => o.id === optionId);
        if (option) option.votes += 1;
        return poll;
      }
    }
    return null;
  }

  closePoll(sessionId: string, pollId: string): Poll | null {
    const polls = this.polls.get(sessionId);
    if (!polls) return null;
    const poll = polls.find((p) => p.id === pollId);
    if (poll) {
      poll.status = 'closed';
      poll.closedAt = new Date();
    }
    return poll || null;
  }

  getPolls(sessionId: string): Poll[] {
    return this.polls.get(sessionId) || [];
  }

  // ===== Reactions =====

  addReaction(sessionId: string, type: ReactionType): void {
    const reactions = this.reactions.get(sessionId);
    if (reactions) {
      reactions.push({ type, timestamp: Date.now() });
    }

    // Buffer for burst emission
    const buffer = this.reactionBuffers.get(sessionId);
    if (buffer) {
      buffer.set(type, (buffer.get(type) || 0) + 1);
    }
  }

  flushReactionBuffer(sessionId: string): ReactionBurst[] {
    const buffer = this.reactionBuffers.get(sessionId);
    if (!buffer || buffer.size === 0) return [];

    const bursts: ReactionBurst[] = [];
    const now = Date.now();
    for (const [type, count] of buffer.entries()) {
      if (count > 0) {
        bursts.push({ sessionId, type, count, timestamp: now });
      }
    }
    buffer.clear();
    return bursts;
  }

  getReactionCounts(sessionId: string): Record<ReactionType, number> {
    const reactions = this.reactions.get(sessionId) || [];
    const counts: Record<string, number> = {
      thumbs_up: 0,
      thinking: 0,
      question: 0,
      clap: 0,
      surprised: 0,
    };
    for (const r of reactions) {
      counts[r.type] = (counts[r.type] || 0) + 1;
    }
    return counts as Record<ReactionType, number>;
  }

  getRecentReactionRate(sessionId: string, windowMs: number = 60000): number {
    const reactions = this.reactions.get(sessionId) || [];
    const cutoff = Date.now() - windowMs;
    const recent = reactions.filter((r) => r.timestamp > cutoff);
    return (recent.length / windowMs) * 60000; // per minute
  }

  // ===== Engagement =====

  addEngagementSnapshot(sessionId: string, snapshot: EngagementSnapshot): void {
    const snapshots = this.engagementSnapshots.get(sessionId);
    if (snapshots) snapshots.push(snapshot);
  }

  getEngagementSnapshots(sessionId: string): EngagementSnapshot[] {
    return this.engagementSnapshots.get(sessionId) || [];
  }

  getSessionEngagement(sessionId: string): SessionEngagement {
    const snapshots = this.engagementSnapshots.get(sessionId) || [];
    const totalReactions = this.getReactionCounts(sessionId);

    const avgTemp = snapshots.length > 0
      ? snapshots.reduce((sum, s) => sum + s.temperature, 0) / snapshots.length
      : 0;

    // Find peak moments (temperature > 70)
    const peakMoments = snapshots
      .filter((s) => s.temperature > 70)
      .map((s) => ({
        timestamp: s.timestamp,
        temperature: s.temperature,
        reason: s.dominantReaction
          ? `Hög ${s.dominantReaction}-aktivitet`
          : 'Högt engagemang',
      }));

    return {
      sessionId,
      snapshots,
      peakMoments,
      totalReactions,
      averageTemperature: avgTemp,
    };
  }

  // ===== Active Users =====

  addActiveUser(sessionId: string, socketId: string): void {
    const users = this.activeUsers.get(sessionId);
    if (users) users.add(socketId);
  }

  removeActiveUser(sessionId: string, socketId: string): void {
    const users = this.activeUsers.get(sessionId);
    if (users) users.delete(socketId);
  }

  getActiveUserCount(sessionId: string): number {
    return this.activeUsers.get(sessionId)?.size || 0;
  }

  // ===== Audio Devices =====

  addAudioDevice(device: AudioDevice): void {
    const devices = this.audioDevices.get(device.sessionId);
    if (devices) devices.push(device);
  }

  removeAudioDevice(sessionId: string, deviceId: string): void {
    const devices = this.audioDevices.get(sessionId);
    if (devices) {
      const idx = devices.findIndex((d) => d.id === deviceId);
      if (idx >= 0) devices.splice(idx, 1);
    }
  }

  getAudioDevices(sessionId: string): AudioDevice[] {
    return this.audioDevices.get(sessionId) || [];
  }

  // ===== Speaker Analytics =====

  getSpeakerAnalytics(sessionId: string): SpeakerAnalytics[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const segments = (this.transcripts.get(sessionId) || []).filter((s) => s.isFinal);
    const totalDuration = segments.reduce((sum, s) => {
      const duration = s.endTimestamp ? s.endTimestamp - s.timestamp : 3000; // estimate 3s
      return sum + duration;
    }, 0);

    const speakerMap = new Map<string, {
      segments: TranscriptSegment[];
      totalMs: number;
      words: string[];
    }>();

    for (const segment of segments) {
      if (!speakerMap.has(segment.speakerId)) {
        speakerMap.set(segment.speakerId, { segments: [], totalMs: 0, words: [] });
      }
      const data = speakerMap.get(segment.speakerId)!;
      data.segments.push(segment);
      data.totalMs += segment.endTimestamp ? segment.endTimestamp - segment.timestamp : 3000;
      data.words.push(...segment.text.split(/\s+/));
    }

    const analytics: SpeakerAnalytics[] = [];
    for (const [speakerId, data] of speakerMap.entries()) {
      // Count word frequencies
      const wordCounts = new Map<string, number>();
      const stopWords = new Set(['och', 'att', 'det', 'i', 'en', 'är', 'som', 'på', 'för', 'med', 'den', 'har', 'av', 'till', 'var', 'inte', 'om', 'ett', 'men', 'de', 'jag', 'vi', 'så', 'kan', 'man', 'ska', 'hade', 'alla', 'mycket', 'han', 'hon', 'dig', 'mig']);
      for (const word of data.words) {
        const lower = word.toLowerCase().replace(/[.,!?;:]/g, '');
        if (lower.length > 2 && !stopWords.has(lower)) {
          wordCounts.set(lower, (wordCounts.get(lower) || 0) + 1);
        }
      }

      const topWords = Array.from(wordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));

      const speaker = session.speakers.find((s) => s.id === speakerId);

      analytics.push({
        speakerId,
        speakerName: speaker?.name || `Talare ${speakerId}`,
        totalSpeakingTimeMs: data.totalMs,
        segmentCount: data.segments.length,
        averageSegmentLengthMs: data.totalMs / data.segments.length,
        wordCount: data.words.length,
        topWords,
        speakingPercentage: totalDuration > 0 ? (data.totalMs / totalDuration) * 100 : 0,
      });
    }

    return analytics.sort((a, b) => b.speakingPercentage - a.speakingPercentage);
  }
  // Import a session object fetched from another source (e.g. API worker in dev mode)
  importSession(sessionData: Session): void {
    if (this.sessions.has(sessionData.id)) return; // don't overwrite
    this.sessions.set(sessionData.id, sessionData);
    if (sessionData.code) {
      this.sessionsByCode.set(sessionData.code, sessionData.id);
    }
    // Initialize empty collections for this session
    if (!this.transcripts.has(sessionData.id)) this.transcripts.set(sessionData.id, []);
    if (!this.summaries.has(sessionData.id)) this.summaries.set(sessionData.id, []);
    if (!this.aiQuestions.has(sessionData.id)) this.aiQuestions.set(sessionData.id, []);
    if (!this.audienceQuestions.has(sessionData.id)) this.audienceQuestions.set(sessionData.id, []);
    if (!this.questionClusters.has(sessionData.id)) this.questionClusters.set(sessionData.id, []);
    if (!this.quotableMoments.has(sessionData.id)) this.quotableMoments.set(sessionData.id, []);
    if (!this.polls.has(sessionData.id)) this.polls.set(sessionData.id, []);
    console.log(`[session-store] Imported session "${sessionData.title}" (${sessionData.id})`);
  }

  updateAgendaItemStatus(sessionId: string, itemId: string, status: 'upcoming' | 'in_progress' | 'done'): void {
    const session = this.sessions.get(sessionId);
    if (!session?.briefing?.agenda) return;
    const item = session.briefing.agenda.find((a) => a.id === itemId);
    if (!item) return;
    item.status = status;
    if (status === 'in_progress' && !item.startedAt) item.startedAt = Date.now();
    if (status === 'done') item.completedAt = Date.now();
  }
}

export const sessionStore = new SessionStore();
