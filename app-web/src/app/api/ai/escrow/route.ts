import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

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
  const { action, chatId, amount } = body;
  const db = getAdminFirestore();

  if (action === 'deposit') {
    if (!chatId || !amount || amount < 10) {
      return NextResponse.json({ success: false, error: 'Invalid deposit params' }, { status: 400 });
    }
    try {
      let walletBalance = 0;
      await db.runTransaction(async (tx) => {
        const walletRef = db.collection('wallets').doc(userId);
        const escrowRef = db.collection('chat_escrows').doc(chatId);
        const walletSnap = await tx.get(walletRef);
        if (!walletSnap.exists) throw new Error('Wallet not found');
        const currentBalance = walletSnap.data()!.tokensBalance ?? 0;
        if (currentBalance < amount) throw new Error('Insufficient balance');
        tx.update(walletRef, { tokensBalance: FieldValue.increment(-amount) });
        tx.set(escrowRef, {
          userId,
          chatId,
          depositedTokens: FieldValue.increment(amount),
          remainingTokens: FieldValue.increment(amount),
          spentTokens: 0,
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        walletBalance = currentBalance - amount;
      });
      return NextResponse.json({ success: true, remainingTokens: amount, walletBalance });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
  }

  if (action === 'refund') {
    if (!chatId) return NextResponse.json({ success: false, error: 'Missing chatId' }, { status: 400 });
    try {
      let refundedTokens = 0;
      let walletBalance = 0;
      await db.runTransaction(async (tx) => {
        const escrowRef = db.collection('chat_escrows').doc(chatId);
        const walletRef = db.collection('wallets').doc(userId);
        const escrowSnap = await tx.get(escrowRef);
        if (!escrowSnap.exists) throw new Error('Escrow not found');
        const data = escrowSnap.data()!;
        if (data.userId !== userId) throw new Error('Unauthorized');
        refundedTokens = data.remainingTokens ?? 0;
        const walletSnap = await tx.get(walletRef);
        const currentBalance = walletSnap.data()?.tokensBalance ?? 0;
        if (refundedTokens > 0) {
          tx.update(walletRef, { tokensBalance: FieldValue.increment(refundedTokens) });
        }
        tx.update(escrowRef, { remainingTokens: 0, status: 'ended', endedAt: FieldValue.serverTimestamp() });
        walletBalance = currentBalance + refundedTokens;
      });
      return NextResponse.json({ success: true, refundedTokens, walletBalance });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
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
