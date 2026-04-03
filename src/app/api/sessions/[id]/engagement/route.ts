import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessionStore.getSession(id);
  if (!session) {
    return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 });
  }

  const engagement = sessionStore.getSessionEngagement(id);
  const speakerAnalytics = sessionStore.getSpeakerAnalytics(id);

  return NextResponse.json({
    engagement,
    speakerAnalytics,
  });
}
