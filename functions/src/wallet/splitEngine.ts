import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * SPLIT ENGINE — Canonical Monetization v2
 *
 * SINGLE SOURCE OF TRUTH for all revenue splits across AVALO.
 *
 * HARD RULES (LOCKED — NO EXCEPTIONS):
 *   DEFAULT (media, tips, gifts, calls, user-AI): 65% Creator / 35% Avalo
 *   CALENDAR / MEETINGS / EVENTS:                 80% Creator / 20% Avalo
 *   CREATOR SUBSCRIPTIONS:                        70% Creator / 30% Avalo
 *   AVALO-OWNED AI:                               0%  Creator / 100% Avalo
 *   BOOST / PAID VISIBILITY:                      0%  Creator / 100% Avalo
 *   ROYAL MEMBERSHIP:                             0%  Creator / 100% Avalo
 *
 * ENFORCEMENT:
 *   - No feature may define its own split locally.
 *   - All monetization flows MUST call SplitEngine.computeSplit().
 *   - No discounts, promo codes, free token grants, or dynamic splits.
 *   - All split amounts are integer tokens (floor to earner, remainder to Avalo).
 *
 * @module wallet/splitEngine
 */

import { LedgerEntryType } from './types';

// ============================================================================
// SPLIT CATEGORY — Maps feature types to split percentages
// ============================================================================

/**
 * All monetization feature categories recognized by the SplitEngine.
 */
export type MonetizationFeature =
  | 'MEDIA_UNLOCK'
  | 'TIP'
  | 'GIFT'
  | 'CALL_BILL'
  | 'SUBSCRIPTION_PAYMENT'
  | 'ROYAL_MEMBERSHIP'
  | 'CALENDAR_BOOK'
  | 'EVENT_TICKET'
  | 'AI_COMPANION_AVALO'
  | 'AI_COMPANION_USER'
  | 'BOOST_IMPRESSION';

/**
 * Split definition: percentages as integers (must sum to 100).
 */
export interface SplitDefinition {
  readonly earnerPercent: number;
  readonly platformPercent: number;
}

/**
 * Computed split result: integer token amounts.
 */
export interface ComputedSplit {
  readonly creatorTokens: number;
  readonly avaloTokens: number;
  readonly totalTokens: number;
  readonly feature: MonetizationFeature;
}

// ============================================================================
// LOCKED SPLIT DEFINITIONS — IMMUTABLE
// ============================================================================

/**
 * Canonical split percentages per feature.
 * These are LOCKED and MUST NOT be changed without executive approval.
 *
 * Enforcement: module-load-time validation at bottom of file.
 */
const SPLIT_DEFINITIONS: Readonly<Record<MonetizationFeature, SplitDefinition>> = {
  // DEFAULT: 65% Creator / 35% Avalo
  MEDIA_UNLOCK:          { earnerPercent: 65, platformPercent: 35 },
  TIP:                   { earnerPercent: 65, platformPercent: 35 },
  GIFT:                  { earnerPercent: 65, platformPercent: 35 },
  CALL_BILL:             { earnerPercent: 65, platformPercent: 35 },
  AI_COMPANION_USER:     { earnerPercent: 65, platformPercent: 35 },

  // CALENDAR / MEETINGS / EVENTS: 80% Creator / 20% Avalo
  CALENDAR_BOOK:         { earnerPercent: 80, platformPercent: 20 },
  EVENT_TICKET:          { earnerPercent: 80, platformPercent: 20 },

  // CREATOR SUBSCRIPTIONS: 70% Creator / 30% Avalo
  SUBSCRIPTION_PAYMENT:  { earnerPercent: 70, platformPercent: 30 },

  // 100% AVALO — No earner payout
  AI_COMPANION_AVALO:    { earnerPercent: 0,  platformPercent: 100 },
  BOOST_IMPRESSION:      { earnerPercent: 0,  platformPercent: 100 },
  ROYAL_MEMBERSHIP:      { earnerPercent: 0,  platformPercent: 100 },
} as const;

// ============================================================================
// MODULE-LOAD VALIDATION — Prevents tampered splits from reaching production
// ============================================================================

(function validateSplitDefinitions(): void {
  for (const [feature, def] of Object.entries(SPLIT_DEFINITIONS)) {
    if (def.earnerPercent + def.platformPercent !== 100) {
      throw new Error(
        `[SplitEngine] CRITICAL: Split for ${feature} does not sum to 100% ` +
        `(${def.earnerPercent} + ${def.platformPercent} = ${def.earnerPercent + def.platformPercent})`,
      );
    }
    if (def.earnerPercent < 0 || def.platformPercent < 0) {
      throw new Error(
        `[SplitEngine] CRITICAL: Negative split for ${feature}: ` +
        `earner=${def.earnerPercent}, platform=${def.platformPercent}`,
      );
    }
    if (!Number.isInteger(def.earnerPercent) || !Number.isInteger(def.platformPercent)) {
      throw new Error(
        `[SplitEngine] CRITICAL: Non-integer split for ${feature}: ` +
        `earner=${def.earnerPercent}, platform=${def.platformPercent}`,
      );
    }
  }
})();

// ============================================================================
// CORE COMPUTATION
// ============================================================================

/**
 * Compute the integer token split for a given feature and total token amount.
 *
 * Rounding rule: Avalo gets floor of its percentage; earner gets the remainder.
 * This ensures earner gets the benefit of any rounding and tokens are conserved.
 *
 * @param feature — The monetization feature type.
 * @param totalTokens — The total tokens to split (must be a positive integer).
 * @returns ComputedSplit with integer creatorTokens + avaloTokens = totalTokens.
 * @throws Error if totalTokens is not a positive integer.
 */
export function computeSplit(
  feature: MonetizationFeature,
  totalTokens: number,
): ComputedSplit {
  if (!Number.isInteger(totalTokens) || totalTokens <= 0) {
    throw new Error(
      `[SplitEngine] totalTokens must be a positive integer, got: ${totalTokens}`,
    );
  }

  const def = SPLIT_DEFINITIONS[feature];

  // Avalo gets floor; earner gets remainder to conserve total
  const avaloTokens = Math.floor(totalTokens * def.platformPercent / 100);
  const creatorTokens = totalTokens - avaloTokens;

  // Invariant: sum must equal total
  if (creatorTokens + avaloTokens !== totalTokens) {
    throw new Error(
      `[SplitEngine] FATAL: Split arithmetic failure for ${feature}: ` +
      `${creatorTokens} + ${avaloTokens} ≠ ${totalTokens}`,
    );
  }

  return {
    creatorTokens,
    avaloTokens,
    totalTokens,
    feature,
  };
}

// ============================================================================
// FEATURE → LEDGER TYPE MAPPING
// ============================================================================

/**
 * Map a MonetizationFeature to its canonical LedgerEntryType.
 * Used to ensure ledger entries use the correct type.
 */
export function featureToLedgerType(feature: MonetizationFeature): LedgerEntryType {
  const mapping: Record<MonetizationFeature, LedgerEntryType> = {
    MEDIA_UNLOCK:          'MEDIA_UNLOCK',
    TIP:                   'TIP',
    GIFT:                  'GIFT',
    CALL_BILL:             'CALL_BILL',
    SUBSCRIPTION_PAYMENT:  'SUBSCRIPTION_PAYMENT',
    ROYAL_MEMBERSHIP:      'ROYAL_MEMBERSHIP',
    CALENDAR_BOOK:         'CALENDAR_BOOK',
    EVENT_TICKET:          'EVENT_TICKET',
    AI_COMPANION_AVALO:    'CALL_BILL',   // AI sessions use CALL_BILL ledger type
    AI_COMPANION_USER:     'CALL_BILL',   // AI sessions use CALL_BILL ledger type
    BOOST_IMPRESSION:      'BOOST_IMPRESSION',
  };
  return mapping[feature];
}

// ============================================================================
// READ-ONLY ACCESSORS
// ============================================================================

/**
 * Get the split definition for a feature (read-only).
 */
export function getSplitDefinition(feature: MonetizationFeature): Readonly<SplitDefinition> {
  return SPLIT_DEFINITIONS[feature];
}

/**
 * Get all split definitions (read-only).
 */
export function getAllSplitDefinitions(): Readonly<Record<MonetizationFeature, SplitDefinition>> {
  return SPLIT_DEFINITIONS;
}

/**
 * Check if a feature has any earner payout.
 */
export function hasCreatorPayout(feature: MonetizationFeature): boolean {
  return SPLIT_DEFINITIONS[feature].earnerPercent > 0;
}

/**
 * Check if a feature is 100% Avalo (no earner split).
 */
export function isAvaloOnly(feature: MonetizationFeature): boolean {
  return SPLIT_DEFINITIONS[feature].platformPercent === 100;
}




























