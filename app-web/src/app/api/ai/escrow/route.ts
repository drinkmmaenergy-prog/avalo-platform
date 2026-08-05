import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

async function verifyToken(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const userId = await verifyToken(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { action, chatId } = body;
  const db = getAdminFirestore();

  // ── P0-02 CONTAINMENT ──────────────────────────────────────────────────────────────────────────────────
  // The legacy pre-funding escrow model performed CLIENT-TRIGGERED wallet mutations (a direct debit/credit of
  // `wallets.tokensBalance` outside the canonical ledger) and the chat route then deducted from escrow AFTER the
  // provider call in a non-fatal block. AI spend is now billed by canonical, server-authoritative, atomic
  // preauthorization inside the chat route (functions/src/ai-billing/aiSpendAuthorization). The client-triggered
  // wallet-mutating escrow actions are therefore CONTAINED (fail-closed) so no parallel/forgeable billing writer
  // remains. `status` stays available (read-only). Recovery of any pre-existing chat_escrows balances is a
  // bounded, separately-authorized server migration (see evidence 14-migration-impact) — never a client mutation.
  if (action === 'deposit' || action === 'refund') {
    return NextResponse.json(
      {
        success: false,
        error:
          'escrow_prefunding_retired: AI spend is now billed via server-authoritative preauthorization; ' +
          'client-triggered wallet escrow mutations are disabled.',
      },
      { status: 410 },
    );
  }

  if (action === 'status') {
    if (!chatId) return NextResponse.json({ success: false, error: 'Missing chatId' }, { status: 400 });
    try {
      const escrowSnap = await db.collection('chat_escrows').doc(chatId).get();
      if (!escrowSnap.exists) {
        return NextResponse.json({ success: true, remainingTokens: 0, spentTokens: 0, depositedTokens: 0, status: 'none' });
      }
      const data = escrowSnap.data()!;
      if (data.userId !== userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
      return NextResponse.json({ success: true, remainingTokens: data.remainingTokens ?? 0, spentTokens: data.spentTokens ?? 0, depositedTokens: data.depositedTokens ?? 0, status: data.status ?? 'active' });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}
