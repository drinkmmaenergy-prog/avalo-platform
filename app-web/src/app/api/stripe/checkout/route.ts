/**
 * POST /api/stripe/checkout
 *
 * Deprecated compatibility route.
 * Token checkout authority is backend callable:
 * - tokens_createCheckoutSession
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      deprecated: true,
      error: 'Deprecated route. Use backend callable tokens_createCheckoutSession.',
    },
    { status: 410 }
  );
}
