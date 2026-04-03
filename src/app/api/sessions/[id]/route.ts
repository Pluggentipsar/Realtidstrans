import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessionStore.getSession(id);
  if (!session) return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 });
  return NextResponse.json(session);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const session = sessionStore.getSession(id);
  if (!session) return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 });

  if (body.status) {
    sessionStore.updateSessionStatus(id, body.status);
  }

  if (body.addSpeaker) {
    sessionStore.addSpeaker(id, body.addSpeaker);
  }

  if (body.preparedQuestionUpdate) {
    const { questionId, status } = body.preparedQuestionUpdate;
    sessionStore.updatePreparedQuestionStatus(id, questionId, status);
  }

  return NextResponse.json(sessionStore.getSession(id));
}
