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
  tokensToDeduct?: number;
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

    // ── Parse request body (JSON or FormData with image) ──────────────
    const contentType = request.headers.get('content-type') ?? '';
    let body: ChatRequestBody;
    let imageFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body = {
        systemPrompt: formData.get('systemPrompt') as string,
        messages: JSON.parse(formData.get('messages') as string),
        avatarId: formData.get('avatarId') as string,
        userMessage: formData.get('userMessage') as string,
        chatId: formData.get('chatId') as string || undefined,
        tokensToDeduct: Number(formData.get('tokensToDeduct')) || 1,
      };
      imageFile = formData.get('image') as File | null;
    } else {
      body = await request.json();
    }

    console.log('[AI chat] imageFile:', imageFile?.name, imageFile?.size, imageFile?.type);

    const { systemPrompt, messages, avatarId, userMessage, chatId } = body;
    const tokensToDeduct = Math.max(1, Math.min(100, body.tokensToDeduct ?? 1));

    if (!systemPrompt || !avatarId || (!userMessage && !imageFile)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: systemPrompt, avatarId, userMessage.' },
        { status: 400 }
      );
    }

    // ── Build user message content (text or text+image) ───────────────
    let userContent: any = userMessage;
    console.log('[AI chat] userContent type:', typeof userContent);
    if (imageFile) {
      const imageBuffer = await imageFile.arrayBuffer();

      // Detect actual media type from magic bytes
      const bytes = new Uint8Array(imageBuffer);
      let detectedType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        detectedType = 'image/png';
      } else if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
        detectedType = 'image/jpeg';
      } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        detectedType = 'image/gif';
      } else if (
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
      ) {
        detectedType = 'image/webp';
      }

      const base64 = Buffer.from(imageBuffer).toString('base64');
      const mediaType = detectedType;
      userContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        { type: 'text', text: body.userMessage || 'Please describe this image.' },
      ];
    }

    // ── Build Anthropic messages array ────────────────────────────────
    const anthropicMessages = [
      ...(messages || []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: userContent },
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

    // Deduct tokensToDeduct from escrow if chatId provided
    let remainingTokens: number | undefined;
    if (chatId) {
      try {
        await db.runTransaction(async (tx) => {
          const escrowRef = db.collection('chat_escrows').doc(chatId);
          const escrowSnap = await tx.get(escrowRef);
          if (escrowSnap.exists) {
            const current = escrowSnap.data()!.remainingTokens ?? 0;
            if (current < tokensToDeduct) {
              throw new Error('Insufficient escrow tokens');
            }
            remainingTokens = current - tokensToDeduct;
            tx.update(escrowRef, {
              remainingTokens: remainingTokens,
              spentTokens: (escrowSnap.data()!.spentTokens ?? 0) + tokensToDeduct,
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
      tokensToDeduct,
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
