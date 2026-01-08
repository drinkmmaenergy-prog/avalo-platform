/**
 * PACK 378 — Digital Services Act (DSA) Compliance Engine
 * EU Digital Services Act, Digital Markets Act, and Platform Intermediary Compliance
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { DSAComplianceLog } from '../../firestore/schemas/pack378-tax-profiles';

const db = admin.firestore();

/**
 * PACK378_dsaAuditLogger
 * Log compliance events for DSA/DMA reporting
 */
export const pack378_dsaAuditLogger = functions.https.onCall(async (data, context) => {
  const {
    eventType,
    userId,
    contentId,
    description,
    actionTaken,
    priority,
    lawType,
    jurisdiction,
    metadata
  } = data;

  if (!eventType || !description) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Determine if this event requires reporting to authorities
  const requiresReport = determineReportingRequirement(eventType, lawType, priority);

  const log: Omit<DSAComplianceLog, 'id'> = {
    eventType,
    userId: userId || undefined,
    contentId: contentId || undefined,
    description,
    actionTaken,
    priority: priority || 'medium',
    lawType: lawType || 'DSA',
    jurisdiction: jurisdiction || 'EU',
    requiresReport,
    reportedAt: requiresReport ? new Date() : undefined,
    timestamp: new Date(),
    ipAddress: context.rawRequest?.ip || 'unknown',
    userAgent: context.rawRequest?.headers['user-agent'] || 'unknown',
    metadata: metadata || {}
  };

  const docRef = await db.collection('dsaComplianceLogs').add(log);

  // If critical, notify compliance team
  if (priority === 'critical') {
    await notifyComplianceTeam(log);
  }

  return {
    logId: docRef.id,
    requiresReport,
    success: true
  };
});

/**
 * PACK378_marketplaceDisclosureEngine
 * Enforce seller identity disclosure requirements
 */
export const pack378_marketplaceDisclosureEngine = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sellerId, transactionAmount } = data;

  // Get seller information
  const sellerDoc = await db.collection('users').doc(sellerId).get();
  if (!sellerDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Seller not found');
  }

  const seller = sellerDoc.data();
  const sellerTaxDoc = await db.collection('creatorTaxProfiles').doc(sellerId).get();

  // Determine disclosure requirements based on EU rules
  const isEUSeller = isEUCountry(seller.countryCode);
  const isHighValue = transactionAmount > 2000; // EUR threshold for enhanced disclosure

  const disclosure = {
    sellerName: seller.displayName || 'Anonymous',
    sellerType: sellerTaxDoc.exists && sellerTaxDoc.data()?.isBusinessEntity ? 'business' : 'individual',
    identityVerified: sellerTaxDoc.exists && sellerTaxDoc.data()?.identityVerified,
    countryCode: seller.countryCode,
    // Enhanced disclosure for EU or high-value
    businessRegistration: (isEUSeller || isHighValue) && sellerTaxDoc.exists 
      ? sellerTaxDoc.data()?.businessRegistration 
      : undefined,
    vatNumber: (isEUSeller || isHighValue) && sellerTaxDoc.exists 
      ? sellerTaxDoc.data()?.vatNumber 
      : undefined,
    contactEmail: (isEUSeller || isHighValue) ? seller.email : undefined,
    disclosureLevel: isHighValue ? 'enhanced' : isEUSeller ? 'standard' : 'basic'
  };

  // Log disclosure
  await pack378_dsaAuditLogger({
    eventType: 'seller_disclosure',
    userId: context.auth.uid,
    description: `Marketplace disclosure provided for seller ${sellerId}`,
    actionTaken: `${disclosure.disclosureLevel} disclosure shown`,
    priority: 'low',
    lawType: 'DSA',
    jurisdiction: seller.countryCode,
    metadata: { sellerId, transactionAmount, disclosureLevel: disclosure.disclosureLevel }
  }, context);

  return disclosure;
});

/**
 * Log abuse report with DSA compliance
 */
export const logAbuseReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { contentId, contentType, reason, description } = data;

  // Create abuse report
  const reportRef = await db.collection('abuseReports').add({
    reporterId: context.auth.uid,
    contentId,
    contentType,
    reason,
    description,
    status: 'pending',
    priority: determinePriority(reason),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Log for DSA compliance
  await pack378_dsaAuditLogger({
    eventType: 'abuse_report',
    userId: context.auth.uid,
    contentId,
    description: `Abuse reported: ${reason}`,
    actionTaken: 'Report created and queued for review',
    priority: determinePriority(reason),
    lawType: 'DSA',
    jurisdiction: 'EU',
    metadata: { reportId: reportRef.id, reason }
  }, context);

  return {
    reportId: reportRef.id,
    status: 'pending',
    estimatedReviewTime: getEstimatedReviewTime(determinePriority(reason))
  };
});

/**
 * Log content takedown with traceability
 */
export const logContentTakedown = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { contentId, reason, legalBasis, appealable } = data;

  // Create takedown record
  const takedownRef = await db.collection('contentTakedowns').add({
    contentId,
    reason,
    legalBasis,
    appealable: appealable !== false,
    takenDownBy: context.auth.uid,
    takenDownAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Log for DSA compliance with full traceability
  await pack378_dsaAuditLogger({
    eventType: 'content_takedown',
    contentId,
    description: `Content removed: ${reason}`,
    actionTaken: `Takedown executed. Legal basis: ${legalBasis}`,
    priority: 'high',
    lawType: 'DSA',
    jurisdiction: 'EU',
    metadata: {
      takedownId: takedownRef.id,
      reason,
      legalBasis,
      appealable,
      moderatorId: context.auth.uid
    }
  }, context);

  return {
    takedownId: takedownRef.id,
    appealable,
    appealDeadline: appealable ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : undefined
  };
});

/**
 * Log ranking/recommendation transparency
 */
export const logRankingTransparency = functions.https.onCall(async (data, context) => {
  const { userId, contentId, rankingFactors, algorithmVersion } = data;

  await pack378_dsaAuditLogger({
    eventType: 'ranking_transparency',
    userId,
    contentId,
    description: 'Content ranking factors logged for transparency',
    actionTaken: 'Ranking metadata recorded',
    priority: 'low',
    lawType: 'DSA',
    jurisdiction: 'EU',
    metadata: {
      rankingFactors,
      algorithmVersion,
      timestamp: new Date()
    }
  }, context);

  return { logged: true };
});

/**
 * Detect and suppress review manipulation
 */
export const detectReviewManipulation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { reviewId, userId } = data;

  // Check for manipulation patterns
  const manipulation = await checkManipulationPatterns(userId);

  if (manipulation.detected) {
    // Suppress review
    await db.collection('reviews').doc(reviewId).update({
      suppressed: true,
      suppressionReason: manipulation.reason
    });

    // Log for DSA compliance
    await pack378_dsaAuditLogger({
      eventType: 'review_manipulation',
      userId,
      contentId: reviewId,
      description: `Review manipulation detected: ${manipulation.reason}`,
      actionTaken: 'Review suppressed',
      priority: 'medium',
      lawType: 'DSA',
      jurisdiction: 'EU',
      metadata: {
        reviewId,
        manipulationType: manipulation.type,
        confidence: manipulation.confidence
      }
    }, context);

    return {
      suppressed: true,
      reason: manipulation.reason
    };
  }

  return {
    suppressed: false
  };
});

/**
 * Helper functions
 */

function determineReportingRequirement(eventType: string, lawType: string, priority: string): boolean {
  // Critical events or certain event types require reporting
  if (priority === 'critical') return true;
  
  const reportableEvents = ['content_takedown', 'abuse_report'];
  return reportableEvents.includes(eventType);
}

function isEUCountry(countryCode: string): boolean {
  const euCountries = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
  ];
  return euCountries.includes(countryCode);
}

function determinePriority(reason: string): 'low' | 'medium' | 'high' | 'critical' {
  const highPriorityReasons = ['child_safety', 'terrorism', 'violence', 'illegal_content'];
  const mediumPriorityReasons = ['harassment', 'hate_speech', 'scam', 'fraud'];
  
  if (highPriorityReasons.some(r => reason.toLowerCase().includes(r))) {
    return 'critical';
  }
  if (mediumPriorityReasons.some(r => reason.toLowerCase().includes(r))) {
    return 'high';
  }
  return 'medium';
}

function getEstimatedReviewTime(priority: string): string {
  switch (priority) {
    case 'critical': return '1 hour';
    case 'high': return '24 hours';
    case 'medium': return '3 days';
    default: return '7 days';
  }
}

async function notifyComplianceTeam(log: Omit<DSAComplianceLog, 'id'>): Promise<void> {
  // Send notification to compliance monitoring system
  await db.collection('complianceAlerts').add({
    type: 'critical_dsa_event',
    eventType: log.eventType,
    priority: log.priority,
    description: log.description,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    requiresImmediateAction: true
  });
}

async function checkManipulationPatterns(userId: string): Promise<{ detected: boolean; reason?: string; type?: string; confidence?: number }> {
  // Check for suspicious review patterns
  const recentReviewsSnapshot = await db.collection('reviews')
    .where('userId', '==', userId)
    .where('timestamp', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .get();

  const reviewCount = recentReviewsSnapshot.size;

  // Too many reviews in short time
  if (reviewCount > 10) {
    return {
      detected: true,
      reason: 'Excessive review frequency',
      type: 'volume_abuse',
      confidence: 0.9
    };
  }

  // Check for pattern of only 5-star or 1-star reviews
  const ratings = recentReviewsSnapshot.docs.map(doc => doc.data().rating);
  const allExtremes = ratings.every(r => r === 1 || r === 5);
  
  if (allExtremes && ratings.length > 5) {
    return {
      detected: true,
      reason: 'Suspicious rating pattern',
      type: 'rating_manipulation',
      confidence: 0.8
    };
  }

  return { detected: false };
}
