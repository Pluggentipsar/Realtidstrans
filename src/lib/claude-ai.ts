import Anthropic from '@anthropic-ai/sdk';
import {
  AIQuestion,
  AISummary,
  QuestionCategory,
  QuestionCluster,
  AudienceQuestion,
  QuotableMoment,
} from '@/types';
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

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.AZURE_CLAUDE_API_KEY!,
      baseURL: process.env.AZURE_CLAUDE_ENDPOINT
        ? `${process.env.AZURE_CLAUDE_ENDPOINT}/anthropic/v1`
        : undefined,
    });
  }
  return client;
}

const MODEL = process.env.AZURE_CLAUDE_DEPLOYMENT || 'claude-sonnet-4-20250514';

export async function generateSummary(
  sessionId: string,
  sessionContext: string,
  transcriptText: string,
  startTime: number,
  endTime: number,
  type: 'interval' | 'topic_shift' = 'interval',
  topicLabel?: string
): Promise<AISummary> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: getSummaryPrompt(sessionContext),
    messages: [
      {
        role: 'user',
        content: type === 'topic_shift'
          ? `Nytt ämne detekterat: "${topicLabel}". Sammanfatta det föregående avsnittet:\n\n${transcriptText}`
          : `Sammanfatta följande avsnitt av samtalet:\n\n${transcriptText}`,
      },
    ],
  });

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '';

  return {
    id: generateId(),
    sessionId,
    content: text,
    type,
    coveringFrom: startTime,
    coveringTo: endTime,
    topicLabel,
    createdAt: new Date(),
  };
}

export async function generateQuestions(
  sessionId: string,
  sessionContext: string,
  transcriptText: string
): Promise<AIQuestion[]> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: getQuestionsPrompt(sessionContext),
    messages: [
      {
        role: 'user',
        content: `Baserat på följande del av samtalet, generera fördjupande frågor:\n\n${transcriptText}`,
      },
    ],
  });

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '[]';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      question: string;
      category: QuestionCategory;
      context: string;
      relevanceScore: number;
    }>;

    return parsed.map((q) => ({
      id: generateId(),
      sessionId,
      question: q.question,
      category: q.category,
      relevanceScore: q.relevanceScore,
      context: q.context,
      createdAt: new Date(),
    }));
  } catch {
    console.error('Failed to parse AI questions response');
    return [];
  }
}

export async function detectTopicShift(
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
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: getTopicShiftPrompt(sessionContext),
    messages: [
      {
        role: 'user',
        content: `FÖREGÅENDE AVSNITT:\n${previousTranscript}\n\nSENASTE AVSNITT:\n${recentTranscript}`,
      },
    ],
  });

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

export async function extractQuotes(
  sessionId: string,
  sessionContext: string,
  transcriptText: string,
  baseTimestamp: number
): Promise<QuotableMoment[]> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: getQuoteExtractionPrompt(sessionContext),
    messages: [
      {
        role: 'user',
        content: `Identifiera starka citat ur följande avsnitt:\n\n${transcriptText}`,
      },
    ],
  });

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '[]';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      speakerName: string;
      quote: string;
      context: string;
      category: QuotableMoment['category'];
      impactScore: number;
    }>;

    return parsed.map((q) => ({
      id: generateId(),
      sessionId,
      speakerId: '', // Will be resolved by caller
      speakerName: q.speakerName,
      quote: q.quote,
      context: q.context,
      timestamp: baseTimestamp,
      impactScore: q.impactScore,
      category: q.category,
    }));
  } catch {
    console.error('Failed to parse quote extraction response');
    return [];
  }
}

export async function analyzeGaps(
  sessionId: string,
  sessionContext: string,
  fullTranscript: string
): Promise<AISummary> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: getGapAnalysisPrompt(sessionContext),
    messages: [
      {
        role: 'user',
        content: `Analysera hela detta samtal och identifiera luckor, blinda fläckar och missade möjligheter:\n\n${fullTranscript}`,
      },
    ],
  });

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '';

  return {
    id: generateId(),
    sessionId,
    content: text,
    type: 'gap_analysis',
    coveringFrom: 0,
    coveringTo: Date.now(),
    createdAt: new Date(),
  };
}

export async function clusterAudienceQuestions(
  sessionId: string,
  questions: AudienceQuestion[]
): Promise<QuestionCluster[]> {
  const anthropic = getClient();

  const questionsText = questions
    .map((q) => `[${q.id}] ${q.text} (röster: ${q.votes})`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: getAudienceClusterPrompt(),
    messages: [
      {
        role: 'user',
        content: `Gruppera och rangordna dessa publikfrågor:\n\n${questionsText}`,
      },
    ],
  });

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '[]';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      theme: string;
      summary: string;
      questionIds: string[];
      priority: number;
    }>;

    return parsed.map((c) => ({
      id: generateId(),
      sessionId,
      theme: c.theme,
      summary: c.summary,
      questionIds: c.questionIds,
      priority: c.priority,
    }));
  } catch {
    console.error('Failed to parse cluster response');
    return [];
  }
}

export async function generateFinalSummary(
  sessionId: string,
  sessionContext: string,
  fullTranscript: string,
  type: 'chronological' | 'thematic'
): Promise<AISummary> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: getFinalSummaryPrompt(sessionContext, type),
    messages: [
      {
        role: 'user',
        content: `Här är hela transkriberingen av sessionen:\n\n${fullTranscript}`,
      },
    ],
  });

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '';

  return {
    id: generateId(),
    sessionId,
    content: text,
    type: type === 'chronological' ? 'final_chronological' : 'final_thematic',
    coveringFrom: 0,
    coveringTo: Date.now(),
    createdAt: new Date(),
  };
}
