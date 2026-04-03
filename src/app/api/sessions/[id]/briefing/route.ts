import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessionStore.getSession(id);
  if (!session) return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 });
  return NextResponse.json(session.briefing);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const session = sessionStore.updateBriefing(id, body);
  if (!session) return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 });
  return NextResponse.json(session.briefing);
}
