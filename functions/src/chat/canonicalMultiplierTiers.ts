/**
 * AVALO — C6: Multiplier Tiers, Creator Badges, Rate Negotiation, Session-End Flow
 *
 * This module defines:
 *   1. Full multiplier tier table (x1→x100) with badge requirements
 *   2. Creator badge hierarchy (Verified → Rising → Pro → Elite → Apex)
 *   3. KYC gate mapping (x50+ requires ENHANCED KYC via C2 requireEnhancedKYC)
 *   4. Rate-renewal negotiation flow (RATE_PROPOSED state)
 *   5. Session-end proposal flow (END_PROPOSED state)
 *   6. Creator chat config management (per-session multiplier, minimum entry)
 *
 * ── Rate model (§0.3) ───────────────────────────────────────────────────────
 *   finalChargedTokens = BASE_CREATOR_RESPONSE_RATE_TOKENS × multiplier
 *   BASE_CREATOR_RESPONSE_RATE_TOKENS = 3
 *
 *   x1  →  3 tokens/response    ($0.096/response net)
 *   x2  →  6 tokens             ($0.192/response net)
 *   x3  →  9 tokens             ($0.288/response net)
 *   x4  →  12 tokens            ($0.384/response net)
 *   x5  →  15 tokens            ($0.48/response net)
 *   x7  →  21 tokens            ($0.672/response net)
 *   x10 →  30 tokens            ($0.96/response net)
 *   x12 →  36 tokens            ($1.152/response net)
 *   x15 →  45 tokens            ($1.44/response net)
 *   x20 →  60 tokens            ($1.92/response net)
 *   x30 →  90 tokens            ($2.88/response net)
 *   x50 →  150 tokens           ($4.80/response net) ← ENHANCED KYC required
 *   x70 →  210 tokens           ($6.72/response net) ← ENHANCED KYC required
 *   x100 → 300 tokens           ($9.60/response net) ← ENHANCED KYC required
 *
 *   Net per response = finalChargedTokens × $0.04 × 0.80 (Avalo 20% at payout)
 *
 * ── Badge hierarchy ─────────────────────────────────────────────────────────
 *   Verified → Rising Star → Pro → Elite → Apex
 *   Stored in users/{uid}.creatorBadge (set server-only by admin/AI Coach signals)
 *   Unlocks multiplier tiers and discovery boost
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  requireEnhancedKYC,
  requireCreatorKYC,
  requireVerifiedAdult,
} from '../compliance/ageGuard';
import {
  BASE_CREATOR_RESPONSE_RATE_TOKENS,
} from '../creator/canonicalEarningService';
import {
  computeReservationAmount,
} from '../wallet/walletService';
import type { C5ChatState, C5SessionConfig } from './canonicalChatStateMachineV3';

// ─────────────────────────────────────────────────────────────────────────────
// Multiplier tier table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical commercial multipliers: [2,3,5,7,10,20,30,50,70,100].
 * x1 = migration fallback only (not selectable commercially, visibleToFan=false).
 * x4 / x12 / x15 / x25 / x40 / x75 are FORBIDDEN per §1.2 and removed.
 */
export type CanonicalMultiplier = 1|2|3|5|7|10|20|30|50|70|100;

export const ALL_MULTIPLIERS: CanonicalMultiplier[] = [
  1, 2, 3, 5, 7, 10, 20, 30, 50, 70, 100,
];

export type CreatorBadge =
  | 'NONE'         // unverified / no badge (x1 migration fallback only)
  | 'VERIFIED'     // identity verified, age verified → max x3
  | 'RISING'       // Rising creator — quality signals → max x7
  | 'PRO'          // Professional creator — KYC → max x10
  | 'ELITE'        // Elite creator — STANDARD KYC → max x20
  | 'ICON'         // Icon creator — ENHANCED KYC → max x50
  | 'APEX';        // Apex tier — ENHANCED KYC + manual review → max x100

/**
 * KYC requirement per multiplier.
 * NONE = only requireVerifiedAdult
 * BASIC = requireCreatorKYC
 * ENHANCED = requireEnhancedKYC
 */
export type MultiplierKYCRequirement = 'VERIFIED_ADULT' | 'CREATOR_KYC' | 'ENHANCED_KYC';

export interface MultiplierTierSpec {
  multiplier: CanonicalMultiplier;
  /** tokens charged per creator response */
  finalRateTokens: number;
  /** gross USD per response at $0.04/token */
  grossUsdPerResponse: number;
  /** net USD per response after 20% Avalo commission */
  netUsdPerResponse: number;
  /** minimum creator badge required */
  minBadge: CreatorBadge;
  /** KYC gate */
  kycRequired: MultiplierKYCRequirement;
  /** whether this tier is visible to fans as a pricing option */
  visibleToFan: boolean;
  /**
   * If true, creator must have a server-side manual approval record in
   * `creatorMultiplierApprovals/{uid}` with fields:
   *   reviewer: string, approvedAt: Timestamp, reason: string, revoked: boolean, revokedAt?: Timestamp
   * Approval is checked at session start inside assertMultiplierEligibility().
   */
  manualApprovalRequired: boolean;
}

const USD_PER_TOKEN = 0.04;
const NET_RATE      = 0.80;   // after 20% Avalo commission

function spec(
  m: CanonicalMultiplier,
  minBadge: CreatorBadge,
  kycRequired: MultiplierKYCRequirement,
): MultiplierTierSpec {
  const finalRateTokens     = BASE_CREATOR_RESPONSE_RATE_TOKENS * m;
  const grossUsdPerResponse = Math.round(finalRateTokens * USD_PER_TOKEN * 1_000_000) / 1_000_000;
  const netUsdPerResponse   = Math.round(grossUsdPerResponse * NET_RATE * 1_000_000) / 1_000_000;
  return { multiplier: m, finalRateTokens, grossUsdPerResponse, netUsdPerResponse, minBadge, kycRequired, visibleToFan: true, manualApprovalRequired: false };
}

/**
 * Like spec(), but sets manualApprovalRequired=true.
 * Used for APEX x70/x100 which require Enhanced KYC + manual reviewer approval
 * stored server-side in `creatorMultiplierApprovals/{uid}`.
 */
function specManual(
  m: CanonicalMultiplier,
  minBadge: CreatorBadge,
  kycRequired: MultiplierKYCRequirement,
): MultiplierTierSpec {
  return { ...spec(m, minBadge, kycRequired), manualApprovalRequired: true };
}

/**
 * Badge ceilings (§1.2):
 *   VERIFIED     → max x3   (commercial: x2, x3)
 *   RISING       → max x7   (commercial: x5, x7)
 *   PRO          → max x10  (commercial: x10)
 *   ELITE        → max x20  (commercial: x20)
 *   ICON         → max x50  (commercial: x30, x50)  ENHANCED_KYC required
 *   APEX         → max x100 (commercial: x70, x100) ENHANCED_KYC required
 * x1 = migration fallback; visibleToFan=false, not a commercial tier.
 */
export const MULTIPLIER_TIERS: Record<CanonicalMultiplier, MultiplierTierSpec> = {
  1:   { ...spec(1,   'NONE',        'VERIFIED_ADULT'), visibleToFan: false }, // migration fallback ONLY
  2:   spec(2,   'VERIFIED',    'VERIFIED_ADULT'),
  3:   spec(3,   'VERIFIED',    'VERIFIED_ADULT'),
  5:   spec(5,   'RISING', 'CREATOR_KYC'),
  7:   spec(7,   'RISING', 'CREATOR_KYC'),
  10:  spec(10,  'PRO',         'CREATOR_KYC'),
  20:  spec(20,  'ELITE',       'CREATOR_KYC'),
  30:  spec(30,  'ICON',        'ENHANCED_KYC'),
  50:  spec(50,  'ICON',        'ENHANCED_KYC'),
  70:  specManual(70,  'APEX', 'ENHANCED_KYC'),  // requires server-side manual approval
  100: specManual(100, 'APEX', 'ENHANCED_KYC'), // requires server-side manual approval
};

/**
 * Badge hierarchy order (lower index = lower tier).
 */
export const BADGE_ORDER: CreatorBadge[] = [
  'NONE', 'VERIFIED', 'RISING', 'PRO', 'ELITE', 'ICON', 'APEX',
];

function badgeRank(badge: CreatorBadge): number {
  return BADGE_ORDER.indexOf(badge);
}

// ─────────────────────────────────────────────────────────────────────────────
// Multiplier validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that a creator is eligible for the requested multiplier.
 * Enforces badge rank AND KYC level checks.
 *
 * @throws HttpsError if not eligible
 */
export async function assertMultiplierEligibility(
  creatorId: string,
  multiplier: CanonicalMultiplier,
): Promise<MultiplierTierSpec> {
  if (!MULTIPLIER_TIERS[multiplier]) {
    throw new HttpsError('invalid-argument',
      `INVALID_MULTIPLIER: ${multiplier} is not a valid multiplier tier`);
  }

  const db = getFirestore();

  // Read server-side overrides (§4: all thresholds configurable server-side)
  const overrides = await getBadgeThresholdConfig();
  const tierSpec  = await resolveEffectiveTierSpec(multiplier, overrides);

  if ((tierSpec as any).disabled) {
    throw new HttpsError('invalid-argument',
      `MULTIPLIER_DISABLED: x${multiplier} has been disabled by server configuration`);
  }

  // Read creator badge from Firestore
  const userSnap = await db.collection('users').doc(creatorId).get();
  if (!userSnap.exists) {
    throw new HttpsError('not-found', `Creator ${creatorId} not found`);
  }
  const user = userSnap.data() as { creatorBadge?: CreatorBadge };
  const creatorBadge: CreatorBadge = user.creatorBadge ?? 'NONE';

  // Check badge rank (using effective spec — may be overridden server-side)
  if (badgeRank(creatorBadge) < badgeRank(tierSpec.minBadge)) {
    throw new HttpsError('permission-denied',
      `BADGE_REQUIRED: Multiplier x${multiplier} requires ${tierSpec.minBadge} badge. ` +
      `Creator has ${creatorBadge}.`);
  }

  // Check KYC level (using effective spec)
  switch (tierSpec.kycRequired) {
    case 'VERIFIED_ADULT':
      await requireVerifiedAdult(creatorId);
      break;
    case 'CREATOR_KYC':
      await requireCreatorKYC(creatorId);
      break;
    case 'ENHANCED_KYC':
      await requireEnhancedKYC(creatorId);
      break;
  }

  // Manual approval gate (x70/x100 — APEX + Enhanced KYC + server-side human approval)
  if (tierSpec.manualApprovalRequired) {
    const approvalSnap = await db.collection('creatorMultiplierApprovals').doc(creatorId).get();
    const approval = approvalSnap.exists ? approvalSnap.data() as CreatorMultiplierApproval : null;
    if (!approval || approval.revoked || approval.multiplier < multiplier) {
      throw new HttpsError('permission-denied',
        `MANUAL_APPROVAL_REQUIRED: x${multiplier} requires Apex badge + Enhanced KYC + ` +
        `manual approval stored in creatorMultiplierApprovals/${creatorId}. ` +
        `Contact Avalo trust & safety team.`
      );
    }
  }

  return tierSpec;
}

/**
 * Get all multiplier tiers available to a creator given their badge.
 * Returns an empty array for unverified creators (badge='NONE' gets x1-x3).
 */
export function getAvailableMultipliers(creatorBadge: CreatorBadge): MultiplierTierSpec[] {
  return ALL_MULTIPLIERS
    .map(m => MULTIPLIER_TIERS[m])
    .filter(t => badgeRank(creatorBadge) >= badgeRank(t.minBadge));
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Server-side badge threshold config (§4 — all thresholds configurable server-side)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-side override document: `_config/badgeThresholds`.
 * If present, these override the compile-time defaults in MULTIPLIER_TIERS.
 * Only Avalo admin can write to `_config/` (locked by Firestore rules).
 * Allows adjusting badge ceilings, KYC requirements, and multiplier availability
 * without a code deployment.
 */
export interface BadgeThresholdConfig {
  /** If set, overrides MULTIPLIER_TIERS[m].minBadge for each listed multiplier */
  multiplierBadgeOverrides?: Partial<Record<CanonicalMultiplier, CreatorBadge>>;
  /** If set, overrides MULTIPLIER_TIERS[m].kycRequired for each listed multiplier */
  multiplierKycOverrides?: Partial<Record<CanonicalMultiplier, MultiplierKYCRequirement>>;
  /** If set to true for a multiplier, disables it globally (returns INVALID_MULTIPLIER) */
  multiplierDisabled?: Partial<Record<CanonicalMultiplier, boolean>>;
  updatedAt: FirebaseFirestore.Timestamp;
  updatedBy: string; // admin UID
}

/**
 * Manual approval record for APEX x70/x100.
 * Written to `creatorMultiplierApprovals/{uid}` by Avalo trust & safety team.
 * Creator cannot write this document (locked by Firestore rules).
 */
export interface CreatorMultiplierApproval {
  creatorId:      string;
  multiplier:     70 | 100;
  reviewer:       string;       // reviewer UID
  approvedAt:     FirebaseFirestore.Timestamp;
  reason:         string;       // why this creator was approved
  revoked:        boolean;
  revokedAt?:     FirebaseFirestore.Timestamp;
  revokedBy?:     string;       // revoker UID
  revokeReason?:  string;
}

/**
 * Read server-side badge threshold overrides (if any).
 * Returns null if no overrides exist — compile-time defaults apply.
 */
export async function getBadgeThresholdConfig(): Promise<BadgeThresholdConfig | null> {
  const db = getFirestore();
  const snap = await db.collection('_config').doc('badgeThresholds').get();
  return snap.exists ? (snap.data() as BadgeThresholdConfig) : null;
}

/**
 * Resolve the effective tier spec for a multiplier, applying server-side overrides.
 */
async function resolveEffectiveTierSpec(
  multiplier: CanonicalMultiplier,
  overrides: BadgeThresholdConfig | null,
): Promise<MultiplierTierSpec & { disabled?: boolean }> {
  const base = { ...MULTIPLIER_TIERS[multiplier] };
  if (!overrides) return base;

  if (overrides.multiplierDisabled?.[multiplier]) {
    return { ...base, disabled: true };
  }
  if (overrides.multiplierBadgeOverrides?.[multiplier]) {
    base.minBadge = overrides.multiplierBadgeOverrides[multiplier]!;
  }
  if (overrides.multiplierKycOverrides?.[multiplier]) {
    base.kycRequired = overrides.multiplierKycOverrides[multiplier]!;
  }
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Creator chat config (per-creator, set before session)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatorChatConfig {
  creatorId: string;
  /** Multiplier for the NEXT paid session (default 1). */
  defaultMultiplier: CanonicalMultiplier;
  /** Creator-configured minimum session entry in tokens (0 = use system default). */
  minimumSessionEntry: number;
  /** Whether chat is open for new sessions. */
  chatEnabled: boolean;
  /** Optional custom greeting message. */
  greetingMessage?: string;
  updatedAt: FirebaseFirestore.Timestamp | FieldValue;
}

/**
 * Read a creator's chat config. Returns a safe default if not set.
 */
export async function getCreatorChatConfig(creatorId: string): Promise<CreatorChatConfig> {
  const db = getFirestore();
  const snap = await db.collection('creatorChatConfigs').doc(creatorId).get();
  if (!snap.exists) {
    return {
      creatorId,
      defaultMultiplier: 1,
      minimumSessionEntry: 0,
      chatEnabled: true,
      updatedAt: new Date() as any,
    };
  }
  return snap.data() as CreatorChatConfig;
}

/**
 * Set a creator's chat config.
 * Validates that the multiplier is eligible for the creator's badge/KYC.
 */
export async function setCreatorChatConfig(params: {
  creatorId: string;
  defaultMultiplier: CanonicalMultiplier;
  minimumSessionEntry?: number;
  chatEnabled?: boolean;
  greetingMessage?: string;
}): Promise<void> {
  const { creatorId, defaultMultiplier, minimumSessionEntry = 0, chatEnabled = true, greetingMessage } = params;

  // Validate eligibility for the requested multiplier
  await assertMultiplierEligibility(creatorId, defaultMultiplier);

  if (!Number.isInteger(minimumSessionEntry) || minimumSessionEntry < 0) {
    throw new HttpsError('invalid-argument', 'minimumSessionEntry must be a non-negative integer');
  }

  const db = getFirestore();
  await db.collection('creatorChatConfigs').doc(creatorId).set({
    creatorId,
    defaultMultiplier,
    minimumSessionEntry,
    chatEnabled,
    ...(greetingMessage !== undefined && { greetingMessage }),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate negotiation: RATE_PROPOSED state
// ─────────────────────────────────────────────────────────────────────────────

export type RateProposalStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'COUNTEROFFERED' | 'COUNTER_ACCEPTED' | 'COUNTER_DECLINED';

export interface RateProposal {
  proposalId: string;
  chatId: string;
  proposedBy: 'CREATOR';   // only creator can propose a rate change mid-session
  currentMultiplier: CanonicalMultiplier;
  proposedMultiplier: CanonicalMultiplier;
  proposedFinalRateTokens: number;
  proposedReservationAmount: number;
  status: RateProposalStatus;
  /** Fan counteroffer multiplier (set when fan uses COUNTEROFFERED resolution). */
  fanCounterMultiplier?: CanonicalMultiplier;
  /** Whether fan has already used their one counteroffer for this proposal. */
  counterofferUsed: boolean;
  createdAt: FirebaseFirestore.Timestamp | FieldValue;
  expiresAt: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp | FieldValue;
}

/** Rate proposals expire after 10 minutes if fan doesn't respond. */
export const RATE_PROPOSAL_EXPIRY_MS = 10 * 60 * 1000;

/**
 * Creator proposes a new multiplier for the NEXT session.
 * Transitions chat to RATE_PROPOSED state.
 * Fan must accept or decline within RATE_PROPOSAL_EXPIRY_MS.
 *
 * Note: Does NOT change the current session's rate.
 * The new rate applies only if the fan accepts and the next session opens.
 */
export async function proposeRateChange(params: {
  chatId: string;
  creatorId: string;
  fanId: string;
  currentMultiplier: CanonicalMultiplier;
  proposedMultiplier: CanonicalMultiplier;
  /** Must pass at least one trigger condition (§1.6). */
  triggerCondition: 'TIME_ELAPSED' | 'RESPONSE_COUNT' | 'BUDGET_NEAR_EXHAUSTION' | 'FAN_REQUESTED';
}): Promise<RateProposal> {
  const { chatId, creatorId, fanId, currentMultiplier, proposedMultiplier, triggerCondition } = params;

  // ── §1.6 Trigger guards — creator may propose rate change only when a condition is met ──
  const db2 = getFirestore();
  const chatSnap = await db2.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) throw new HttpsError('not-found', `Chat ${chatId} not found`);
  const chat = chatSnap.data() as { sessionConfig?: { reservationAmount: number }; paidResponseCount?: number; sessionStartedAt?: any; remainingReservedTokens?: number; state?: string };

  const paidResponseCount      = chat.paidResponseCount ?? 0;
  const reservationAmount      = chat.sessionConfig?.reservationAmount ?? 0;
  const remainingTokens        = chat.remainingReservedTokens ?? 0;
  const budgetPct              = reservationAmount > 0 ? (reservationAmount - remainingTokens) / reservationAmount : 0;
  const sessionStartedAt       = chat.sessionStartedAt?.toDate?.() ?? new Date(0);
  const hoursElapsed           = (Date.now() - sessionStartedAt.getTime()) / (1000 * 60 * 60);

  const triggerMet = (() => {
    switch (triggerCondition) {
      case 'TIME_ELAPSED':         return hoursElapsed >= 24;
      case 'RESPONSE_COUNT':       return paidResponseCount >= 30;
      case 'BUDGET_NEAR_EXHAUSTION': return budgetPct >= 0.80;
      case 'FAN_REQUESTED':        return true; // fan explicitly requested negotiation
    }
  })();
  if (!triggerMet) {
    throw new HttpsError('failed-precondition',
      `RATE_NEGOTIATION_TRIGGER_NOT_MET: ${triggerCondition} condition not satisfied. ` +
      `hours=${hoursElapsed.toFixed(1)}, responses=${paidResponseCount}, budgetPct=${(budgetPct*100).toFixed(0)}%`);
  }

  // Validate the proposed multiplier is eligible
  await assertMultiplierEligibility(creatorId, proposedMultiplier);

  const db = getFirestore();
  const proposalId         = db.collection('rateProposals').doc().id;
  const expiresAt          = new Date(Date.now() + RATE_PROPOSAL_EXPIRY_MS);
  const tierSpec           = MULTIPLIER_TIERS[proposedMultiplier];
  const proposedReservation = computeReservationAmount(tierSpec.finalRateTokens, 0);

  const proposal: RateProposal = {
    proposalId,
    chatId,
    proposedBy: 'CREATOR',
    currentMultiplier,
    proposedMultiplier,
    proposedFinalRateTokens:    tierSpec.finalRateTokens,
    proposedReservationAmount:  proposedReservation,
    status: 'PENDING',
    counterofferUsed: false,
    createdAt:  FieldValue.serverTimestamp(),
    expiresAt:  new Date(Date.now() + RATE_PROPOSAL_EXPIRY_MS) as any,
  };

  // Write proposal + transition chat state
  const batch = db.batch();
  batch.set(db.collection('rateProposals').doc(proposalId), proposal);
  batch.update(db.collection('chats').doc(chatId), {
    state:              'RATE_PROPOSED' as C5ChatState,
    activeRateProposal: proposalId,
    updatedAt:          FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return proposal;
}

/**
 * Fan responds to a rate proposal.
 * ACCEPTED → proposal stored; next openPaidSession() uses new rate.
 * DECLINED → chat returns to PAID_ACTIVE with current rate.
 * EXPIRED  → auto-decline (called by C7 scheduler).
 */
export async function resolveRateProposal(params: {
  chatId: string;
  proposalId: string;
  resolution: 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  fanId: string;
}): Promise<void> {
  const { chatId, proposalId, resolution, fanId } = params;

  const db = getFirestore();
  const proposalRef = db.collection('rateProposals').doc(proposalId);
  const proposalSnap = await proposalRef.get();

  if (!proposalSnap.exists) {
    throw new HttpsError('not-found', `Rate proposal ${proposalId} not found`);
  }
  const proposal = proposalSnap.data() as RateProposal;
  if (proposal.status !== 'PENDING') {
    throw new HttpsError('failed-precondition',
      `Rate proposal ${proposalId} is already ${proposal.status}`);
  }

  const batch = db.batch();
  batch.update(proposalRef, {
    status:     resolution,
    resolvedAt: FieldValue.serverTimestamp(),
  });

  if (resolution === 'ACCEPTED') {
    // Store accepted rate on the chat for the next session
    batch.update(db.collection('chats').doc(chatId), {
      state:                    'PAID_ACTIVE' as C5ChatState,
      activeRateProposal:       null,
      pendingMultiplier:        proposal.proposedMultiplier,
      updatedAt:                FieldValue.serverTimestamp(),
    });
  } else {
    // Return to PAID_ACTIVE with unchanged rate
    batch.update(db.collection('chats').doc(chatId), {
      state:             'PAID_ACTIVE' as C5ChatState,
      activeRateProposal: null,
      updatedAt:         FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}

// ─────────────────────────────────────────────────────────────────────────────
// Session-end proposal: END_PROPOSED state
// ─────────────────────────────────────────────────────────────────────────────

export interface EndProposal {
  proposalId: string;
  chatId: string;
  proposedBy: string;         // userId of proposer
  proposerRole: 'FAN' | 'CREATOR';
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  createdAt: FirebaseFirestore.Timestamp | FieldValue;
  expiresAt: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp | FieldValue;
}

/**
 * End proposals expire after 120 minutes (§1.6).
 * Creator proposes normal end → payer has 120 min to respond or chat auto-closes.
 * Creator CANNOT abruptly end a normal chat solely because payer rejected a rate.
 */
export const END_PROPOSAL_EXPIRY_MS = 120 * 60 * 1000; // 120 minutes per §1.6

/**
 * Either party can propose ending the paid session.
 * Transitions chat to END_PROPOSED state.
 * If accepted → closePaidSession() is called.
 * If declined or expired → chat returns to PAID_ACTIVE.
 */
export async function proposeSessionEnd(params: {
  chatId: string;
  proposedBy: string;
  proposerRole: 'FAN' | 'CREATOR';
}): Promise<EndProposal> {
  const { chatId, proposedBy, proposerRole } = params;

  const db = getFirestore();
  const proposalId = db.collection('endProposals').doc().id;

  const proposal: EndProposal = {
    proposalId,
    chatId,
    proposedBy,
    proposerRole,
    status:    'PENDING',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + END_PROPOSAL_EXPIRY_MS) as any,
  };

  const batch = db.batch();
  batch.set(db.collection('endProposals').doc(proposalId), proposal);
  batch.update(db.collection('chats').doc(chatId), {
    state:             'END_PROPOSED' as C5ChatState,
    activeEndProposal: proposalId,
    updatedAt:         FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return proposal;
}

/**
 * Resolve an end proposal.
 *
 * ACCEPTED  → caller is responsible for calling closePaidSession() from C5.
 * DECLINED  → chat returns to PAID_ACTIVE.
 * EXPIRED   → chat returns to PAID_ACTIVE (C7 scheduler calls this).
 */
export async function resolveEndProposal(params: {
  chatId: string;
  proposalId: string;
  resolution: 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
}): Promise<{ accepted: boolean }> {
  const { chatId, proposalId, resolution } = params;

  const db = getFirestore();
  const proposalRef = db.collection('endProposals').doc(proposalId);
  const snap        = await proposalRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', `End proposal ${proposalId} not found`);
  }
  const proposal = snap.data() as EndProposal;
  if (proposal.status !== 'PENDING') {
    throw new HttpsError('failed-precondition',
      `End proposal is already ${proposal.status}`);
  }

  const batch = db.batch();
  batch.update(proposalRef, {
    status:     resolution,
    resolvedAt: FieldValue.serverTimestamp(),
  });

  if (resolution === 'ACCEPTED') {
    // Caller must call closePaidSession() — we only mark END_PROPOSED resolved
    batch.update(db.collection('chats').doc(chatId), {
      activeEndProposal: null,
      updatedAt:         FieldValue.serverTimestamp(),
    });
  } else {
    batch.update(db.collection('chats').doc(chatId), {
      state:             'PAID_ACTIVE' as C5ChatState,
      activeEndProposal: null,
      updatedAt:         FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return { accepted: resolution === 'ACCEPTED' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fan consent flow for session entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Consent record written when a fan explicitly acknowledges the session price
 * before entering a paid session. Required for multipliers x4 and above.
 */
export interface SessionConsentRecord {
  consentId: string;
  chatId: string;
  fanId: string;
  creatorId: string;
  multiplier: CanonicalMultiplier;
  finalRateTokens: number;
  reservationAmount: number;
  consentedAt: FirebaseFirestore.Timestamp | FieldValue;
}

/** Multiplier threshold requiring explicit fan consent before session entry. First non-VERIFIED-adult tier. */
export const CONSENT_REQUIRED_MULTIPLIER_THRESHOLD = 5;

/**
 * Record fan consent for a paid session at a given multiplier.
 * Must be called before openPaidSession() for multiplier >= 4.
 *
 * @returns consentId — pass to openPaidSession() for audit trail
 */
export async function recordSessionConsent(params: {
  chatId: string;
  fanId: string;
  creatorId: string;
  multiplier: CanonicalMultiplier;
}): Promise<string> {
  const { chatId, fanId, creatorId, multiplier } = params;

  const tierSpec         = MULTIPLIER_TIERS[multiplier];
  const reservationAmount = computeReservationAmount(tierSpec.finalRateTokens, 0);
  const db               = getFirestore();
  const consentId        = db.collection('sessionConsents').doc().id;

  await db.collection('sessionConsents').doc(consentId).set({
    consentId, chatId, fanId, creatorId, multiplier,
    finalRateTokens:   tierSpec.finalRateTokens,
    reservationAmount,
    consentedAt: FieldValue.serverTimestamp(),
  } as SessionConsentRecord);

  return consentId;
}

// ─────────────────────────────────────────────────────────────────────────────
//

// ─────────────────────────────────────────────────────────────────────────────
// Counteroffer functions (V2 addition — required by canonicalDirectChatCallables.ts)
// ─────────────────────────────────────────────────────────────────────────────

export async function submitFanCounteroffer(params: {
  chatId: string;
  proposalId: string;
  fanId: string;
  counterMultiplier: CanonicalMultiplier;
}): Promise<{ status: string; counterMultiplier: CanonicalMultiplier }> {
  const { chatId, proposalId, fanId, counterMultiplier } = params;
  const db = getFirestore();
  await db.collection('chatRateProposals').doc(proposalId).update({
    counterMultiplier,
    counterofferedBy:  fanId,
    counterofferedAt:  FieldValue.serverTimestamp(),
    status:            'COUNTEROFFERED',
  });
  return { status: 'COUNTEROFFERED', counterMultiplier };
}

export async function resolveCounteroffer(params: {
  chatId: string;
  proposalId: string;
  creatorId: string;
  resolution: 'ACCEPT' | 'DECLINE';
}): Promise<{ status: string }> {
  const { chatId, proposalId, creatorId, resolution } = params;
  const db = getFirestore();
  const status = resolution === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
  await db.collection('chatRateProposals').doc(proposalId).update({
    status,
    resolvedBy:  creatorId,
    resolvedAt:  FieldValue.serverTimestamp(),
  });
  return { status };
}

