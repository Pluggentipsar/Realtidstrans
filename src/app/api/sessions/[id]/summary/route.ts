import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';
import { generateFinalSummary } from '@/lib/claude-ai';
import { buildSessionContext } from '@/lib/prompts/system';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { type } = body;

  const session = sessionStore.getSession(id);
  if (!session) {
    return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 });
  }

  const fullTranscript = sessionStore.getFullFinalTranscript(id);
  if (!fullTranscript) {
    return NextResponse.json({ error: 'Ingen transkribering tillgänglig' }, { status: 400 });
  }

  const sessionContext = buildSessionContext(session.title, session.description, session.context, session.briefing);
  const summary = await generateFinalSummary(id, sessionContext, fullTranscript, type || 'chronological');
  sessionStore.addSummary(summary);
  return NextResponse.json(summary);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(sessionStore.getSummaries(id));
}
