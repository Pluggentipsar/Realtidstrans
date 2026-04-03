import { sessionStore } from './session-store';
import {
  EngagementSnapshot,
  ReactionBurst,
  ReactionType,
  SpeakerAnalytics,
} from '@/types';

interface EngagementCallbacks {
  onUpdate: (snapshot: EngagementSnapshot) => void;
  onReactionBurst: (burst: ReactionBurst) => void;
  onSpeakerAnalytics: (analytics: SpeakerAnalytics[]) => void;
}

export class EngagementTracker {
  private sessionId: string;
  private callbacks: EngagementCallbacks;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private reactionFlushInterval: NodeJS.Timeout | null = null;
  private sessionStartTime: number = 0;

  constructor(sessionId: string, callbacks: EngagementCallbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  start(): void {
    this.sessionStartTime = Date.now();

    // Take engagement snapshots every 10 seconds
    this.snapshotInterval = setInterval(() => {
      this.captureSnapshot();
    }, 10000);

    // Flush reaction buffers every 2 seconds
    this.reactionFlushInterval = setInterval(() => {
      this.flushReactions();
    }, 2000);
  }

  stop(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    if (this.reactionFlushInterval) {
      clearInterval(this.reactionFlushInterval);
      this.reactionFlushInterval = null;
    }
  }

  private captureSnapshot(): void {
    const reactionRate = sessionStore.getRecentReactionRate(this.sessionId, 60000);
    const activeUsers = sessionStore.getActiveUserCount(this.sessionId);

    // Calculate question rate (last minute)
    const questions = sessionStore.getAudienceQuestions(this.sessionId);
    const oneMinuteAgo = Date.now() - 60000;
    const recentQuestions = questions.filter(
      (q) => q.submittedAt.getTime() > oneMinuteAgo
    );
    const questionRate = recentQuestions.length;

    // Find dominant reaction in last minute
    const reactionCounts = this.getRecentReactionsByType(60000);
    let dominantReaction: ReactionType | undefined;
    let maxCount = 0;
    for (const [type, count] of Object.entries(reactionCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantReaction = type as ReactionType;
      }
    }

    // Calculate temperature (composite score 0-100)
    const temperature = this.calculateTemperature(
      reactionRate,
      questionRate,
      activeUsers
    );

    const snapshot: EngagementSnapshot = {
      timestamp: Date.now() - this.sessionStartTime,
      reactionRate,
      questionRate,
      activeUsers,
      temperature,
      dominantReaction: maxCount > 0 ? dominantReaction : undefined,
    };

    sessionStore.addEngagementSnapshot(this.sessionId, snapshot);
    this.callbacks.onUpdate(snapshot);

    // Emit speaker analytics every snapshot
    const speakerAnalytics = sessionStore.getSpeakerAnalytics(this.sessionId);
    if (speakerAnalytics.length > 0) {
      this.callbacks.onSpeakerAnalytics(speakerAnalytics);
    }
  }

  private flushReactions(): void {
    const bursts = sessionStore.flushReactionBuffer(this.sessionId);
    for (const burst of bursts) {
      this.callbacks.onReactionBurst(burst);
    }
  }

  private calculateTemperature(
    reactionRate: number,
    questionRate: number,
    activeUsers: number
  ): number {
    // Weighted composite score
    // - Reaction rate contributes most (40%)
    // - Question rate (30%)
    // - Active user ratio (30%)

    const normalizedReactionRate = Math.min(reactionRate / 30, 1); // 30 reactions/min = max
    const normalizedQuestionRate = Math.min(questionRate / 10, 1); // 10 questions/min = max
    const normalizedActiveUsers = Math.min(activeUsers / 50, 1); // 50 users = max

    const score =
      normalizedReactionRate * 40 +
      normalizedQuestionRate * 30 +
      normalizedActiveUsers * 30;

    return Math.round(Math.min(100, Math.max(0, score)));
  }

  private getRecentReactionsByType(_windowMs: number): Record<string, number> {
    const reactions = sessionStore.getReactionCounts(this.sessionId);
    // Simplified: return all-time counts (for precise windowed counts, store timestamps)
    return reactions;
  }
}
