import { sessionStore } from './session-store';
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

interface AIProcessorCallbacks {
  onSummary: (summary: AISummary) => void;
  onQuestions: (questions: AIQuestion[]) => void;
  onClusters: (clusters: QuestionCluster[]) => void;
  onQuotes: (quotes: QuotableMoment[]) => void;
  onTopicShift: (data: { topic: string; timestamp: number }) => void;
}

export class AIProcessor {
  private sessionId: string;
  private callbacks: AIProcessorCallbacks;
  private summaryInterval: NodeJS.Timeout | null = null;
  private topicCheckInterval: NodeJS.Timeout | null = null;
  private lastProcessedTimestamp: number = 0;
  private lastTopicCheckTimestamp: number = 0;
  private isProcessing: boolean = false;
  private previousTopicTranscript: string = '';
  private summaryMode: SummaryMode = 'auto';

  constructor(sessionId: string, callbacks: AIProcessorCallbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  start(intervalMs: number = 60000, mode: SummaryMode = 'auto'): void {
    this.lastProcessedTimestamp = 0;
    this.lastTopicCheckTimestamp = 0;
    this.summaryMode = mode;

    // Always run interval-based processing as a floor
    if (mode === 'interval' || mode === 'auto') {
      this.summaryInterval = setInterval(() => {
        this.processNewTranscript('interval');
      }, intervalMs);
    }

    // Topic shift detection runs more frequently (every 20s)
    if (mode === 'topic_shift' || mode === 'auto') {
      this.topicCheckInterval = setInterval(() => {
        this.checkTopicShift();
      }, 20000);
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
    // Restart with new mode
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
    this.isProcessing = true;

    try {
      const session = sessionStore.getSession(this.sessionId);
      if (!session || session.status !== 'live') return;

      const newSegments = sessionStore.getFinalTranscriptSince(
        this.sessionId,
        this.lastProcessedTimestamp
      );

      if (newSegments.length === 0) return;

      const transcriptText = newSegments
        .map((s) => `${s.speakerName}: ${s.text}`)
        .join('\n');

      const startTime = newSegments[0].timestamp;
      const endTime = newSegments[newSegments.length - 1].timestamp;

      const sessionContext = `Titel: ${session.title}\nBeskrivning: ${session.description}\nKontext: ${session.context}`;

      // Run summary, questions, and quote extraction in parallel
      const promises: [
        Promise<AISummary>,
        Promise<AIQuestion[]>,
        Promise<QuotableMoment[]>,
      ] = [
        generateSummary(
          this.sessionId,
          sessionContext,
          transcriptText,
          startTime,
          endTime,
          triggerType,
          topicLabel
        ),
        session.settings.aiInsightsEnabled
          ? generateQuestions(this.sessionId, sessionContext, transcriptText)
          : Promise.resolve([]),
        session.settings.enableQuoteExtraction
          ? extractQuotes(this.sessionId, sessionContext, transcriptText, startTime)
          : Promise.resolve([]),
      ];

      const [summary, questions, quotes] = await Promise.all(promises);

      // Store and emit summary
      sessionStore.addSummary(summary);
      this.callbacks.onSummary(summary);

      // Store and emit questions
      if (questions.length > 0) {
        sessionStore.addAIQuestions(questions);
        this.callbacks.onQuestions(questions);
      }

      // Store and emit quotes
      if (quotes.length > 0) {
        sessionStore.addQuotableMoments(quotes);
        this.callbacks.onQuotes(quotes);
      }

      this.previousTopicTranscript = transcriptText;
      this.lastProcessedTimestamp = endTime;

      // Check if we should cluster audience questions
      await this.maybeClusterQuestions();
    } catch (error) {
      console.error('AI processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async checkTopicShift(): Promise<void> {
    if (this.isProcessing) return;

    try {
      const session = sessionStore.getSession(this.sessionId);
      if (!session || session.status !== 'live') return;

      // Get transcript from last topic check to now
      const recentSegments = sessionStore.getFinalTranscriptSince(
        this.sessionId,
        this.lastTopicCheckTimestamp
      );

      if (recentSegments.length < 3) return; // Need enough text to detect shift

      const recentText = recentSegments
        .map((s) => `${s.speakerName}: ${s.text}`)
        .join('\n');

      if (!this.previousTopicTranscript) {
        this.previousTopicTranscript = recentText;
        this.lastTopicCheckTimestamp = recentSegments[recentSegments.length - 1].timestamp;
        return;
      }

      const sessionContext = `Titel: ${session.title}\nBeskrivning: ${session.description}\nKontext: ${session.context}`;

      const result = await detectTopicShift(
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
        if (this.summaryMode !== 'interval') {
          await this.processNewTranscript('topic_shift', result.newTopic);
        }
      }
    } catch (error) {
      console.error('Topic shift detection error:', error);
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
    await this.processNewTranscript();
  }
}
