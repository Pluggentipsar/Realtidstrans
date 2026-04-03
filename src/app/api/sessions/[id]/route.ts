import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessionStore.getSession(id);

  if (!session) {
    return NextResponse.json(
      { error: 'Session hittades inte' },
      { status: 404 }
    );
  }

  return NextResponse.json(session);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.status) {
    const session = sessionStore.updateSessionStatus(id, body.status);
    if (!session) {
      return NextResponse.json(
        { error: 'Session hittades inte' },
        { status: 404 }
      );
    }
    return NextResponse.json(session);
  }

  return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 });
}
