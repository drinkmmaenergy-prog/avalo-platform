/**
 * POST /api/ai/chat
 *
 * Server-side proxy for Anthropic Claude API.
 * Replaces the CORS-blocked sendAIMessageCallable (BUG 3).
 *
 * Accepts:
 *   - Authorization: Bearer <Firebase ID token>
 *   - Body: { systemPrompt, messages, avatarId }
 *
 * Actions:
 *   1. Verifies Firebase ID token
 *   2. Calls Anthropic API (https://api.anthropic.com/v1/messages)
 *   3. Stores user + AI messages in Firestore: ai_chats/{chatId}/messages/{messageId}
 *   4. Returns the AI reply
 *
 * INVARIANTS:
 *   - ANTHROPIC_API_KEY must be set in server-side env (NOT NEXT_PUBLIC_)
 *   - chatId is deterministic: `${userId}_${avatarId}`
 *   - Messages stored with fields: role, content, timestamp
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;

interface ChatRequestBody {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  avatarId: string;
  userMessage: string;
  chatId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      console.error('[/api/ai/chat] ANTHROPIC_API_KEY missing in environment.');
      return NextResponse.json(
        { success: false, error: 'AI service not configured.' },
        { status: 500 }
      );
    }

    // ── Verify Firebase ID token ──────────────────────────────────────
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Missing Bearer token.' },
        { status: 401 }
      );
    }

    const idToken = authHeader.slice(7);
    let userId: string;

    try {
      const decodedToken = await getAdminAuth().verifyIdToken(idToken);
      userId = decodedToken.uid;
    } catch (authErr) {
      console.error('[/api/ai/chat] Token verification failed:', authErr);
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Invalid token.' },
        { status: 401 }
      );
    }

    // ── Parse request body ────────────────────────────────────────────
    const body: ChatRequestBody = await request.json();
    const { systemPrompt, messages, avatarId, userMessage, chatId } = body;

    if (!systemPrompt || !avatarId || !userMessage) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: systemPrompt, avatarId, userMessage.' },
        { status: 400 }
      );
    }

    // ── Build Anthropic messages array ────────────────────────────────
    const anthropicMessages = [
      ...(messages || []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    // ── Call Anthropic API ────────────────────────────────────────────
    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!anthropicResponse.ok) {
      const errorData = await anthropicResponse.text();
      console.error('[/api/ai/chat] Anthropic API error:', anthropicResponse.status, errorData);
      return NextResponse.json(
        { success: false, error: 'AI service temporarily unavailable.' },
        { status: 502 }
      );
    }

    const anthropicData = await anthropicResponse.json();
    const aiReply =
      anthropicData.content?.[0]?.text ?? 'I apologize, I could not generate a response.';

    // ── Store messages in Firestore ───────────────────────────────────
    // Collection: ai_chats/{chatId}/messages/{messageId}
    // chatId is deterministic: `${userId}_${avatarId}`
    const storageChatId = `${userId}_${avatarId}`;
    const db = getAdminFirestore();
    const messagesRef = db.collection('ai_chats').doc(storageChatId).collection('messages');

    // Ensure parent chat document exists
    const chatDocRef = db.collection('ai_chats').doc(storageChatId);
    await chatDocRef.set(
      {
        userId,
        avatarId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Store user message
    await messagesRef.add({
      role: 'user',
      content: userMessage,
      timestamp: FieldValue.serverTimestamp(),
    });

    // Store AI response
    await messagesRef.add({
      role: 'assistant',
      content: aiReply,
      timestamp: FieldValue.serverTimestamp(),
    });

    // Deduct 1 token from escrow if chatId provided
    let remainingTokens: number | undefined;
    if (chatId) {
      try {
        await db.runTransaction(async (tx) => {
          const escrowRef = db.collection('chat_escrows').doc(chatId);
          const escrowSnap = await tx.get(escrowRef);
          if (escrowSnap.exists) {
            const current = escrowSnap.data()!.remainingTokens ?? 0;
            remainingTokens = Math.max(0, current - 1);
            tx.update(escrowRef, {
              remainingTokens: remainingTokens,
              spentTokens: (escrowSnap.data()!.spentTokens ?? 0) + 1,
            });
          }
        });
      } catch (escrowErr) {
        console.warn('[/api/ai/chat] Escrow deduction failed:', escrowErr);
        // Non-fatal — do not block the response
      }
    }

    return NextResponse.json({
      success: true,
      reply: aiReply,
      ...(remainingTokens !== undefined && { remainingTokens }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/ai/chat] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
