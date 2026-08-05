/**
 * pack48CompanionClient.ts — CANONICAL Pack48 AI companion client wrapper (Economy v10).
 *
 * Callable-ONLY. Unlike the legacy aiChatService (which debited the wallet and wrote
 * messages directly from the client — a forgery surface), this wrapper performs NO
 * Firestore mutation for paid AI delivery. Every paid action goes through the
 * server-authoritative Pack48 callables, and sendMessage ALWAYS carries a stable
 * clientMessageId so the backend derives a deterministic idempotency key and never
 * double-debits.
 *
 * MIGRATION STATE: the canonical backend routing (PACK48_AI_GATEWAY_ROUTING_ENABLED)
 * and the Firestore AI billing store are default-OFF. This wrapper is the client
 * contract the UI should adopt once those flags are enabled (a separate approved
 * change). It is NOT yet wired into any screen — see the follow-up UI task.
 *
 * Testable: the callable factory is injectable, so tests need no real Firebase. In
 * production it lazily builds functions callables from the app in the Pack48 region.
 */

import { generateClientMessageId, PendingMessageIdRegistry } from './clientMessageId';

export { generateClientMessageId, PendingMessageIdRegistry };

/** MUST match the deployed Pack48 callables' region (aiCompanionsPack48.ts). */
export const PACK48_FUNCTIONS_REGION = 'europe-west1';

/**
 * Callable names as registered by functions/src/index.ts (`export * from
 * './aiCompanionsPack48'`). Verifying the exact deployed names against the client is
 * part of the UI-wiring follow-up (the legacy service used stale `ai_*` names).
 */
export const PACK48_CALLABLES = {
  startConversation: 'startConversation',
  sendMessage: 'sendMessage',
  getConversations: 'getConversations',
  getMessages: 'getMessages',
} as const;

/** A minimal callable: takes a payload, returns `{ data }`. Matches httpsCallable. */
export type CallableFn<TReq, TRes> = (payload: TReq) => Promise<{ data: TRes }>;
/** Factory that resolves a named callable. Injectable for tests. */
export type CallableFactory = <TReq, TRes>(name: string) => CallableFn<TReq, TRes>;

export class Pack48ClientError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'Pack48ClientError';
  }
}

/** Default production factory — lazily imports firebase so pure tests don't need it. */
function defaultCallableFactory(): CallableFactory {
  return <TReq, TRes>(name: string): CallableFn<TReq, TRes> => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFunctions, httpsCallable } = require('firebase/functions');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getApp } = require('firebase/app');
    const functions = getFunctions(getApp(), PACK48_FUNCTIONS_REGION);
    return httpsCallable(functions, name) as CallableFn<TReq, TRes>;
  };
}

export interface Pack48ClientDeps {
  /** Injected in tests; defaults to the production firebase callable factory. */
  callableFactory?: CallableFactory;
}

export interface SendMessageArgs {
  conversationId: string;
  companionId: string;
  userMessage: string;
  /** REQUIRED stable per-message id (see clientMessageId.ts). Never regenerate on retry. */
  clientMessageId: string;
}

export interface SendMessageResult {
  ok: boolean;
  aiResponse?: string;
  tokenCost?: number;
  tokenDebitId?: string;
  reservationStatus?: string;
  refundStatus?: string;
  error?: string;
}

function factory(deps?: Pack48ClientDeps): CallableFactory {
  return deps?.callableFactory ?? defaultCallableFactory();
}

/**
 * Send a message to an AI companion through the canonical server-authoritative callable.
 * Fails LOCALLY (before any network call) if the stable clientMessageId or message text
 * is missing, so a malformed send never reaches the paid path. No Firestore writes.
 */
export async function sendMessage(
  args: SendMessageArgs,
  deps?: Pack48ClientDeps
): Promise<SendMessageResult> {
  if (!args.clientMessageId || !args.clientMessageId.trim()) {
    throw new Pack48ClientError(
      'PACK48_CLIENT_MESSAGE_ID_REQUIRED',
      'A stable clientMessageId is required for canonical AI companion messaging.'
    );
  }
  if (!args.userMessage || !args.userMessage.trim()) {
    throw new Pack48ClientError('PACK48_EMPTY_MESSAGE', 'Message text is required.');
  }
  const call = factory(deps)<
    { conversationId: string; companionId: string; userMessage: string; clientMessageId: string },
    SendMessageResult
  >(PACK48_CALLABLES.sendMessage);
  const res = await call({
    conversationId: args.conversationId,
    companionId: args.companionId,
    userMessage: args.userMessage,
    clientMessageId: args.clientMessageId,
  });
  return res.data;
}

export async function startConversation(
  companionId: string,
  deps?: Pack48ClientDeps
): Promise<{ ok: boolean; conversationId?: string; error?: string }> {
  if (!companionId) {
    throw new Pack48ClientError('PACK48_COMPANION_ID_REQUIRED', 'companionId is required.');
  }
  const call = factory(deps)<{ companionId: string }, { ok: boolean; conversationId?: string; error?: string }>(
    PACK48_CALLABLES.startConversation
  );
  const res = await call({ companionId });
  return res.data;
}

export async function getConversations(
  deps?: Pack48ClientDeps
): Promise<{ ok: boolean; conversations?: unknown[]; error?: string }> {
  const call = factory(deps)<Record<string, never>, { ok: boolean; conversations?: unknown[]; error?: string }>(
    PACK48_CALLABLES.getConversations
  );
  const res = await call({});
  return res.data;
}
