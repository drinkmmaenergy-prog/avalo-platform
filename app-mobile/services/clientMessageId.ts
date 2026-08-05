/**
 * clientMessageId.ts — stable per-message id lifecycle for the CANONICAL Pack48 AI
 * companion chat path (Economy v10).
 *
 * The canonical backend (aiCompanionsPack48.sendMessage) derives a deterministic
 * idempotency key `pack48:v1:{userId}:{conversationId}:{companionId}:{clientMessageId}`
 * and fails closed if no stable clientMessageId is supplied. To guarantee a client
 * double-tap or retry maps to the SAME key (no double-debit), each logical outbound
 * message must carry ONE clientMessageId that is generated once and reused until the
 * send is confirmed or the draft is discarded.
 *
 * Pure + framework-light: the UUID generator is injectable, so this module is
 * deterministically testable and has no hard expo/firebase dependency. Production
 * prefers expo-crypto randomUUID (then global crypto), with a non-security RFC4122-ish
 * fallback only if neither is present. NEVER random per-retry — the registry below
 * enforces one id per pending message.
 */

export type UuidFn = () => string;

/** Non-security fallback id (collision-resistant enough for a per-message client id). */
function fallbackUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let injectedUuidFn: UuidFn | null = null;

/** Test seam: override (or reset with null) the underlying UUID generator. */
export function __setUuidFnForTests(fn: UuidFn | null): void {
  injectedUuidFn = fn;
}

/**
 * Generate a fresh client message id. Prefers expo-crypto randomUUID, then global
 * crypto.randomUUID, else a fallback. Do NOT call this directly per retry — use
 * PendingMessageIdRegistry so the same logical message reuses one id.
 */
export function generateClientMessageId(): string {
  if (injectedUuidFn) return injectedUuidFn();
  try {
    // Lazy require so pure tests / non-expo runtimes need no expo-crypto.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Crypto = require('expo-crypto');
    if (Crypto && typeof Crypto.randomUUID === 'function') return Crypto.randomUUID();
  } catch {
    /* fall through to global crypto / fallback */
  }
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.randomUUID === 'function') return g.crypto.randomUUID();
  return fallbackUuid();
}

/**
 * Assigns exactly ONE clientMessageId per logical pending outbound message, keyed by a
 * caller-chosen pending key (e.g. a per-draft local id, or conversationId+draftSeq).
 *
 *   - getOrCreate(key): first call mints an id; subsequent calls for the SAME key return
 *     the SAME id — so retries and double-taps of a still-pending message never mint a
 *     second id (no double-debit).
 *   - clear(key): call AFTER the send is confirmed (or the draft is discarded) so the
 *     NEXT logical message gets a NEW id.
 *
 * The registry never regenerates an id for a key while it remains pending.
 */
export class PendingMessageIdRegistry {
  private ids = new Map<string, string>();

  constructor(private readonly gen: UuidFn = generateClientMessageId) {}

  /** Stable id for a pending-message key; identical for the life of that pending message. */
  getOrCreate(pendingKey: string): string {
    const existing = this.ids.get(pendingKey);
    if (existing) return existing;
    const id = this.gen();
    this.ids.set(pendingKey, id);
    return id;
  }

  has(pendingKey: string): boolean {
    return this.ids.has(pendingKey);
  }

  /** Release the id once the message is confirmed sent or discarded. */
  clear(pendingKey: string): void {
    this.ids.delete(pendingKey);
  }

  clearAll(): void {
    this.ids.clear();
  }
}
