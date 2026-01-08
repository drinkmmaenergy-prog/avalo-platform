/**
 * Test Data Utilities
 * Creates consistent test data for all test types
 */

import type { ChatParticipantContext } from '../../src/chatMonetization';

/**
 * Create a test user context with default values
 */
export function createTestUser(overrides: Partial<ChatParticipantContext> = {}): ChatParticipantContext {
  return {
    userId: `test_user_${Date.now()}`,
    gender: 'male',
    earnOnChat: false,
    influencerBadge: false,
    isRoyalMember: false,
    popularity: 'mid',
    accountAgeDays: 30,
    ...overrides,
  };
}

/**
 * Create a test male user
 */
export function createTestMale(overrides: Partial<ChatParticipantContext> = {}): ChatParticipantContext {
  return createTestUser({
    gender: 'male',
    ...overrides,
  });
}

/**
 * Create a test female user
 */
export function createTestFemale(overrides: Partial<ChatParticipantContext> = {}): ChatParticipantContext {
  return createTestUser({
    gender: 'female',
    ...overrides,
  });
}

/**
 * Create a test influencer
 */
export function createTestInfluencer(overrides: Partial<ChatParticipantContext> = {}): ChatParticipantContext {
  return createTestUser({
    influencerBadge: true,
    earnOnChat: true,
    popularity: 'high',
    ...overrides,
  });
}

/**
 * Create a test Royal member
 */
export function createTestRoyal(overrides: Partial<ChatParticipantContext> = {}): ChatParticipantContext {
  return createTestUser({
    isRoyalMember: true,
    ...overrides,
  });
}

/**
 * Create a new user (0-5 days old)
 */
export function createNewUser(overrides: Partial<ChatParticipantContext> = {}): ChatParticipantContext {
  return createTestUser({
    accountAgeDays: 3,
    ...overrides,
  });
}

/**
 * Create a low popularity user (free pool eligible)
 */
export function createLowPopularityUser(overrides: Partial<ChatParticipantContext> = {}): ChatParticipantContext {
  return createTestUser({
    popularity: 'low',
    earnOnChat: false,
    accountAgeDays: 10,
    ...overrides,
  });
}

/**
 * Mark data as test data for Firestore
 */
export function markAsTestData<T extends Record<string, any>>(data: T): T & { isTestAccount: boolean } {
  return {
    ...data,
    isTestAccount: true,
  };
}

/**
 * Generate test wallet data
 */
export function createTestWallet(balance: number = 1000) {
  return markAsTestData({
    balance,
    earned: 0,
    pending: 0,
    spent: 0,
    updatedAt: new Date(),
  });
}

/**
 * Generate test chat ID
 */
export function generateTestChatId(): string {
  return `test_chat_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Generate test user ID
 */
export function generateTestUserId(): string {
  return `test_user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Generate test event ID
 */
export function generateTestEventId(): string {
  return `test_event_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Create test Stripe keys
 */
export const TEST_STRIPE_KEYS = {
  publishableKey: 'pk_test_mock_key',
  secretKey: 'sk_test_mock_key',
};

/**
 * Create test AI API keys
 */
export const TEST_AI_KEYS = {
  anthropic: 'sk-ant-test-mock',
  openai: 'sk-test-mock',
};