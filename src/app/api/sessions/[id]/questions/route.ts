import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const aiQuestions = sessionStore.getAIQuestions(id);
  const audienceQuestions = sessionStore.getAudienceQuestions(id);
  const clusters = sessionStore.getQuestionClusters(id);

  return NextResponse.json({
    aiQuestions,
    audienceQuestions,
    clusters,
  });
}
