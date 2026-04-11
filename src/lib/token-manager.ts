// Token estimation and management utilities
// Claude Sonnet via Azure: ~200K context window
// Rule of thumb: 1 token ≈ 4 characters for English, ~3.5 for Swedish (more diacritics/longer words)

const CHARS_PER_TOKEN_ESTIMATE = 3.5; // Conservative for Swedish text

// Claude Sonnet limits
export const MODEL_LIMITS = {
  maxContextTokens: 200_000,
  // Reserve tokens for system prompt + response
  systemPromptReserve: 2_000,
  maxOutputTokens: 4_096,
  // Safe input budget = context - system - output
  safeInputTokens: 190_000,
};

// Per-function token budgets
export const TOKEN_BUDGETS = {
  // Interval summary: ~1 minute of conversation ≈ 150-300 words ≈ 200-400 tokens
  intervalSummary: {
    maxInputTokens: 8_000,    // ~28K chars of transcript
    maxOutputTokens: 1_024,
  },
  // Questions: same transcript as summary
  questions: {
    maxInputTokens: 8_000,
    maxOutputTokens: 1_024,
  },
  // Quote extraction: same window
  quoteExtraction: {
    maxInputTokens: 8_000,
    maxOutputTokens: 1_024,
  },
  // Topic shift detection: needs previous + current, keep small
  topicShift: {
    maxInputTokens: 4_000,    // ~14K chars total (prev + current)
    maxOutputTokens: 512,
  },
  // Final summary: large but chunked if needed
  finalSummary: {
    maxInputTokens: 100_000,  // ~350K chars
    maxOutputTokens: 4_096,
  },
  // Gap analysis: same as final
  gapAnalysis: {
    maxInputTokens: 100_000,
    maxOutputTokens: 2_048,
  },
  // Audience question clustering: typically small
  audienceClustering: {
    maxInputTokens: 10_000,
    maxOutputTokens: 1_024,
  },
  // Suggest next question from prepared list
  suggestQuestion: {
    maxInputTokens: 4_000,
    maxOutputTokens: 256,
  },
  // AI Participant: needs summaries + recent transcript for rich context
  aiParticipant: {
    maxInputTokens: 16_000,   // ~5 summaries (~2K) + ~5min transcript (~6K) + session context
    maxOutputTokens: 512,
  },
};

/**
 * Estimate token count from text.
 * Conservative estimate — better to overcount than undercount.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

/**
 * Truncate text to fit within a token budget.
 * Prefers truncating from the beginning (keeps most recent content).
 */
export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
  strategy: 'keep_end' | 'keep_start' | 'keep_both' = 'keep_end'
): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN_ESTIMATE);

  if (strategy === 'keep_end') {
    return '...[transkription trunkerad]...\n' + text.slice(-maxChars);
  } else if (strategy === 'keep_start') {
    return text.slice(0, maxChars) + '\n...[transkription trunkerad]...';
  } else {
    // keep_both: keep first 20% and last 80%
    const startChars = Math.floor(maxChars * 0.2);
    const endChars = maxChars - startChars;
    return (
      text.slice(0, startChars) +
      '\n\n...[transkription trunkerad — mellanliggande innehåll borttaget]...\n\n' +
      text.slice(-endChars)
    );
  }
}

/**
 * Split long text into chunks that fit within a token budget.
 * Splits on paragraph/line boundaries to avoid cutting mid-sentence.
 */
export function chunkText(text: string, maxTokensPerChunk: number): string[] {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokensPerChunk) return [text];

  const maxCharsPerChunk = Math.floor(maxTokensPerChunk * CHARS_PER_TOKEN_ESTIMATE);
  const lines = text.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxCharsPerChunk) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      // If a single line exceeds chunk size, force-split it
      if (line.length > maxCharsPerChunk) {
        for (let i = 0; i < line.length; i += maxCharsPerChunk) {
          chunks.push(line.slice(i, i + maxCharsPerChunk));
        }
        continue;
      }
    }
    currentChunk += (currentChunk ? '\n' : '') + line;
  }
  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}

/**
 * Build a context-aware transcript window.
 * Returns: [condensed older context] + [full recent transcript]
 * This allows the AI to understand the broader conversation while
 * focusing on the most recent content.
 */
export function buildContextWindow(
  fullTranscript: string,
  recentTranscript: string,
  maxTotalTokens: number,
  previousSummaries: string[] = []
): string {
  const recentTokens = estimateTokens(recentTranscript);

  // If recent transcript alone fits, add context from summaries
  if (recentTokens <= maxTotalTokens * 0.8) {
    const contextBudget = maxTotalTokens - recentTokens;

    if (previousSummaries.length > 0) {
      const summaryText = previousSummaries.join('\n\n');
      const truncatedSummary = truncateToTokenBudget(summaryText, contextBudget, 'keep_end');
      return `TIDIGARE SAMMANFATTNINGAR:\n${truncatedSummary}\n\nSENASTE AVSNITTET:\n${recentTranscript}`;
    }

    // Fall back to truncated full transcript as context
    const olderContext = truncateToTokenBudget(fullTranscript, contextBudget, 'keep_end');
    return `SAMTALSKONTEXT:\n${olderContext}\n\nSENASTE AVSNITTET:\n${recentTranscript}`;
  }

  // Recent transcript is too long on its own — truncate it
  return truncateToTokenBudget(recentTranscript, maxTotalTokens, 'keep_end');
}

// --- Rate Limiting ---

export class RateLimiter {
  private requests: number[] = []; // timestamps of requests
  private maxRequestsPerMinute: number;
  private maxRequestsPerHour: number;

  constructor(perMinute: number = 30, perHour: number = 500) {
    this.maxRequestsPerMinute = perMinute;
    this.maxRequestsPerHour = perHour;
  }

  canMakeRequest(): boolean {
    this.cleanup();
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;

    const recentMinute = this.requests.filter((t) => t > oneMinuteAgo).length;
    const recentHour = this.requests.filter((t) => t > oneHourAgo).length;

    return recentMinute < this.maxRequestsPerMinute && recentHour < this.maxRequestsPerHour;
  }

  recordRequest(): void {
    this.requests.push(Date.now());
  }

  getUsage(): { lastMinute: number; lastHour: number } {
    this.cleanup();
    const now = Date.now();
    return {
      lastMinute: this.requests.filter((t) => t > now - 60_000).length,
      lastHour: this.requests.filter((t) => t > now - 3_600_000).length,
    };
  }

  private cleanup(): void {
    const oneHourAgo = Date.now() - 3_600_000;
    this.requests = this.requests.filter((t) => t > oneHourAgo);
  }
}

// --- Cost Tracking ---

// Approximate pricing for Claude Sonnet (adjust for Azure pricing)
const COST_PER_INPUT_TOKEN = 0.003 / 1000;  // $3 per 1M input tokens
const COST_PER_OUTPUT_TOKEN = 0.015 / 1000;  // $15 per 1M output tokens

export interface TokenUsageEntry {
  timestamp: Date;
  function: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export class CostTracker {
  private entries: TokenUsageEntry[] = [];
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  record(functionName: string, inputTokens: number, outputTokens: number): void {
    const cost = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;
    this.entries.push({
      timestamp: new Date(),
      function: functionName,
      inputTokens,
      outputTokens,
      estimatedCost: cost,
    });
  }

  getTotalCost(): number {
    return this.entries.reduce((sum, e) => sum + e.estimatedCost, 0);
  }

  getTotalTokens(): { input: number; output: number } {
    return {
      input: this.entries.reduce((sum, e) => sum + e.inputTokens, 0),
      output: this.entries.reduce((sum, e) => sum + e.outputTokens, 0),
    };
  }

  getEntries(): TokenUsageEntry[] {
    return [...this.entries];
  }

  getSummary(): {
    totalCost: number;
    totalInput: number;
    totalOutput: number;
    callCount: number;
    byFunction: Record<string, { calls: number; cost: number; inputTokens: number }>;
  } {
    const byFunction: Record<string, { calls: number; cost: number; inputTokens: number }> = {};
    for (const entry of this.entries) {
      if (!byFunction[entry.function]) {
        byFunction[entry.function] = { calls: 0, cost: 0, inputTokens: 0 };
      }
      byFunction[entry.function].calls++;
      byFunction[entry.function].cost += entry.estimatedCost;
      byFunction[entry.function].inputTokens += entry.inputTokens;
    }

    const totals = this.getTotalTokens();
    return {
      totalCost: this.getTotalCost(),
      totalInput: totals.input,
      totalOutput: totals.output,
      callCount: this.entries.length,
      byFunction,
    };
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
