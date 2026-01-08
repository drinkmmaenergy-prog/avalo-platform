/**
 * PACK 54 - Moderation Integrations
 * Helper functions for integrating enforcement checks into existing modules
 */

import {
  canAppearInDiscovery,
  canAppearInMarketplace,
  canSendMessage,
  canStartNewChat,
  canEarnFromChat,
} from './moderationEngine';

// ============================================================================
// DISCOVERY FEED INTEGRATION
// ============================================================================

/**
 * Filter discovery feed candidates by enforcement state
 * Remove users who are hidden from discovery or have restricted accounts
 */
export async function filterDiscoveryCandidates(
  userIds: string[]
): Promise<string[]> {
  const filteredIds: string[] = [];

  for (const userId of userIds) {
    const canAppear = await canAppearInDiscovery(userId);
    if (canAppear) {
      filteredIds.push(userId);
    }
  }

  return filteredIds;
}

// ============================================================================
// CREATOR MARKETPLACE INTEGRATION
// ============================================================================

/**
 * Filter creator marketplace candidates by enforcement state
 * Remove creators who are suspended, banned, hidden, or have earning disabled
 */
export async function filterMarketplaceCandidates(
  creatorIds: string[]
): Promise<string[]> {
  const filteredIds: string[] = [];

  for (const creatorId of creatorIds) {
    const canAppear = await canAppearInMarketplace(creatorId);
    if (canAppear) {
      filteredIds.push(creatorId);
    }
  }

  return filteredIds;
}

// ============================================================================
// CHAT INTEGRATION
// ============================================================================

/**
 * Check if user can send a message before processing
 * Should be called BEFORE token charge
 */
export async function validateMessageSend(
  senderId: string
): Promise<{
  allowed: boolean;
  errorCode?: string;
  errorMessage?: string;
}> {
  const check = await canSendMessage(senderId);

  if (!check.allowed) {
    let errorMessage = 'You cannot send messages at this time.';
    
    switch (check.reason) {
      case 'ACCOUNT_SUSPENDED':
        errorMessage = 'Your account is currently suspended. You cannot send messages.';
        break;
      case 'ACCOUNT_BANNED':
        errorMessage = 'Your account has been banned. Please contact support.';
        break;
      case 'MESSAGING_READ_ONLY':
        errorMessage = 'Your messaging is temporarily restricted. You cannot send new messages.';
        break;
    }

    return {
      allowed: false,
      errorCode: check.reason,
      errorMessage,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can start a new chat conversation
 */
export async function validateNewChatStart(
  userId: string
): Promise<{
  allowed: boolean;
  errorCode?: string;
  errorMessage?: string;
}> {
  const check = await canStartNewChat(userId);

  if (!check.allowed) {
    let errorMessage = 'You cannot start new chats at this time.';
    
    switch (check.reason) {
      case 'ACCOUNT_RESTRICTED':
        errorMessage = 'Your account is restricted. You cannot start new chats.';
        break;
      case 'NO_NEW_CHATS':
        errorMessage = 'You cannot start new chats at this time. You can still reply to existing conversations.';
        break;
    }

    return {
      allowed: false,
      errorCode: check.reason,
      errorMessage,
    };
  }

  return { allowed: true };
}

// ============================================================================
// EARN MODE INTEGRATION
// ============================================================================

/**
 * Check if user can enable earn mode
 * Combines Trust Engine permission with Enforcement state
 */
export async function validateEarnModeEligibility(
  userId: string,
  trustEngineAllowed: boolean
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const canEarn = await canEarnFromChat(userId, trustEngineAllowed);

  if (!canEarn) {
    if (!trustEngineAllowed) {
      return {
        allowed: false,
        reason: 'TRUST_ENGINE_BLOCKED',
      };
    }

    return {
      allowed: false,
      reason: 'ENFORCEMENT_BLOCKED',
    };
  }

  return { allowed: true };
}

/**
 * Bulk check if creators can appear in marketplace
 * More efficient for large lists
 */
export async function bulkCheckMarketplaceEligibility(
  creatorIds: string[]
): Promise<Map<string, boolean>> {
  const eligibilityMap = new Map<string, boolean>();

  // Process in batches to avoid overwhelming Firestore
  const batchSize = 50;
  for (let i = 0; i < creatorIds.length; i += batchSize) {
    const batch = creatorIds.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (creatorId) => {
        const canAppear = await canAppearInMarketplace(creatorId);
        eligibilityMap.set(creatorId, canAppear);
      })
    );
  }

  return eligibilityMap;
}

/**
 * Bulk check if users can appear in discovery
 * More efficient for large lists
 */
export async function bulkCheckDiscoveryEligibility(
  userIds: string[]
): Promise<Map<string, boolean>> {
  const eligibilityMap = new Map<string, boolean>();

  // Process in batches to avoid overwhelming Firestore
  const batchSize = 50;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (userId) => {
        const canAppear = await canAppearInDiscovery(userId);
        eligibilityMap.set(userId, canAppear);
      })
    );
  }

  return eligibilityMap;
}