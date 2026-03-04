/**
 * CANONICAL CHAT ENGINE — LEGACY REDIRECT SHIM
 *
 * This module provides backward-compatible wrappers that redirect legacy
 * chat billing calls to the canonical v2 engine.
 *
 * PURPOSE:
 * - Allows existing API endpoints to continue working during migration
 * - Logs deprecation warnings for legacy path usage
 * - Routes all billing through canonical-chat-engine.ts
 *
 * LEGACY PATHS REDIRECTED:
 * 1. chats.ts processMessageBilling → canonical processMessage
 * 2. chatMonetization.ts processMessageBilling → canonical processMessage
 * 3. pack273ChatEngine.ts pack273_processMessage → canonical processMessage
 * 4. pack328b-chat-session-timeouts.ts → canonical expireInactiveChats
 *
 * LEGACY PATHS DISABLED (no redirect, just error):
 * 5. pack242DynamicChatPricing.ts deposit modifiers → REMOVED
 * 6. pack452 mid-chat premium offers → REMOVED (next session only via canonical)
 *
 * @module canonical-chat-legacy-shim
 * @version 1.0.0
 */

import {
  processMessage,
  endChat,
  expireInactiveChats,
  countBillableWords,
  isCanonicalChat,
} from './canonical-chat-engine.js';
import { CANONICAL_LOGIC_VERSION } from './types/canonical-chat.types.js';
import { db } from './init.js';

// ============================================================================
// DEPRECATION LOGGING
// ============================================================================

const DEPRECATION_WARNINGS = new Set<string>();

function logDeprecation(legacyPath: string, replacement: string): void {
  const key = `${legacyPath}→${replacement}`;
  if (!DEPRECATION_WARNINGS.has(key)) {
    DEPRECATION_WARNINGS.add(key);
    console.warn(
      `[DEPRECATED] ${legacyPath} is deprecated. ` +
      `Use ${replacement} from canonical-chat-engine.ts instead. ` +
      `This shim will be removed in the next major version.`
    );
  }
}

// ============================================================================
// SHIM: chatMonetization.ts processMessageBilling
// ============================================================================

/**
 * @deprecated Use processMessage from canonical-chat-engine.ts
 *
 * Redirects chatMonetization.ts processMessageBilling calls to the canonical engine.
 * For v2_canonical chats, forwards directly.
 * For legacy chats, logs a warning and attempts to route.
 */
export async function shimProcessMessageBilling(
  chatId: string,
  senderId: string,
  messageText: string,
  _wordCount?: number // Legacy param, ignored — recalculated
): Promise<any> {
  logDeprecation('chatMonetization.processMessageBilling', 'canonical-chat-engine.processMessage');

  // Check if chat is v2_canonical
  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) {
    throw new Error(`Chat ${chatId} not found`);
  }

  const chatData = chatSnap.data()!;
  if (isCanonicalChat(chatData)) {
    return processMessage(chatId, senderId, messageText);
  }

  // Legacy chat — warn and process with canonical engine anyway
  // (assumes migration has been run or will catch up)
  console.warn(`[SHIM] Legacy chat ${chatId} routed through canonical engine. Run migration first.`);
  return processMessage(chatId, senderId, messageText);
}

// ============================================================================
// SHIM: pack273ChatEngine processMessage
// ============================================================================

/**
 * @deprecated Use processMessage from canonical-chat-engine.ts
 *
 * Redirects pack273 processMessage calls to the canonical engine.
 */
export async function shimPack273ProcessMessage(
  chatId: string,
  senderId: string,
  messageText: string,
  _mediaType?: string // Legacy param, ignored
): Promise<any> {
  logDeprecation('pack273ChatEngine.processMessage', 'canonical-chat-engine.processMessage');
  return processMessage(chatId, senderId, messageText);
}

// ============================================================================
// SHIM: chats.ts billing functions
// ============================================================================

/**
 * @deprecated Use processMessage from canonical-chat-engine.ts
 *
 * Redirects chats.ts sender-billing calls to the canonical engine.
 * IMPORTANT: chats.ts billed on sender messages. The canonical engine
 * only bills earner messages. This shim corrects the billing direction.
 */
export async function shimChatsProcessBilling(
  chatId: string,
  senderId: string,
  messageText: string
): Promise<any> {
  logDeprecation('chats.ts billing', 'canonical-chat-engine.processMessage');
  return processMessage(chatId, senderId, messageText);
}

// ============================================================================
// SHIM: pack328b expiration
// ============================================================================

/**
 * @deprecated Use expireInactiveChats from canonical-chat-engine.ts
 *
 * Redirects pack328b chat expiration to the canonical engine.
 * The canonical engine uses 48h for ALL chat states (no 72h divergence).
 */
export async function shimPack328bExpireChats(): Promise<number> {
  logDeprecation('pack328b.chatSessionAutoExpireJob', 'canonical-chat-engine.expireInactiveChats');
  return expireInactiveChats();
}

// ============================================================================
// SHIM: pack328b endChatSession
// ============================================================================

/**
 * @deprecated Use endChat from canonical-chat-engine.ts
 */
export async function shimPack328bEndChatSession(
  sessionId: string,
  userId: string
): Promise<any> {
  logDeprecation('pack328b.endChatSession', 'canonical-chat-engine.endChat');
  return endChat(sessionId, userId);
}

// ============================================================================
// DISABLED: pack242 deposit modifiers
// ============================================================================

/**
 * @deprecated REMOVED — pack242 deposit modifiers are eliminated.
 *
 * Deposit is now: max(100, earnerConfiguredDepositTokensForNextSession)
 * configured via setDepositForNextSession in canonical-chat-engine.ts.
 *
 * @throws Error Always throws — this function is disabled.
 */
export function shimPack242GetChatEntryPrice(
  _userId: string,
  _basePrice?: number
): never {
  throw new Error(
    '[REMOVED] pack242 dynamic chat pricing is eliminated. ' +
    'Deposit is now max(100, earnerConfiguredDepositTokensForNextSession). ' +
    'Use setDepositForNextSession from canonical-chat-engine.ts.'
  );
}

// ============================================================================
// DISABLED: pack452 mid-chat premium offers
// ============================================================================

/**
 * @deprecated REMOVED — pack452 mid-chat premium offers are eliminated.
 *
 * Multiplier changes can only apply to the NEXT session via
 * setMultiplierForNextSession in canonical-chat-engine.ts.
 *
 * @throws Error Always throws — this function is disabled.
 */
export function shimPack452CreatePremiumOffer(
  _chatId: string,
  _payerId: string,
  _multiplier: number,
  _exclusive?: boolean
): never {
  throw new Error(
    '[REMOVED] pack452 mid-chat premium offers are eliminated. ' +
    'Multiplier changes can only apply to the NEXT session. ' +
    'Use setMultiplierForNextSession from canonical-chat-engine.ts.'
  );
}

/**
 * @deprecated REMOVED — pack452 mid-chat premium offers are eliminated.
 * @throws Error Always throws
 */
export function shimPack452AcceptPremiumOffer(_offerId: string): never {
  throw new Error(
    '[REMOVED] pack452 premium offers eliminated. ' +
    'Multipliers are set for next session only via setMultiplierForNextSession.'
  );
}

// ============================================================================
// ROUTING HELPER
// ============================================================================

/**
 * Universal message billing router.
 *
 * Call this from any endpoint that previously called different billing functions.
 * It routes ALL chats through the canonical engine.
 *
 * @param chatId - The chat ID
 * @param senderId - The message sender
 * @param messageText - The message text
 * @returns Billing result from the canonical engine
 */
export async function routeMessageBilling(
  chatId: string,
  senderId: string,
  messageText: string
): Promise<any> {
  return processMessage(chatId, senderId, messageText);
}









