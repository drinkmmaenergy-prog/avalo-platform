/**
 * PACK 50 — Royal Engine Tests
 * Unit tests for Royal Club tier computation
 */

import { computeRoyalTier, RoyalInput } from './royalEngine';

describe('Royal Engine - Tier Computation', () => {
  
  test('NONE tier - no spend, no subscription', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 0,
      spendLast90DaysTokens: 0,
      hasActiveRoyalSubscription: false,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('NONE');
    expect(result.source).toBe('NONE');
  });
  
  test('NONE tier - below Silver threshold', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 999,
      spendLast90DaysTokens: 999,
      hasActiveRoyalSubscription: false,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('NONE');
    expect(result.source).toBe('NONE');
  });
  
  test('SILVER tier - 1,000 to 4,999 tokens', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 2_500,
      spendLast90DaysTokens: 5_000,
      hasActiveRoyalSubscription: false,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_SILVER');
    expect(result.source).toBe('SPEND_BASED');
  });
  
  test('GOLD tier - 5,000 to 14,999 tokens', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 7_500,
      spendLast90DaysTokens: 15_000,
      hasActiveRoyalSubscription: false,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_GOLD');
    expect(result.source).toBe('SPEND_BASED');
  });
  
  test('PLATINUM tier - 15,000+ tokens', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 20_000,
      spendLast90DaysTokens: 50_000,
      hasActiveRoyalSubscription: false,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_PLATINUM');
    expect(result.source).toBe('SPEND_BASED');
  });
  
  test('Subscription grants GOLD - even with low spend', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 500, // Below Silver threshold
      spendLast90DaysTokens: 1_000,
      hasActiveRoyalSubscription: true,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_GOLD');
    expect(result.source).toBe('SUBSCRIPTION');
  });
  
  test('Subscription + high spend grants PLATINUM', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 15_000,
      spendLast90DaysTokens: 30_000,
      hasActiveRoyalSubscription: true,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_PLATINUM');
    expect(result.source).toBe('SUBSCRIPTION');
  });
  
  test('Subscription + medium spend stays GOLD', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 10_000, // Gold-level spend
      spendLast90DaysTokens: 20_000,
      hasActiveRoyalSubscription: true,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_GOLD');
    expect(result.source).toBe('SUBSCRIPTION');
  });
  
  test('Edge case - exactly 1,000 tokens grants SILVER', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 1_000,
      spendLast90DaysTokens: 1_000,
      hasActiveRoyalSubscription: false,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_SILVER');
    expect(result.source).toBe('SPEND_BASED');
  });
  
  test('Edge case - exactly 5,000 tokens grants GOLD', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 5_000,
      spendLast90DaysTokens: 10_000,
      hasActiveRoyalSubscription: false,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_GOLD');
    expect(result.source).toBe('SPEND_BASED');
  });
  
  test('Edge case - exactly 15,000 tokens grants PLATINUM', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 15_000,
      spendLast90DaysTokens: 30_000,
      hasActiveRoyalSubscription: false,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_PLATINUM');
    expect(result.source).toBe('SPEND_BASED');
  });
});

describe('Royal Engine - Tier Priority', () => {
  
  test('Subscription always overrides spend-based for Silver level', () => {
    // User has Silver-level spend but active subscription
    const input: RoyalInput = {
      spendLast30DaysTokens: 2_000, // Silver level
      spendLast90DaysTokens: 4_000,
      hasActiveRoyalSubscription: true,
    };
    
    const result = computeRoyalTier(input);
    
    // Should be GOLD from subscription, not SILVER from spend
    expect(result.tier).toBe('ROYAL_GOLD');
    expect(result.source).toBe('SUBSCRIPTION');
  });
  
  test('Subscription with zero spend still grants GOLD', () => {
    const input: RoyalInput = {
      spendLast30DaysTokens: 0,
      spendLast90DaysTokens: 0,
      hasActiveRoyalSubscription: true,
    };
    
    const result = computeRoyalTier(input);
    
    expect(result.tier).toBe('ROYAL_GOLD');
    expect(result.source).toBe('SUBSCRIPTION');
  });
});

console.log('✅ Royal Engine tests loaded - PACK 50');