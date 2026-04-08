import Anthropic from '@anthropic-ai/sdk';
import {
  AIQuestion,
  AISummary,
  QuestionCategory,
  QuestionCluster,
  AudienceQuestion,
  QuotableMoment,
} from '@/types';
import type { QuestionFocusType } from '@/lib/prompts/system';
import {
  getSummaryPrompt,
  getQuestionsPrompt,
  getAudienceClusterPrompt,
  getFinalSummaryPrompt,
  getTopicShiftPrompt,
  getQuoteExtractionPrompt,
  getGapAnalysisPrompt,
} from '@/lib/prompts/system';
import { generateId } from '@/lib/utils';
import {
  estimateTokens,
  truncateToTokenBudget,
  chunkText,
  TOKEN_BUDGETS,
  RateLimiter,
  CostTracker,
} from '@/lib/token-manager';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.AZURE_CLAUDE_API_KEY!,
      baseURL: process.env.AZURE_CLAUDE_ENDPOINT
        ? `${process.env.AZURE_CLAUDE_ENDPOINT}/anthropic`
        : undefined,
    });
  }
  return client;
}

// Dual-model strategy:
// FAST (Haiku) — cheap, fast, for frequent lightweight tasks (topic shift, quote extraction)
// DEEP (Sonnet) — powerful, for complex analysis (summaries, questions, gap analysis, final summaries)
function getModelDeep(): string {
  return process.env.AZURE_CLAUDE_DEPLOYMENT_DEEP || process.env.AZURE_CLAUDE_DEPLOYMENT || 'claude-sonnet-4-5';
}
function getModelFast(): string {
  return process.env.AZURE_CLAUDE_DEPLOYMENT_FAST || 'claude-haiku-4-5';
}

type ModelTier = 'fast' | 'deep';

// Which model to use for each function
const MODEL_ROUTING: Record<string, ModelTier> = {
  summary: 'deep',
  questions: 'deep',
  quoteExtraction: 'fast',       // Frequent, pattern-matching task
  topicShift: 'fast',            // Every 30s, simple JSON response
  gapAnalysis: 'deep',           // Complex analysis
  gapAnalysis_chunk: 'fast',     // Pre-summarization chunks
  finalSummary: 'deep',          // Most important output
  finalSummary_chunk: 'fast',    // Pre-summarization chunks
  audienceClustering: 'fast',    // Grouping task
};

function getModelForFunction(functionName: string): string {
  const tier = MODEL_ROUTING[functionName] || 'deep';
  return tier === 'fast' ? getModelFast() : getModelDeep();
}

// Global rate limiter (shared across all sessions)
const rateLimiter = new RateLimiter(
  parseInt(process.env.CLAUDE_MAX_REQUESTS_PER_MINUTE || '30'),
  parseInt(process.env.CLAUDE_MAX_REQUESTS_PER_HOUR || '500')
);

// Per-session cost trackers
const costTrackers = new Map<string, CostTracker>();

function getCostTracker(sessionId: string): CostTracker {
  if (!costTrackers.has(sessionId)) {
    costTrackers.set(sessionId, new CostTracker(sessionId));
  }
  return costTrackers.get(sessionId)!;
}

export function getSessionCostSummary(sessionId: string) {
  return getCostTracker(sessionId).getSummary();
}

export function getRateLimiterStatus() {
  return rateLimiter.getUsage();
}

/**
 * Wrapper that enforces rate limiting and tracks costs.
 */
async function callClaude(
  sessionId: string,
  functionName: string,
  systemPrompt: string,
  userMessage: string,
  maxOutputTokens: number
): Promise<string> {
  if (!rateLimiter.canMakeRequest()) {
    console.warn(`[token-manager] Rate limited — skipping ${functionName} for session ${sessionId}`);
    throw new Error('RATE_LIMITED');
  }

  const model = getModelForFunction(functionName);
  const tier = MODEL_ROUTING[functionName] || 'deep';
  const inputTokens = estimateTokens(systemPrompt + userMessage);
  console.log(`[token-manager] ${functionName} [${tier}/${model}]: ~${inputTokens} input tokens, max ${maxOutputTokens} output`);

  rateLimiter.recordRequest();

  const anthropic = getClient();
  let response;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: maxOutputTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (apiError) {
    const msg = apiError instanceof Error ? apiError.message : String(apiError);
    console.error(`[claude-ai] API call failed for ${functionName}: ${msg}`);
    throw apiError;
  }

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '';

  // Track actual usage from response
  const actualInput = response.usage?.input_tokens || inputTokens;
  const actualOutput = response.usage?.output_tokens || estimateTokens(text);
  getCostTracker(sessionId).record(functionName, actualInput, actualOutput);

  return text;
}

// ===== Summary =====

export async function generateSummary(
  sessionId: string,
  sessionContext: string,
  transcriptText: string,
  startTime: number,
  endTime: number,
  type: 'interval' | 'topic_shift' = 'interval',
  topicLabel?: string,
  previousSummary?: string
): Promise<AISummary> {
  const budget = TOKEN_BUDGETS.intervalSummary;
  const truncated = truncateToTokenBudget(transcriptText, budget.maxInputTokens, 'keep_end');

  const userMessage = type === 'topic_shift'
    ? `Nytt ämne detekterat: "${topicLabel}". Sammanfatta det föregående avsnittet:\n\n${truncated}`
    : `Sammanfatta följande avsnitt av samtalet:\n\n${truncated}`;

  const text = await callClaude(
    sessionId, 'summary', getSummaryPrompt(sessionContext, previousSummary),
    userMessage, budget.maxOutputTokens
  );

  return {
    id: generateId(), sessionId, content: text, type,
    coveringFrom: startTime, coveringTo: endTime, topicLabel, createdAt: new Date(),
  };
}

// ===== Questions =====

export async function generateQuestions(
  sessionId: string,
  sessionContext: string,
  transcriptText: string,
  focus: QuestionFocusType = 'balanced',
  count: number = 3,
  speakerTimes?: Array<{ name: string; percentage: number; wordCount: number }>,
  targetInfo?: { target: 'anyone' | 'least_active' | 'most_active' | 'specific'; specificSpeaker?: string }
): Promise<AIQuestion[]> {
  const budget = TOKEN_BUDGETS.questions;
  const truncated = truncateToTokenBudget(transcriptText, budget.maxInputTokens, 'keep_end');

  const text = await callClaude(
    sessionId, 'questions',
    getQuestionsPrompt(sessionContext, focus, count, speakerTimes, targetInfo),
    `Baserat på följande del av samtalet, generera fördjupande frågor:\n\n${truncated}`,
    budget.maxOutputTokens
  );

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      question: string; category: QuestionCategory; context: string;
      relevanceScore: number; targetSpeaker?: string;
    }>;
    return parsed.map((q) => ({
      id: generateId(), sessionId, question: q.question, category: q.category,
      relevanceScore: q.relevanceScore, context: q.context,
      targetSpeaker: q.targetSpeaker || undefined,
      status: 'new' as const,
      createdAt: new Date(),
    }));
  } catch {
    console.error('Failed to parse AI questions response');
    return [];
  }
}

// ===== Topic Shift Detection =====

export async function detectTopicShift(
  sessionId: string,
  sessionContext: string,
  recentTranscript: string,
  previousTranscript: string
): Promise<{
  topicShiftDetected: boolean;
  previousTopic: string;
  newTopic: string;
  confidence: number;
  transitionType: 'gradual' | 'abrupt' | 'return_to_previous';
} | null> {
  const budget = TOKEN_BUDGETS.topicShift;
  const halfBudget = Math.floor(budget.maxInputTokens / 2);

  const truncPrev = truncateToTokenBudget(previousTranscript, halfBudget, 'keep_end');
  const truncRecent = truncateToTokenBudget(recentTranscript, halfBudget, 'keep_end');

  try {
    const text = await callClaude(
      sessionId, 'topicShift', getTopicShiftPrompt(sessionContext),
      `FÖREGÅENDE AVSNITT:\n${truncPrev}\n\nSENASTE AVSNITT:\n${truncRecent}`,
      budget.maxOutputTokens
    );
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    if (e instanceof Error && e.message === 'RATE_LIMITED') return null;
    throw e;
  }
}

// ===== Quote Extraction =====

export async function extractQuotes(
  sessionId: string,
  sessionContext: string,
  transcriptText: string,
  baseTimestamp: number
): Promise<QuotableMoment[]> {
  const budget = TOKEN_BUDGETS.quoteExtraction;
  const truncated = truncateToTokenBudget(transcriptText, budget.maxInputTokens, 'keep_end');

  try {
    const text = await callClaude(
      sessionId, 'quoteExtraction', getQuoteExtractionPrompt(sessionContext),
      `Identifiera starka citat ur följande avsnitt:\n\n${truncated}`,
      budget.maxOutputTokens
    );
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      speakerName: string; quote: string; context: string;
      category: QuotableMoment['category']; impactScore: number;
    }>;
    return parsed.map((q) => ({
      id: generateId(), sessionId, speakerId: '', speakerName: q.speakerName,
      quote: q.quote, context: q.context, timestamp: baseTimestamp,
      impactScore: q.impactScore, category: q.category,
    }));
  } catch (e) {
    if (e instanceof Error && e.message === 'RATE_LIMITED') return [];
    console.error('Failed to parse quote extraction response');
    return [];
  }
}

// ===== Gap Analysis =====

export async function analyzeGaps(
  sessionId: string,
  sessionContext: string,
  fullTranscript: string
): Promise<AISummary> {
  const budget = TOKEN_BUDGETS.gapAnalysis;
  const estimatedTokens = estimateTokens(fullTranscript);

  let textToAnalyze: string;

  if (estimatedTokens <= budget.maxInputTokens) {
    textToAnalyze = fullTranscript;
  } else {
    // Transcript too long — use chunked summarization approach:
    // 1. Split into chunks
    // 2. Summarize each chunk
    // 3. Run gap analysis on the combined summaries
    console.log(`[token-manager] Gap analysis: transcript ${estimatedTokens} tokens, chunking...`);
    const chunks = chunkText(fullTranscript, 30_000);
    const chunkSummaries: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (!rateLimiter.canMakeRequest()) {
        console.warn('[token-manager] Rate limited during chunked gap analysis');
        break;
      }
      const summary = await callClaude(
        sessionId, 'gapAnalysis_chunk',
        'Sammanfatta följande avsnitt av ett samtal. Behåll alla viktiga detaljer, argument, och vem som sa vad.',
        `Avsnitt ${i + 1}/${chunks.length}:\n\n${chunks[i]}`,
        1024
      );
      chunkSummaries.push(`--- Avsnitt ${i + 1} ---\n${summary}`);
    }

    textToAnalyze = chunkSummaries.join('\n\n');
  }

  const finalText = truncateToTokenBudget(textToAnalyze, budget.maxInputTokens, 'keep_both');

  const text = await callClaude(
    sessionId, 'gapAnalysis', getGapAnalysisPrompt(sessionContext),
    `Analysera hela detta samtal och identifiera luckor, blinda fläckar och missade möjligheter:\n\n${finalText}`,
    budget.maxOutputTokens
  );

  return {
    id: generateId(), sessionId, content: text, type: 'gap_analysis',
    coveringFrom: 0, coveringTo: Date.now(), createdAt: new Date(),
  };
}

// ===== Audience Question Clustering =====

export async function clusterAudienceQuestions(
  sessionId: string,
  questions: AudienceQuestion[]
): Promise<QuestionCluster[]> {
  const budget = TOKEN_BUDGETS.audienceClustering;

  const questionsText = questions
    .map((q) => `[${q.id}] ${q.text} (röster: ${q.votes})`)
    .join('\n');

  const truncated = truncateToTokenBudget(questionsText, budget.maxInputTokens, 'keep_end');

  try {
    const text = await callClaude(
      sessionId, 'audienceClustering', getAudienceClusterPrompt(),
      `Gruppera och rangordna dessa publikfrågor:\n\n${truncated}`,
      budget.maxOutputTokens
    );
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      theme: string; summary: string; questionIds: string[]; priority: number;
    }>;
    return parsed.map((c) => ({
      id: generateId(), sessionId, theme: c.theme,
      summary: c.summary, questionIds: c.questionIds, priority: c.priority,
    }));
  } catch (e) {
    if (e instanceof Error && e.message === 'RATE_LIMITED') return [];
    console.error('Failed to parse cluster response');
    return [];
  }
}

// ===== Final Summary (chunked for long sessions) =====

export async function generateFinalSummary(
  sessionId: string,
  sessionContext: string,
  fullTranscript: string,
  type: 'chronological' | 'thematic'
): Promise<AISummary> {
  const budget = TOKEN_BUDGETS.finalSummary;
  const estimatedTokens = estimateTokens(fullTranscript);

  let textToSummarize: string;

  if (estimatedTokens <= budget.maxInputTokens) {
    textToSummarize = fullTranscript;
  } else {
    // Long session: chunk and pre-summarize
    console.log(`[token-manager] Final summary: transcript ${estimatedTokens} tokens, chunking...`);
    const chunks = chunkText(fullTranscript, 30_000);
    const chunkSummaries: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (!rateLimiter.canMakeRequest()) {
        console.warn('[token-manager] Rate limited during chunked final summary');
        break;
      }
      const summary = await callClaude(
        sessionId, 'finalSummary_chunk',
        'Sammanfatta följande avsnitt av ett samtal noggrant. Behåll alla viktiga poänger, argument, citat och vem som sa vad.',
        `Avsnitt ${i + 1}/${chunks.length}:\n\n${chunks[i]}`,
        1024
      );
      chunkSummaries.push(`--- Del ${i + 1} ---\n${summary}`);
    }

    textToSummarize = chunkSummaries.join('\n\n');
  }

  const finalText = truncateToTokenBudget(textToSummarize, budget.maxInputTokens, 'keep_both');

  const text = await callClaude(
    sessionId, 'finalSummary', getFinalSummaryPrompt(sessionContext, type),
    `Här är ${estimatedTokens > budget.maxInputTokens ? 'sammanfattade avsnitt av' : 'hela transkriberingen av'} sessionen:\n\n${finalText}`,
    budget.maxOutputTokens
  );

  return {
    id: generateId(), sessionId, content: text,
    type: type === 'chronological' ? 'final_chronological' : 'final_thematic',
    coveringFrom: 0, coveringTo: Date.now(), createdAt: new Date(),
  };
}
