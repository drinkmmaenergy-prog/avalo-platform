// functions/src/chat/c5DirectChatContainment.ts
//
// P0-05 R1A-1 — SAFE UNAVAILABLE CONTAINMENT for the EXPORTED c5 direct-chat callable entrypoints
// (functions/src/chat/canonicalDirectChatCallables.ts).
//
// The c5 direct-chat callables (c5_startMatchedChat, c5_requestPaidChat, c5_creatorAcceptPaidChat,
// c5_creatorDeclinePaidChat, c5_openPaidSessionCall, c5_sendFanMessage, c5_deliverCreatorMessage,
// c5_fundNewSegment, c5_closePaidSessionCall, and the rate/counteroffer/session-end wrappers) read and write
// PAID-CHAT AUTHORITY from the CLIENT-WRITABLE `/chats` collection (chat.state / chat.fanId / chat.creatorId /
// freeMessagesRemaining) and hold independent wallet-reservation + creatorEarningLedger authority. They are
// EXPORTED but have NO shipped client caller (verified), so they are an unsafe, unused, forgeable authority
// surface and an authority collision with the active ENGINE_A (v2 canonical-chat-engine) billing path.
//
// Per the accepted HYBRID_CONSOLIDATION blueprint, the c5 LOGIC modules (canonicalChatStateMachineV3,
// canonicalMultiplierTiers) are RETAINED as the future canonical basis. Only the exported CALLABLE ENTRYPOINTS
// are fail-closed here. This is ONE canonical containment contract reused by every c5 callable (no per-callable
// divergence, no env/config re-enable). Re-enablement occurs only via a future authorized canonical paid-chat
// stage that moves paid authority to a server-only aggregate.
//
// NOTE: this is a bounded strangler step. It does NOT close the ACTIVE ENGINE_A P0-05 risk
// (sendChatMessage -> processMessage bills on client-created /chats). P0-05 remains OPEN.

import { HttpsError } from 'firebase-functions/v2/https';

export const C5_DIRECT_CHAT_UNAVAILABLE = 'P0_05_C5_DIRECT_CHAT_UNAVAILABLE_PENDING_CANONICAL_ENGINE';

// Fail-closed guard: throws a deterministic Https 'unavailable' BEFORE any /chats read/write, wallet reservation,
// wallet debit, ledger write, creator-earning write, chatSessions/billingEvents write, or state-machine /
// multiplier invocation can occur. Not env-toggleable: containment cannot be accidentally re-enabled by config.
// Typed `void` (rather than `never`) so it can be inserted ahead of the retained callable bodies without making
// them statically unreachable — the retained bodies keep the c5 logic imports referenced for later extraction.
export function assertC5DirectChatUnavailable(): void {
  throw new HttpsError('unavailable', C5_DIRECT_CHAT_UNAVAILABLE);
}
