import { sessionStore } from './session-store';
import { buildSessionContext } from '@/lib/prompts/system';
import {
  generateSummary,
  generateQuestions,
  clusterAudienceQuestions,
  detectTopicShift,
  extractQuotes,
} from '@/lib/claude-ai';
import {
  AISummary,
  AIQuestion,
  QuestionCluster,
  QuotableMoment,
  SummaryMode,
} from '@/types';
import {
  estimateTokens,
  truncateToTokenBudget,
  buildContextWindow,
  TOKEN_BUDGETS,
} from '@/lib/token-manager';

interface AIProcessorCallbacks {
  onSummary: (summary: AISummary) => void;
  onQuestions: (questions: AIQuestion[]) => void;
  onClusters: (clusters: QuestionCluster[]) => void;
  onQuotes: (quotes: QuotableMoment[]) => void;
  onTopicShift: (data: { topic: string; timestamp: number }) => void;
}

const MAX_TOPIC_WINDOW_CHARS = 7_000;

// Minimum seconds of new content required to justify a summary
const MIN_CONTENT_SECONDS = 15;
// Minimum segments required for a summary
const MIN_CONTENT_SEGMENTS = 3;
// Cooldown after a summary before another can trigger (prevents rapid-fire)
const SUMMARY_COOLDOWN_MS = 20_000; // 20 seconds

export class AIProcessor {
  private sessionId: string;
  private callbacks: AIProcessorCallbacks;
  private summaryInterval: NodeJS.Timeout | null = null;
  private topicCheckInterval: NodeJS.Timeout | null = null;
  private lastProcessedTimestamp: number = 0;
  private lastTopicCheckTimestamp: number = 0;
  private lastSummaryTime: number = 0; // wall clock of last summary (for cooldown)
  private isProcessing: boolean = false;
  private previousTopicTranscript: string = '';
  private summaryMode: SummaryMode = 'auto';
  private pendingTopicShift: { topic: string; timestamp: number } | null = null;

  // Sliding window: keep last N summaries as context for AI
  private recentSummaries: string[] = [];
  private maxRecentSummaries: number = 5;

  constructor(sessionId: string, callbacks: AIProcessorCallbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  start(intervalMs: number = 60000, mode: SummaryMode = 'auto'): void {
    this.lastProcessedTimestamp = 0;
    this.lastTopicCheckTimestamp = 0;
    this.lastSummaryTime = 0;
    this.summaryMode = mode;
    this.pendingTopicShift = null;

    if (mode === 'interval' || mode === 'auto') {
      this.summaryInterval = setInterval(() => {
        this.processNewTranscript('interval');
      }, intervalMs);
    }

    // Topic shift detection: every 30s
    if (mode === 'topic_shift' || mode === 'auto') {
      this.topicCheckInterval = setInterval(() => {
        this.checkTopicShift();
      }, 30000);
    }
  }

  stop(): void {
    if (this.summaryInterval) {
      clearInterval(this.summaryInterval);
      this.summaryInterval = null;
    }
    if (this.topicCheckInterval) {
      clearInterval(this.topicCheckInterval);
      this.topicCheckInterval = null;
    }
  }

  setSummaryMode(mode: SummaryMode): void {
    this.summaryMode = mode;
    const session = sessionStore.getSession(this.sessionId);
    if (session) {
      this.stop();
      this.start(session.settings.summaryIntervalSeconds * 1000, mode);
    }
  }

  async processNewTranscript(
    triggerType: 'interval' | 'topic_shift' = 'interval',
    topicLabel?: string
  ): Promise<void> {
    if (this.isProcessing) return;

    // Cooldown check: don't summarize too rapidly
    const now = Date.now();
    if (this.lastSummaryTime > 0 && now - this.lastSummaryTime < SUMMARY_COOLDOWN_MS) {
      // If this is a topic shift, save it for the next interval cycle
      if (triggerType === 'topic_shift' && topicLabel) {
        this.pendingTopicShift = { topic: topicLabel, timestamp: now };
        console.log(`[ai-processor] Topic shift "${topicLabel}" queued (cooldown active, ${Math.round((SUMMARY_COOLDOWN_MS - (now - this.lastSummaryTime)) / 1000)}s remaining)`);
      }
      return;
    }

    this.isProcessing = true;

    try {
      const session = sessionStore.getSession(this.sessionId);
      if (!session) {
        console.log(`[ai-processor] Session ${this.sessionId} not found in store — skipping`);
        return;
      }
      if (session.status !== 'live') {
        console.log(`[ai-processor] Session status is "${session.status}" — skipping`);
        return;
      }

      const newSegments = sessionStore.getFinalTranscriptSince(
        this.sessionId,
        this.lastProcessedTimestamp
      );

      if (newSegments.length < MIN_CONTENT_SEGMENTS) {
        console.log(`[ai-processor] Only ${newSegments.length} segments — skipping (need ${MIN_CONTENT_SEGMENTS})`);
        return;
      }

      // Check minimum time span
      const timeSpanMs = newSegments[newSegments.length - 1].timestamp - newSegments[0].timestamp;
      if (timeSpanMs < MIN_CONTENT_SECONDS * 1000) {
        console.log(`[ai-processor] Only ${Math.round(timeSpanMs / 1000)}s of content — skipping (need ${MIN_CONTENT_SECONDS}s)`);
        return;
      }

      // If we have a pending topic shift, use it as the label for this summary
      let effectiveType = triggerType;
      let effectiveLabel = topicLabel;
      if (this.pendingTopicShift && triggerType === 'interval') {
        effectiveType = 'topic_shift';
        effectiveLabel = this.pendingTopicShift.topic;
        this.pendingTopicShift = null;
        console.log(`[ai-processor] Using queued topic shift: "${effectiveLabel}"`);
      }

      const rawTranscriptText = newSegments
        .map((s) => `${s.speakerName}: ${s.text}`)
        .join('\n');

      const transcriptText = truncateToTokenBudget(
        rawTranscriptText,
        TOKEN_BUDGETS.intervalSummary.maxInputTokens,
        'keep_end'
      );

      const tokensEstimate = estimateTokens(transcriptText);
      console.log(`[ai-processor] Processing ${newSegments.length} segments (~${tokensEstimate} tokens, ${Math.round(timeSpanMs / 1000)}s, trigger: ${effectiveType})`);

      const startTime = newSegments[0].timestamp;
      const endTime = newSegments[newSegments.length - 1].timestamp;

      const sessionContext = buildSessionContext(session.title, session.description, session.context, session.briefing);

      const contextAwareTranscript = buildContextWindow(
        sessionStore.getFullFinalTranscript(this.sessionId),
        transcriptText,
        TOKEN_BUDGETS.intervalSummary.maxInputTokens,
        this.recentSummaries
      );

      // Get speaker analytics for question targeting
      const speakerAnalytics = sessionStore.getSpeakerAnalytics(this.sessionId);
      const speakerTimes = speakerAnalytics.map((s) => ({
        name: s.speakerName,
        percentage: s.speakingPercentage,
        wordCount: s.wordCount,
      }));
      const targetInfo = session.settings.questionTarget && session.settings.questionTarget !== 'anyone'
        ? { target: session.settings.questionTarget as 'least_active' | 'most_active' | 'specific', specificSpeaker: undefined as string | undefined }
        : undefined;

      // Run summary, questions, and quote extraction in parallel
      const promises: [
        Promise<AISummary>,
        Promise<AIQuestion[]>,
        Promise<QuotableMoment[]>,
      ] = [
        generateSummary(
          this.sessionId,
          sessionContext,
          contextAwareTranscript,
          startTime,
          endTime,
          effectiveType,
          effectiveLabel,
          // Pass the most recent summary so AI knows what was already covered
          this.recentSummaries.length > 0
            ? this.recentSummaries[this.recentSummaries.length - 1]
            : undefined
        ),
        session.settings.aiInsightsEnabled
          ? generateQuestions(
              this.sessionId,
              sessionContext,
              contextAwareTranscript,
              session.settings.questionFocus || 'balanced',
              session.settings.questionCount || 3,
              speakerTimes.length > 0 ? speakerTimes : undefined,
              targetInfo
            )
          : Promise.resolve([]),
        session.settings.enableQuoteExtraction
          ? extractQuotes(this.sessionId, sessionContext, transcriptText, startTime)
          : Promise.resolve([]),
      ];

      const [summary, questions, quotes] = await Promise.all(promises);

      // Store summary in sliding window for future context
      this.recentSummaries.push(summary.content);
      if (this.recentSummaries.length > this.maxRecentSummaries) {
        this.recentSummaries.shift();
      }

      sessionStore.addSummary(summary);
      this.callbacks.onSummary(summary);

      if (questions.length > 0) {
        sessionStore.addAIQuestions(questions);
        this.callbacks.onQuestions(questions);
      }

      if (quotes.length > 0) {
        sessionStore.addQuotableMoments(quotes);
        this.callbacks.onQuotes(quotes);
      }

      this.previousTopicTranscript = transcriptText.slice(-MAX_TOPIC_WINDOW_CHARS);
      this.lastProcessedTimestamp = endTime;
      this.lastSummaryTime = Date.now();

      await this.maybeClusterQuestions();
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        console.warn('[ai-processor] Skipped processing cycle due to rate limit');
      } else {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[ai-processor] ERROR: ${msg}`);
        // Log full error for debugging
        if (error instanceof Error && error.stack) {
          console.error(error.stack);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async checkTopicShift(): Promise<void> {
    if (this.isProcessing) return;

    try {
      const session = sessionStore.getSession(this.sessionId);
      if (!session || session.status !== 'live') return;

      const recentSegments = sessionStore.getFinalTranscriptSince(
        this.sessionId,
        this.lastTopicCheckTimestamp
      );

      if (recentSegments.length < 3) return;

      let recentText = recentSegments
        .map((s) => `${s.speakerName}: ${s.text}`)
        .join('\n');

      if (recentText.length > MAX_TOPIC_WINDOW_CHARS) {
        recentText = recentText.slice(-MAX_TOPIC_WINDOW_CHARS);
      }

      if (!this.previousTopicTranscript) {
        this.previousTopicTranscript = recentText.slice(-MAX_TOPIC_WINDOW_CHARS);
        this.lastTopicCheckTimestamp = recentSegments[recentSegments.length - 1].timestamp;
        return;
      }

      const sessionContext = buildSessionContext(session.title, session.description, session.context, session.briefing);

      const result = await detectTopicShift(
        this.sessionId,
        sessionContext,
        recentText,
        this.previousTopicTranscript
      );

      this.lastTopicCheckTimestamp = recentSegments[recentSegments.length - 1].timestamp;

      if (result?.topicShiftDetected && result.confidence > 0.7) {
        this.callbacks.onTopicShift({
          topic: result.newTopic,
          timestamp: this.lastTopicCheckTimestamp,
        });

        // In auto/topic_shift mode, trigger a summary on topic shift
        // The cooldown mechanism will queue it if too soon after last summary
        if (this.summaryMode !== 'interval') {
          await this.processNewTranscript('topic_shift', result.newTopic);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        console.warn('[ai-processor] Skipped topic shift check due to rate limit');
      } else {
        console.error('Topic shift detection error:', error);
      }
    }
  }

  private async maybeClusterQuestions(): Promise<void> {
    const session = sessionStore.getSession(this.sessionId);
    if (!session) return;

    const questions = sessionStore.getAudienceQuestions(this.sessionId);
    const pendingQuestions = questions.filter((q) => q.status === 'pending');

    if (pendingQuestions.length >= session.settings.questionClusterThreshold) {
      const clusters = await clusterAudienceQuestions(this.sessionId, pendingQuestions);
      sessionStore.updateQuestionClusters(this.sessionId, clusters);
      this.callbacks.onClusters(clusters);
    }
  }

  async forceProcess(): Promise<void> {
    // Force bypasses cooldown
    this.lastSummaryTime = 0;
    await this.processNewTranscript();
  }
}
