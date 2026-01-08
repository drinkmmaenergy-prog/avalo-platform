/**
 * PACK 108 — NSFW Monetization Safety
 *
 * RULES:
 * - Explicit content may be monetized only where legal
 * - No altering tokenomics (no premium multipliers, no discounts)
 * - Token price and 65/35 split remain untouched
 * - Paid unlock events generate normal earnings + commission
 * - Enforcement for violations
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  NSFWLevel,
  NSFWMonetizationCheck,
  NSFWMonetizationTransaction,
} from './pack108-types';
import { checkNSFWMonetization } from './pack108-compliance';
import { getUserSafetyPreferences } from './pack108-safety-preferences';
import { detectNSFWViolation } from './pack108-classification';

// Token economy constants (from core system - NEVER CHANGED)
const TOKEN_PRICE_USD = 0.10; // $0.10 per token
const CREATOR_SPLIT = 0.65; // 65% to creator
const PLATFORM_SPLIT = 0.35; // 35% to platform

// ============================================================================
// MONETIZATION CHECKS
// ============================================================================

/**
 * Check if NSFW content can be monetized for this transaction
 */
export async function checkNSFWMonetizationTransaction(
  buyerId: string,
  sellerId: string,
  contentId: string,
  nsfwLevel: NSFWLevel,
  tokenAmount: number
): Promise<NSFWMonetizationCheck> {
  try {
    console.log(`[PACK108] Checking NSFW monetization: buyer=${buyerId}, seller=${sellerId}, level=${nsfwLevel}`);

    // SAFE content always allowed
    if (nsfwLevel === 'SAFE') {
      return {
        allowed: true,
        buyerRegionAllows: true,
        buyerAgeVerified: true,
        buyerPreferencesAllow: true,
        sellerRegionAllows: true,
        sellerKYCVerified: true,
        appStoreAllows: true,
        pspAllows: true,
        checkedAt: serverTimestamp() as Timestamp,
        buyerRegion: 'N/A',
        sellerRegion: 'N/A',
      };
    }

    // BANNED content never monetizable
    if (nsfwLevel === 'BANNED') {
      return {
        allowed: false,
        buyerRegionAllows: false,
        buyerAgeVerified: false,
        buyerPreferencesAllow: false,
        sellerRegionAllows: false,
        sellerKYCVerified: false,
        appStoreAllows: false,
        pspAllows: false,
        blockReason: 'Content is prohibited',
        denialCode: 'BANNED_CONTENT',
        checkedAt: serverTimestamp() as Timestamp,
        buyerRegion: 'UNKNOWN',
        sellerRegion: 'UNKNOWN',
      };
    }

    // Run compliance checks
    const mainCompliance = await checkNSFWMonetization(buyerId, sellerId, nsfwLevel);

    // Check buyer preferences
    const buyerPrefs = await getUserSafetyPreferences(buyerId);
    const buyerPreferencesAllow = buyerPrefs.allowAdultContentInFeed; // Must opt in

    // Check seller KYC (required for monetization)
    const sellerKYC = await db.collection('user_kyc_status').doc(sellerId).get();
    const sellerKYCVerified = sellerKYC.exists && sellerKYC.data()?.status === 'VERIFIED';

    // Aggregate all checks
    const allowed = mainCompliance.allowed && buyerPreferencesAllow && sellerKYCVerified;

    let denialCode: string | undefined;
    let blockReason: string | undefined;
    
    if (!allowed) {
      if (!mainCompliance.allowed) {
        blockReason = mainCompliance.reason;
        denialCode = 'COMPLIANCE_FAILED';
      } else if (!buyerPreferencesAllow) {
        blockReason = 'Buyer has not opted into adult content';
        denialCode = 'BUYER_PREFERENCES';
      } else if (!sellerKYCVerified) {
        blockReason = 'Seller KYC verification required';
        denialCode = 'SELLER_KYC';
      }
    }

    const result: NSFWMonetizationCheck = {
      allowed,
      buyerRegionAllows: mainCompliance.allowed,
      buyerAgeVerified: buyerPrefs.ageVerified,
      buyerPreferencesAllow,
      sellerRegionAllows: mainCompliance.allowed,
      sellerKYCVerified,
      appStoreAllows: true, // Handled by compliance
      pspAllows: true, // Handled by compliance
      blockReason,
      denialCode,
      checkedAt: serverTimestamp() as Timestamp,
      buyerRegion: mainCompliance.buyerRegion,
      sellerRegion: mainCompliance.sellerRegion,
    };

    console.log(`[PACK108] Monetization check result: ${allowed ? 'ALLOWED' : 'BLOCKED'}`);
    return result;
  } catch (error) {
    console.error(`[PACK108] Error checking NSFW monetization:`, error);
    
    // Fail-safe: deny transaction
    return {
      allowed: false,
      buyerRegionAllows: false,
      buyerAgeVerified: false,
      buyerPreferencesAllow: false,
      sellerRegionAllows: false,
      sellerKYCVerified: false,
      appStoreAllows: false,
      pspAllows: false,
      blockReason: 'Error during monetization check',
      denialCode: 'SYSTEM_ERROR',
      checkedAt: serverTimestamp() as Timestamp,
      buyerRegion: 'ERROR',
      sellerRegion: 'ERROR',
    };
  }
}

// ============================================================================
// TRANSACTION PROCESSING
// ============================================================================

/**
 * Process NSFW content unlock transaction
 * CRITICAL: Token price and revenue split NEVER change regardless of content type
 */
export async function processNSFWUnlockTransaction(
  buyerId: string,
  sellerId: string,
  contentId: string,
  nsfwLevel: NSFWLevel,
  tokenAmount: number
): Promise<{
  success: boolean;
  transactionId?: string;
  error?: string;
  denialCode?: string;
}> {
  try {
    console.log(`[PACK108] Processing NSFW unlock: ${tokenAmount} tokens for content ${contentId}`);

    // Check if transaction is allowed
    const check = await checkNSFWMonetizationTransaction(
      buyerId,
      sellerId,
      contentId,
      nsfwLevel,
      tokenAmount
    );

    if (!check.allowed) {
      console.log(`[PACK108] Transaction blocked: ${check.blockReason}`);
      
      // Log violation if it's a bypass attempt
      if (check.denialCode === 'COMPLIANCE_FAILED') {
        await detectNSFWViolation(
          sellerId,
          contentId,
          'NSFW_BYPASS_ATTEMPT',
          `Attempted to monetize NSFW content where not allowed: ${check.blockReason}`,
          'SYSTEM'
        );
      }
      
      return {
        success: false,
        error: check.blockReason,
        denialCode: check.denialCode,
      };
    }

    // Calculate earnings (STANDARD SPLIT - NEVER CHANGES)
    const creatorEarnings = tokenAmount * CREATOR_SPLIT;
    const platformCommission = tokenAmount * PLATFORM_SPLIT;

    // Verify split adds up (sanity check)
    if (Math.abs((creatorEarnings + platformCommission) - tokenAmount) > 0.01) {
      throw new Error('Revenue split calculation error');
    }

    // Create transaction record
    const transactionId = generateId();
    const transaction: NSFWMonetizationTransaction = {
      transactionId,
      contentId,
      nsfwLevel,
      buyerId,
      sellerId,
      complianceCheck: check,
      tokenAmount,
      creatorEarnings,
      platformCommission,
      createdAt: serverTimestamp() as Timestamp,
      status: 'COMPLETED',
    };

    // Save transaction
    await db.collection('nsfw_monetization_transactions').doc(transactionId).set(transaction);

    // Update content unlock record
    await db.collection('content_unlocks').add({
      contentId,
      buyerId,
      sellerId,
      tokenAmount,
      nsfwLevel,
      transactionId,
      unlockedAt: serverTimestamp(),
    });

    // Update creator earnings (standard flow, no special handling)
    await db.collection('creator_earnings').doc(sellerId).update({
      totalEarnings: FieldValue.increment(creatorEarnings),
      pendingBalance: FieldValue.increment(creatorEarnings),
      updatedAt: serverTimestamp(),
    });

    // Update platform revenue
    await db.collection('platform_revenue').doc('totals').update({
      totalRevenue: FieldValue.increment(platformCommission),
      updatedAt: serverTimestamp(),
    });

    // Audit log
    await db.collection('pack105_audit_transactions').add({
      transactionId,
      type: 'CONTENT_UNLOCK',
      contentType: 'NSFW',
      nsfwLevel,
      buyerId,
      sellerId,
      tokenAmount,
      creatorEarnings,
      platformCommission,
      timestamp:serverTimestamp(),
    });

    console.log(`[PACK108] NSFW unlock transaction completed: ${transactionId}`);
    return {
      success: true,
      transactionId,
    };
  } catch (error) {
    console.error(`[PACK108] Error processing NSFW transaction:`, error);
    return {
      success: false,
      error: 'Transaction failed',
      denialCode: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Process refund for NSFW transaction (if needed for compliance)
 */
export async function refundNSFWTransaction(
  transactionId: string,
  reason: string,
  refundedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get transaction
    const txDoc = await db.collection('nsfw_monetization_transactions').doc(transactionId).get();
    
    if (!txDoc.exists) {
      return {
        success: false,
        error: 'Transaction not found',
      };
    }

    const tx = txDoc.data() as NSFWMonetizationTransaction;

    if (tx.status !== 'COMPLETED') {
      return {
        success: false,
        error: 'Transaction already processed',
      };
    }

    // Reverse earnings
    await db.collection('creator_earnings').doc(tx.sellerId).update({
      totalEarnings: FieldValue.increment(-tx.creatorEarnings),
      pendingBalance: FieldValue.increment(-tx.creatorEarnings),
      updatedAt: serverTimestamp(),
    });

    // Reverse platform revenue
    await db.collection('platform_revenue').doc('totals').update({
      totalRevenue: FieldValue.increment(-tx.platformCommission),
      updatedAt: serverTimestamp(),
    });

    // Refund tokens to buyer
    await db.collection('user_token_balance').doc(tx.buyerId).update({
      balance: FieldValue.increment(tx.tokenAmount),
      updatedAt: serverTimestamp(),
    });

    // Update transaction status
    await db.collection('nsfw_monetization_transactions').doc(transactionId).update({
      status: 'REFUNDED',
      refundedAt: serverTimestamp(),
      refundReason: reason,
      refundedBy,
    });

    // Audit log
    await db.collection('pack105_audit_transactions').add({
      transactionId,
      type: 'REFUND',
      originalTransaction: transactionId,
      buyerId: tx.buyerId,
      sellerId: tx.sellerId,
      tokenAmount: tx.tokenAmount,
      reason,
      refundedBy,
      timestamp: serverTimestamp(),
    });

    console.log(`[PACK108] Transaction ${transactionId} refunded`);
    return { success: true };
  } catch (error) {
    console.error(`[PACK108] Error refunding transaction:`, error);
    return {
      success: false,
      error: 'Refund failed',
    };
  }
}

// ============================================================================
// VIOLATION DETECTION
// ============================================================================

/**
 * Detect external selling attempts (directing users off-platform)
 */
export async function detectExternalSellingAttempt(
  userId: string,
  contentId: string,
  messageText: string
): Promise<void> {
  try {
    // Pattern matching for external payment/content links
    const suspiciousPatterns = [
      /onlyfans/i,
      /patreon/i,
      /venmo/i,
      /cashapp/i,
      /paypal\.me/i,
      /\$[0-9]+/,
      /dm\s+me/i,
      /telegram/i,
      /whatsapp/i,
      /buy\s+my/i,
    ];

    let suspicious = false;
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(messageText)) {
        suspicious = true;
        break;
      }
    }

    if (suspicious) {
      await detectNSFWViolation(
        userId,
        contentId,
        'NSFW_EXTERNAL_SELLING',
        `Potential external selling detected in message: ${messageText.substring(0, 100)}`,
        'SYSTEM'
      );
      
      console.log(`[PACK108] External selling attempt detected for user ${userId}`);
    }
  } catch (error) {
    console.error(`[PACK108] Error detecting external selling:`, error);
  }
}

/**
 * Check for monetization bypass attempts
 */
export async function checkMonetizationBypass(
  userId: string,
  contentId: string
): Promise<{ detected: boolean; reason?: string }> {
  try {
    // Check if user has pattern of failing monetization checks
    const recentFailures = await db
      .collection('nsfw_monetization_transactions')
      .where('sellerId', '==', userId)
      .where('status', '==', 'BLOCKED')
      .where('createdAt', '>=', Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
      .get();

    if (recentFailures.size >= 5) {
      await detectNSFWViolation(
        userId,
        contentId,
        'NSFW_BYPASS_ATTEMPT',
        `Multiple failed monetization attempts: ${recentFailures.size} in past 7 days`,
        'SYSTEM'
      );

      return {
        detected: true,
        reason: 'Multiple bypass attempts detected',
      };
    }

    return { detected: false };
  } catch (error) {
    console.error(`[PACK108] Error checking monetization bypass:`, error);
    return { detected: false };
  }
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Get NSFW monetization stats for creator
 */
export async function getNSFWMonetizationStats(
  creatorId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  totalTransactions: number;
  totalTokens: number;
  totalEarnings: number;
  averageTransaction: number;
  byNSFWLevel: Record<NSFWLevel, { count: number; tokens: number; earnings: number }>;
}> {
  try {
    const txSnapshot = await db
      .collection('nsfw_monetization_transactions')
      .where('sellerId', '==', creatorId)
      .where('status', '==', 'COMPLETED')
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<=', Timestamp.fromDate(endDate))
      .get();

    let totalTransactions = 0;
    let totalTokens = 0;
    let totalEarnings = 0;
    const byLevel: Record<NSFWLevel, { count: number; tokens: number; earnings: number }> = {
      'SAFE': { count: 0, tokens: 0, earnings: 0 },
      'SOFT_NSFW': { count: 0, tokens: 0, earnings: 0 },
      'NSFW_EXPLICIT': { count: 0, tokens: 0, earnings: 0 },
      'BANNED': { count: 0, tokens: 0, earnings: 0 },
    };

    txSnapshot.docs.forEach(doc => {
      const tx = doc.data() as NSFWMonetizationTransaction;
      totalTransactions++;
      totalTokens += tx.tokenAmount;
      totalEarnings += tx.creatorEarnings;

      byLevel[tx.nsfwLevel].count++;
      byLevel[tx.nsfwLevel].tokens += tx.tokenAmount;
      byLevel[tx.nsfwLevel].earnings += tx.creatorEarnings;
    });

    const averageTransaction = totalTransactions > 0 ? totalTokens / totalTransactions : 0;

    return {
      totalTransactions,
      totalTokens,
      totalEarnings,
      averageTransaction,
      byNSFWLevel: byLevel,
    };
  } catch (error) {
    console.error(`[PACK108] Error getting NSFW monetization stats:`, error);
    throw error;
  }
}