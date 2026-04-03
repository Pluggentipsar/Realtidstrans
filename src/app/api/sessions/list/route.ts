import { NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';

export async function GET() {
  const sessions = sessionStore.getAllSessions();
  // Return a lightweight list
  return NextResponse.json(
    sessions.map((s) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      hostName: s.hostName,
      status: s.status,
      format: s.briefing?.format || 'other',
      speakerCount: s.speakers.length,
      createdAt: s.createdAt,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    }))
  );
}
