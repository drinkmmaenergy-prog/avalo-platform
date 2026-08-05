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
// P0-02 R2: canonical server-authoritative AI spend preauthorization (single source of truth; owns price policy,
// atomic reservation against canonical wallets.balance + reservedTokens, canonical ledger, semantic idempotency,
// settle/release, and provider-invocation-after-preauth ordering). App-web-owned module (Next standalone-traced);
// Firestore + FieldValue are injected so it stays framework-agnostic and independently testable.
import {
  runBillableAiOperation,
  payloadDigest,
  AiInsufficientFundsError,
  AiBillingUnavailableError,
  AiBillingConflictError,
  AiOperationIdRequiredError,
  AiSettlementReconciliationError,
  AiProviderKnownFailure,
  AiProviderUncertainError,
} from '@/lib/ai-billing/aiSpendAuthorization';

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

    const { systemPrompt, messages, avatarId, userMessage } = body;
    // Retained only for backward-compatible request shape; DELIBERATELY NOT used for pricing (server owns price).
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

    // ── P0-02: SERVER-AUTHORITATIVE PREAUTHORIZATION BEFORE ANY PROVIDER CALL ──────────
    // The billable product and its price are SERVER-OWNED (never a client field). The canonical orchestrator
    // atomically reserves value first, invokes the provider ONLY after a successful preauthorization, then
    // settles the exact eligible amount or releases the reservation on failure. The client-supplied
    // `tokensToDeduct` is DELIBERATELY IGNORED for pricing (retained only for backward-compatible request shape).
    void tokensToDeduct;
    const db = getAdminFirestore();
    const AI_PRODUCT = 'ai_companion'; // canonical server-owned product for this route (3 tokens/message)
    // Idempotency identity: the caller MUST supply a stable per-logical-send `requestId` (generated once at send
    // time and REUSED across transport retries). A missing/blank id FAILS CLOSED before any provider call — there is
    // NO random fallback (which would defeat retry idempotency). The server fingerprint additionally binds product +
    // avatar + canonical price + a payload DIGEST, so reusing a requestId with any changed material dimension
    // (avatar/message/product) is a CONFLICT before any provider call.
    const clientRequestId = (body as { requestId?: unknown }).requestId;
    if (typeof clientRequestId !== 'string' || clientRequestId.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'BILLABLE_OPERATION_ID_REQUIRED' }, { status: 400 });
    }
    const digest = payloadDigest({ userMessage, history: messages, hasImage: !!imageFile });

    // Provider invocation is wrapped so it can ONLY be reached from inside the orchestrator, strictly AFTER a
    // successful preauthorization. Provider errors are classified: a clean HTTP rejection is a KNOWN failure
    // (release, no charge); a network/timeout is UNCERTAIN (reconciliation, never blind release/re-invoke).
    const providerFn = async (): Promise<{ result: string; outcome: { eligible: boolean } }> => {
      let anthropicResponse: Response;
      try {
        anthropicResponse = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, system: systemPrompt, messages: anthropicMessages }),
        });
      } catch (networkErr) {
        throw new AiProviderUncertainError('network_' + (networkErr instanceof Error ? networkErr.message : 'error'));
      }
      if (!anthropicResponse.ok) {
        const errorData = await anthropicResponse.text();
        console.error('[/api/ai/chat] Anthropic API error:', anthropicResponse.status, errorData);
        // 5xx may mean the request was accepted-but-failed (uncertain); 4xx is a known no-work rejection.
        if (anthropicResponse.status >= 500) { throw new AiProviderUncertainError('http_' + anthropicResponse.status); }
        throw new AiProviderKnownFailure('http_' + anthropicResponse.status);
      }
      const anthropicData = await anthropicResponse.json();
      const reply = anthropicData.content?.[0]?.text;
      const eligible = typeof reply === 'string' && reply.trim().length > 0;
      return { result: eligible ? reply : 'I apologize, I could not generate a response.', outcome: { eligible } };
    };

    let opResult;
    try {
      opResult = await runBillableAiOperation(
        db,
        FieldValue,
        { userId, product: AI_PRODUCT, avatarId, clientRequestId, payloadDigest: digest },
        providerFn,
      );
    } catch (billingErr) {
      if (billingErr instanceof AiInsufficientFundsError) {
        return NextResponse.json({ success: false, error: 'Insufficient tokens for AI companion.' }, { status: 402 });
      }
      if (billingErr instanceof AiOperationIdRequiredError) {
        return NextResponse.json({ success: false, error: 'BILLABLE_OPERATION_ID_REQUIRED' }, { status: 400 });
      }
      if (billingErr instanceof AiBillingConflictError) {
        return NextResponse.json({ success: false, error: 'Conflicting AI request for this idempotency key.' }, { status: 409 });
      }
      if (billingErr instanceof AiBillingUnavailableError) {
        return NextResponse.json({ success: false, error: 'AI companion billing is unavailable.' }, { status: 403 });
      }
      if (billingErr instanceof AiSettlementReconciliationError || billingErr instanceof AiProviderUncertainError) {
        // Provider outcome uncertain OR settlement failed: the paid result is NOT released as free and NOT
        // returned; the operation is held for deterministic retry/reconciliation. No double provider spend.
        console.error('[/api/ai/chat] AI operation requires reconciliation:', billingErr);
        return NextResponse.json({ success: false, error: 'AI response is being reconciled; please retry.' }, { status: 409 });
      }
      if (billingErr instanceof AiProviderKnownFailure) {
        return NextResponse.json({ success: false, error: 'AI service temporarily unavailable.' }, { status: 502 });
      }
      console.error('[/api/ai/chat] AI operation failed:', billingErr);
      return NextResponse.json({ success: false, error: 'AI service temporarily unavailable.' }, { status: 502 });
    }

    // Idempotent replay of an already-finalized operation returns the durably captured result with no new charge.
    if (opResult.replay) {
      return NextResponse.json({ success: true, reply: opResult.result ?? '', duplicate: true, settledTokens: opResult.settledTokens });
    }
    if (opResult.result === null) {
      return NextResponse.json({ success: true, reply: '', settledTokens: opResult.settledTokens });
    }
    const aiReply = opResult.result;

    // ── Store messages in Firestore (after settlement) ────────────────
    const storageChatId = `${userId}_${avatarId}`;
    const messagesRef = db.collection('ai_chats').doc(storageChatId).collection('messages');
    const chatDocRef = db.collection('ai_chats').doc(storageChatId);
    await chatDocRef.set({ userId, avatarId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await messagesRef.add({ role: 'user', content: userMessage, timestamp: FieldValue.serverTimestamp() });
    await messagesRef.add({ role: 'assistant', content: aiReply, timestamp: FieldValue.serverTimestamp() });

    return NextResponse.json({
      success: true,
      reply: aiReply,
      settledTokens: opResult.settledTokens,
      operationId: opResult.operationId,
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
