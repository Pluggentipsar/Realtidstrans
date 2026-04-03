import { NextRequest, NextResponse } from 'next/server';
import { getSessionCostSummary, getRateLimiterStatus } from '@/lib/claude-ai';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const costSummary = getSessionCostSummary(id);
  const rateLimiter = getRateLimiterStatus();

  return NextResponse.json({
    session: costSummary,
    rateLimiter,
  });
}
