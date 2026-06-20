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
  computeReservationAmount,
} from '../wallet/walletService';
import type { C5ChatState, C5SessionConfig } from './canonicalChatStateMachineV3';

// ─────────────────────────────────────────────────────────────────────────────
// Multiplier tier table
// ─────────────────────────────────────────────────────────────────────────────

export type CanonicalMultiplier = 1|2|3|4|5|7|10|12|15|20|30|50|70|100;

export const ALL_MULTIPLIERS: CanonicalMultiplier[] = [
  1, 2, 3, 4, 5, 7, 10, 12, 15, 20, 30, 50, 70, 100,
];

export type CreatorBadge =
  | 'NONE'         // unverified / no badge
  | 'VERIFIED'     // identity verified, age verified
  | 'RISING_STAR'  // 50+ paid sessions, quality signals passing
  | 'PRO'          // 200+ paid sessions, BASIC KYC
  | 'ELITE'        // 500+ paid sessions, STANDARD KYC
  | 'APEX';        // top tier, ENHANCED KYC, unlocks x50/x70/x100

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
  return { multiplier: m, finalRateTokens, grossUsdPerResponse, netUsdPerResponse, minBadge, kycRequired, visibleToFan: true };
}

export const MULTIPLIER_TIERS: Record<CanonicalMultiplier, MultiplierTierSpec> = {
  1:   spec(1,   'NONE',        'VERIFIED_ADULT'),
  2:   spec(2,   'NONE',        'VERIFIED_ADULT'),
  3:   spec(3,   'NONE',        'VERIFIED_ADULT'),
  4:   spec(4,   'VERIFIED',    'VERIFIED_ADULT'),
  5:   spec(5,   'VERIFIED',    'VERIFIED_ADULT'),
  7:   spec(7,   'RISING_STAR', 'CREATOR_KYC'),
  10:  spec(10,  'RISING_STAR', 'CREATOR_KYC'),
  12:  spec(12,  'PRO',         'CREATOR_KYC'),
  15:  spec(15,  'PRO',         'CREATOR_KYC'),
  20:  spec(20,  'ELITE',       'CREATOR_KYC'),
  30:  spec(30,  'ELITE',       'CREATOR_KYC'),
  50:  spec(50,  'APEX',        'ENHANCED_KYC'),
  70:  spec(70,  'APEX',        'ENHANCED_KYC'),
  100: spec(100, 'APEX',        'ENHANCED_KYC'),
};

/**
 * Badge hierarchy order (lower index = lower tier).
 */
export const BADGE_ORDER: CreatorBadge[] = [
  'NONE', 'VERIFIED', 'RISING_STAR', 'PRO', 'ELITE', 'APEX',
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
  const tierSpec = MULTIPLIER_TIERS[multiplier];
  if (!tierSpec) {
    throw new HttpsError('invalid-argument',
      `INVALID_MULTIPLIER: ${multiplier} is not a valid multiplier tier`);
  }

  // Read creator badge from Firestore
  const db = getFirestore();
  const userSnap = await db.collection('users').doc(creatorId).get();
  if (!userSnap.exists) {
    throw new HttpsError('not-found', `Creator ${creatorId} not found`);
  }
  const user = userSnap.data() as { creatorBadge?: CreatorBadge };
  const creatorBadge: CreatorBadge = user.creatorBadge ?? 'NONE';

  // Check badge rank
  if (badgeRank(creatorBadge) < badgeRank(tierSpec.minBadge)) {
    throw new HttpsError('permission-denied',
      `BADGE_REQUIRED: Multiplier x${multiplier} requires ${tierSpec.minBadge} badge. ` +
      `Creator has ${creatorBadge}.`);
  }

  // Check KYC level
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

export type RateProposalStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface RateProposal {
  proposalId: string;
  chatId: string;
  proposedBy: 'CREATOR';   // only creator can propose a rate change mid-session
  currentMultiplier: CanonicalMultiplier;
  proposedMultiplier: CanonicalMultiplier;
  proposedFinalRateTokens: number;
  proposedReservationAmount: number;
  status: RateProposalStatus;
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
}): Promise<RateProposal> {
  const { chatId, creatorId, fanId, currentMultiplier, proposedMultiplier } = params;

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

/** End proposals expire after 5 minutes. After expiry → session auto-resumes. */
export const END_PROPOSAL_EXPIRY_MS = 5 * 60 * 1000;

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

/** Multiplier threshold requiring explicit fan consent before session entry. */
export const CONSENT_REQUIRED_MULTIPLIER_THRESHOLD = 4;

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
