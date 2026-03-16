import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/stripe/webhook
 *
 * Deprecated compatibility ack route.
 * Webhook authority is backend functions runtime.
 */
export async function POST(_request: NextRequest) {
  console.warn('[stripe/webhook] Deprecated app-web route called. Authority moved to backend functions webhook.');

  return NextResponse.json({
    received: true,
    deprecated: true,
  });
}
