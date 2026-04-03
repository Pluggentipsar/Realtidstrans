import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/server/session-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const polls = sessionStore.getPolls(id);
  return NextResponse.json(polls);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { question, options } = body;

  if (!question || !options || options.length < 2) {
    return NextResponse.json(
      { error: 'Fråga och minst 2 svarsalternativ krävs' },
      { status: 400 }
    );
  }

  const poll = sessionStore.createPoll(id, question, options);
  return NextResponse.json(poll, { status: 201 });
}
