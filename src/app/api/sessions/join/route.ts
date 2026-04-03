import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Sessionskod krävs' },
        { status: 400 }
      );
    }

    const session = sessionStore.getSessionByCode(code);
    if (!session) {
      return NextResponse.json(
        { error: 'Ingen session med den koden' },
        { status: 404 }
      );
    }

    if (session.status === 'ended') {
      return NextResponse.json(
        { error: 'Sessionen har avslutats' },
        { status: 410 }
      );
    }

    return NextResponse.json({
      sessionId: session.id,
      title: session.title,
      status: session.status,
    });
  } catch {
    return NextResponse.json(
      { error: 'Kunde inte gå med i session' },
      { status: 500 }
    );
  }
}
