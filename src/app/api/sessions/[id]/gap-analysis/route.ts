import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';
import { analyzeGaps } from '@/lib/claude-ai';
import { buildSessionContext } from '@/lib/prompts/system';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessionStore.getSession(id);
  if (!session) {
    return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 });
  }

  const fullTranscript = sessionStore.getFullFinalTranscript(id);
  if (!fullTranscript) {
    return NextResponse.json({ error: 'Ingen transkribering tillgänglig' }, { status: 400 });
  }

  const sessionContext = buildSessionContext(session.title, session.description, session.context, session.briefing);
  const analysis = await analyzeGaps(id, sessionContext, fullTranscript);
  sessionStore.addSummary(analysis);

  return NextResponse.json(analysis);
}
