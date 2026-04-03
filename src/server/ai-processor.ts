import { sessionStore } from './session-store';
import {
  generateSummary,
  generateQuestions,
  clusterAudienceQuestions,
} from '@/lib/claude-ai';
import { AISummary, AIQuestion, QuestionCluster } from '@/types';

interface AIProcessorCallbacks {
  onSummary: (summary: AISummary) => void;
  onQuestions: (questions: AIQuestion[]) => void;
  onClusters: (clusters: QuestionCluster[]) => void;
}

export class AIProcessor {
  private sessionId: string;
  private callbacks: AIProcessorCallbacks;
  private summaryInterval: NodeJS.Timeout | null = null;
  private lastProcessedTimestamp: number = 0;
  private isProcessing: boolean = false;

  constructor(sessionId: string, callbacks: AIProcessorCallbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  start(intervalMs: number = 60000): void {
    this.lastProcessedTimestamp = 0;

    this.summaryInterval = setInterval(() => {
      this.processNewTranscript();
    }, intervalMs);
  }

  stop(): void {
    if (this.summaryInterval) {
      clearInterval(this.summaryInterval);
      this.summaryInterval = null;
    }
  }

  async processNewTranscript(): Promise<void> {
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

      // Generate summary and questions in parallel
      const [summary, questions] = await Promise.all([
        generateSummary(
          this.sessionId,
          sessionContext,
          transcriptText,
          startTime,
          endTime
        ),
        session.settings.aiInsightsEnabled
          ? generateQuestions(this.sessionId, sessionContext, transcriptText)
          : Promise.resolve([]),
      ]);

      // Store and emit
      sessionStore.addSummary(summary);
      this.callbacks.onSummary(summary);

      if (questions.length > 0) {
        sessionStore.addAIQuestions(questions);
        this.callbacks.onQuestions(questions);
      }

      this.lastProcessedTimestamp = endTime;

      // Check if we should cluster audience questions
      await this.maybeClusterQuestions();
    } catch (error) {
      console.error('AI processing error:', error);
    } finally {
      this.isProcessing = false;
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

  // Force an immediate processing cycle (e.g., on topic shift detection)
  async forceProcess(): Promise<void> {
    await this.processNewTranscript();
  }
}
