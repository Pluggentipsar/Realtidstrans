import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, context, hostName, briefing, settings } = body;

    if (!title || !hostName) {
      return NextResponse.json(
        { error: 'Titel och värdnamn krävs' },
        { status: 400 }
      );
    }

    const session = sessionStore.createSession({
      title,
      description: description || '',
      context: context || '',
      hostName,
      briefing: briefing || undefined,
    });

    // Apply custom settings if provided
    if (settings) {
      sessionStore.updateSessionSettings(session.id, settings);
    }

    return NextResponse.json(sessionStore.getSession(session.id), { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Kunde inte skapa session' },
      { status: 500 }
    );
  }
}
