/**
 * PACK 121 — Avalo Global Ads Network
 * Ad Safety & Enforcement Functions
 * 
 * Handles:
 * - Content safety scanning
 * - Automated violation detection
 * - Campaign takedown
 * - Advertiser enforcement
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  AdCampaign,
  Advertiser,
  AdSafetyViolation,
  ForbiddenCategory,
  AdSafetyScanResult,
} from './pack121-types';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// Safety Scanning Functions
// ============================================================================

/**
 * Comprehensive safety scan for ad content
 */
async function performSafetyScan(campaign: AdCampaign): Promise<AdSafetyScanResult> {
  const violations: AdSafetyScanResult['violations'] = [];
  
  // Text content analysis
  const combinedText = `${campaign.title} ${campaign.description} ${campaign.ctaText}`.toLowerCase();
  
  // Check for forbidden content
  const forbiddenPatterns: Record<ForbiddenCategory, string[]> = {
    NSFW: [
      'sex', 'sexy', 'adult', 'xxx', 'porn', 'nude', 'naked', 
      'erotic', 'sensual', 'intimate', 'hot singles'
    ],
    DATING: [
      'hookup', 'dating', 'match', 'singles', 'romance', 'meet singles',
      'find love', 'soulmate', 'dating app', 'meet people'
    ],
    GAMBLING: [
      'casino', 'bet', 'betting', 'gambling', 'poker', 'lottery', 
      'jackpot', 'slot', 'roulette', 'blackjack', 'wager'
    ],
    CRYPTO_TRADING: [
      'crypto', 'bitcoin', 'trading', 'forex', 'investment opportunity',
      'trade now', 'get rich', 'financial freedom', 'passive income',
      'mining', 'blockchain', 'ico', 'token sale'
    ],
    PAYDAY_LOANS: [
      'payday', 'loan', 'cash advance', 'quick money', 'instant cash',
      'emergency loan', 'bad credit ok', 'no credit check'
    ],
    DRUGS: [
      'weed', 'cannabis', 'marijuana', 'drugs', 'prescription drugs',
      'pills', 'pharmacy', 'cbd oil', 'thc', 'medical marijuana'
    ],
    EXTREMIST: [
      'hate', 'supremacy', 'terrorist', 'radical', 'extremist',
      'militia', 'conspiracy', 'riot', 'overthrow'
    ],
    MEDICAL_UNCERTIFIED: [
      'cure', 'treatment', 'medication', 'disease', 'medical breakthrough',
      'doctor recommended', 'clinical trial', 'fda approved' // Without actual FDA approval
    ],
  };
  
  // Scan for each forbidden category
  for (const [category, keywords] of Object.entries(forbiddenPatterns)) {
    for (const keyword of keywords) {
      if (combinedText.includes(keyword)) {
        violations.push({
          type: category as ForbiddenCategory,
          confidence: 0.8,
          description: `Detected forbidden keyword: "${keyword}"`,
        });
        break; // One violation per category is enough
      }
    }
  }
  
  // Additional pattern checks
  
  // Check for deceptive pricing
  if (combinedText.match(/free|100% off|get paid|earn money|make \$\d+/i)) {
    const hasTokenMention = combinedText.includes('token') || combinedText.includes('discount');
    if (hasTokenMention) {
      violations.push({
        type: 'OTHER',
        confidence: 0.9,
        description: 'Potential violation: Ads cannot offer token rewards or discounts',
      });
    }
  }
  
  // Check for emotional manipulation
  const manipulativePatterns = [
    'act now', 'limited time', 'urgent', 'don\'t miss out', 
    'exclusive offer', 'secret', 'only for you'
  ];
  
  let manipulativeCount = 0;
  for (const pattern of manipulativePatterns) {
    if (combinedText.includes(pattern)) {
      manipulativeCount++;
    }
  }
  
  if (manipulativeCount >= 3) {
    violations.push({
      type: 'OTHER',
      confidence: 0.6,
      description: 'Excessive use of manipulative language',
    });
  }
  
  // Check destination URL safety (if external)
  if (campaign.destination === 'EXTERNAL_WEB' && campaign.destinationUrl) {
    const url = campaign.destinationUrl.toLowerCase();
    
    // Check for suspicious domains
    const suspiciousDomains = [
      '.tk', '.ga', '.ml', '.cf', // Free domains often used for scams
      'bit.ly', 'tinyurl', // URL shorteners that hide destination
    ];
    
    for (const domain of suspiciousDomains) {
      if (url.includes(domain)) {
        violations.push({
          type: 'OTHER',
          confidence: 0.7,
          description: `Suspicious domain detected: ${domain}`,
        });
        break;
      }
    }
  }
  
  return {
    adId: campaign.adId,
    passed: violations.length === 0,
    violations,
    scanTimestamp: Timestamp.now(),
  };
}

/**
 * Manual safety review by admin
 */
export const reviewAdSafety = onCall<{
  adId: string;
  approved: boolean;
  notes?: string;
}, Promise<{ success: boolean }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Verify admin
    const adminDoc = await db.collection('admins').doc(userId).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Admin only');
    }
    
    const { adId, approved, notes } = request.data;
    
    // Get campaign
    const campaignDoc = await db.collection('ad_campaigns').doc(adId).get();
    if (!campaignDoc.exists) {
      throw new HttpsError('not-found', 'Campaign not found');
    }
    
    // Update safety status
    await db.collection('ad_campaigns').doc(adId).update({
      safetyStatus: approved ? 'APPROVED' : 'REJECTED',
      safetyReviewedBy: userId,
      safetyReviewedAt: serverTimestamp(),
      safetyNotes: notes || null,
      status: approved ? 'SCHEDULED' : 'SUSPENDED',
      updatedAt: serverTimestamp(),
    });
    
    // Log review
    await db.collection('business_audit_log').add({
      targetType: 'AD_CAMPAIGN',
      targetId: adId,
      action: 'SAFETY_REVIEW',
      performedBy: userId,
      performedAt: serverTimestamp(),
      details: { approved, notes },
    });
    
    return { success: true };
  }
);

// ============================================================================
// Automated Enforcement
// ============================================================================

/**
 * Automatically scan new campaigns
 */
export const onAdCampaignCreated = onDocumentCreated(
  'ad_campaigns/{campaignId}',
  async (event) => {
    const campaign = event.data?.data() as AdCampaign;
    
    if (!campaign) return;
    
    try {
      // Perform safety scan
      const scanResult = await performSafetyScan(campaign);
      
      // If high-confidence violations detected, auto-suspend
      const highConfidenceViolations = scanResult.violations.filter(v => v.confidence >= 0.8);
      
      if (highConfidenceViolations.length > 0) {
        // Auto-suspend campaign
        await db.collection('ad_campaigns').doc(campaign.adId).update({
          status: 'SUSPENDED',
          safetyStatus: 'FLAGGED',
          updatedAt: serverTimestamp(),
        });
        
        // Create violation record
        const violationId = `vio_${generateId()}`;
        const violation: AdSafetyViolation = {
          violationId,
          adId: campaign.adId,
          advertiserId: campaign.advertiserId,
          violationType: highConfidenceViolations[0].type as ForbiddenCategory,
          description: highConfidenceViolations.map(v => v.description).join('; '),
          detectedBy: 'AI_SCAN',
          actionTaken: 'CAMPAIGN_PAUSED',
          refundIssued: false,
          detectedAt: Timestamp.now(),
        };
        
        await db.collection('ad_safety_violations').doc(violationId).set(violation);
        
        // Flag advertiser
        await db.collection('advertisers').doc(campaign.advertiserId).update({
          kycStatus: 'SUSPENDED',
          updatedAt: serverTimestamp(),
        });
        
        console.log(`Campaign ${campaign.adId} auto-suspended for safety violations`);
      } else if (scanResult.violations.length > 0) {
        // Medium confidence violations - flag for manual review
        await db.collection('ad_campaigns').doc(campaign.adId).update({
          safetyStatus: 'PENDING',
          updatedAt: serverTimestamp(),
        });
        
        console.log(`Campaign ${campaign.adId} flagged for manual review`);
      }
      
      // Store scan result
      await db.collection('ad_safety_scans').doc(campaign.adId).set(scanResult);
      
    } catch (error) {
      console.error('Error in safety scan:', error);
    }
  }
);

/**
 * Handle user reports of ads
 */
export const reportAd = onCall<{
  adId: string;
  reason: string;
  description?: string;
}, Promise<{ success: boolean }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { adId, reason, description } = request.data;
    
    if (!adId || !reason) {
      throw new HttpsError('invalid-argument', 'Ad ID and reason required');
    }
    
    try {
      // Get campaign
      const campaignDoc = await db.collection('ad_campaigns').doc(adId).get();
      
      if (!campaignDoc.exists) {
        throw new HttpsError('not-found', 'Campaign not found');
      }
      
      const campaign = campaignDoc.data() as AdCampaign;
      
      // Create report
      const reportId = `rep_${generateId()}`;
      await db.collection('ad_reports').doc(reportId).set({
        reportId,
        adId,
        advertiserId: campaign.advertiserId,
        reportedBy: userId,
        reason,
        description: description || null,
        status: 'PENDING',
        createdAt: serverTimestamp(),
      });
      
      // Count reports for this ad
      const reportsSnapshot = await db.collection('ad_reports')
        .where('adId', '==', adId)
        .where('status', '==', 'PENDING')
        .count()
        .get();
      
      const reportCount = reportsSnapshot.data().count;
      
      // If multiple reports, flag for review
      if (reportCount >= 3) {
        await db.collection('ad_campaigns').doc(adId).update({
          safetyStatus: 'FLAGGED',
          status: 'PAUSED',
          updatedAt: serverTimestamp(),
        });
        
        console.log(`Campaign ${adId} auto-paused after ${reportCount} reports`);
      }
      
      return { success: true };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('Error reporting ad:', error);
      throw new HttpsError('internal', 'Failed to report ad');
    }
  }
);

/**
 * Suspend advertiser (admin only)
 */
export const suspendAdvertiser = onCall<{
  advertiserId: string;
  reason: string;
  refundTokens: boolean;
}, Promise<{ success: boolean }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Verify admin
    const adminDoc = await db.collection('admins').doc(userId).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Admin only');
    }
    
    const { advertiserId, reason, refundTokens } = request.data;
    
    try {
      // Get advertiser
      const advertiserDoc = await db.collection('advertisers').doc(advertiserId).get();
      
      if (!advertiserDoc.exists) {
        throw new HttpsError('not-found', 'Advertiser not found');
      }
      
      const advertiser = advertiserDoc.data() as Advertiser;
      
      // Suspend advertiser
      await db.collection('advertisers').doc(advertiserId).update({
        kycStatus: 'SUSPENDED',
        active: false,
        updatedAt: serverTimestamp(),
      });
      
      // Pause all active campaigns
      const campaignsSnapshot = await db.collection('ad_campaigns')
        .where('advertiserId', '==', advertiserId)
        .where('status', 'in', ['ACTIVE', 'SCHEDULED'])
        .get();
      
      const batch = db.batch();
      
      for (const doc of campaignsSnapshot.docs) {
        batch.update(doc.ref, {
          status: 'SUSPENDED',
          updatedAt: serverTimestamp(),
        });
      }
      
      await batch.commit();
      
      // Handle refund if requested
      if (refundTokens) {
        let totalRefund = 0;
        
        for (const doc of campaignsSnapshot.docs) {
          const campaign = doc.data() as AdCampaign;
          const unspentTokens = campaign.budgetTokens - campaign.spentTokens;
          if (unspentTokens > 0) {
            totalRefund += unspentTokens;
          }
        }
        
        if (totalRefund > 0) {
          await db.collection('advertisers').doc(advertiserId).update({
            tokenBalance: increment(totalRefund),
            updatedAt: serverTimestamp(),
          });
        }
      }
      
      // Log action
      await db.collection('business_audit_log').add({
        targetType: 'ADVERTISER',
        targetId: advertiserId,
        action: 'SUSPEND',
        performedBy: userId,
        performedAt: serverTimestamp(),
        details: { reason, refundTokens, campaignsSuspended: campaignsSnapshot.size },
      });
      
      return { success: true };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('Error suspending advertiser:', error);
      throw new HttpsError('internal', 'Failed to suspend advertiser');
    }
  }
);

/**
 * Get ad safety scan results
 */
export const getAdSafetyScan = onCall<{
  adId: string;
}, Promise<{ success: boolean; scan?: AdSafetyScanResult }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Verify admin
    const adminDoc = await db.collection('admins').doc(userId).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Admin only');
    }
    
    const { adId } = request.data;
    
    try {
      const scanDoc = await db.collection('ad_safety_scans').doc(adId).get();
      
      if (!scanDoc.exists) {
        return { success: true };
      }
      
      const scan = scanDoc.data() as AdSafetyScanResult;
      
      return {
        success: true,
        scan,
      };
    } catch (error) {
      console.error('Error getting safety scan:', error);
      throw new HttpsError('internal', 'Failed to get safety scan');
    }
  }
);

/**
 * List safety violations
 */
export const listSafetyViolations = onCall<{
  advertiserId?: string;
  limit?: number;
}, Promise<{ success: boolean; violations?: AdSafetyViolation[] }>>(
  { region: 'us-central1' },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Verify admin
    const adminDoc = await db.collection('admins').doc(userId).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Admin only');
    }
    
    const { advertiserId, limit = 50 } = request.data;
    
    try {
      let query = db.collection('ad_safety_violations')
        .orderBy('detectedAt', 'desc')
        .limit(limit);
      
      if (advertiserId) {
        query = db.collection('ad_safety_violations')
          .where('advertiserId', '==', advertiserId)
          .orderBy('detectedAt', 'desc')
          .limit(limit) as any;
      }
      
      const snapshot = await query.get();
      const violations = snapshot.docs.map(doc => doc.data() as AdSafetyViolation);
      
      return {
        success: true,
        violations,
      };
    } catch (error) {
      console.error('Error listing violations:', error);
      throw new HttpsError('internal', 'Failed to list violations');
    }
  }
);