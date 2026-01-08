/**
 * PACK 248 - Romance Scam Detection Service
 * 
 * CRITICAL: This service ONLY detects FINANCIAL MANIPULATION
 * It does NOT block romance, flirting, sexting, or consensual adult content
 * 
 * Objectives:
 * - Detect money requests and financial pressure
 * - Track user risk scores
 * - Silent reporting (no confrontation)
 * - Auto-refund confirmed scams
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
  getDocs,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  RomanceScamDetection,
  SuspiciousPattern,
  ScamPatternType,
  RiskLevel,
  UserRiskScore,
  RiskIncident,
  StopScamReport,
  RefundRecord,
  ROMANCE_SCAM_PATTERNS,
  DEFAULT_SCAM_CONFIG,
  ReportStatus,
  ScamAction,
} from '../types/romance-scam.types';

/**
 * Analyze message text for romance scam patterns
 * Returns suspicious patterns found (if any)
 */
export async function analyzeMessageForScam(
  messageText: string,
  messageId: string,
  chatId: string,
  senderId: string,
  receiverId: string
): Promise<RomanceScamDetection | null> {
  const lowerText = messageText.toLowerCase();
  const suspiciousPatterns: SuspiciousPattern[] = [];

  // Check each scam pattern
  for (const pattern of ROMANCE_SCAM_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        suspiciousPatterns.push({
          patternType: pattern.type,
          matchedPhrase: keyword,
          confidence: 0.8, // Base confidence
          context: extractContext(messageText, keyword),
        });
      }
    }
  }

  // No suspicious patterns found - message is clean
  if (suspiciousPatterns.length === 0) {
    return null;
  }

  // Calculate risk level based on patterns
  const totalSeverity = suspiciousPatterns.reduce((sum, p) => {
    const pattern = ROMANCE_SCAM_PATTERNS.find(pat => pat.type === p.patternType);
    return sum + (pattern?.severityPoints || 0);
  }, 0);

  const riskLevel: RiskLevel =
    totalSeverity >= 75 ? 'CRITICAL' :
    totalSeverity >= 50 ? 'HIGH' :
    totalSeverity >= 25 ? 'MEDIUM' : 'LOW';

  const detection: RomanceScamDetection = {
    messageId,
    chatId,
    senderId,
    receiverId,
    messageText,
    detectedAt: new Date(),
    suspiciousPatterns,
    riskLevel,
    autoBlocked: riskLevel === 'CRITICAL',
  };

  // Store detection in Firestore
  await recordScamDetection(detection);

  // Update sender's risk score
  await updateUserRiskScore(senderId, suspiciousPatterns);

  return detection;
}

/**
 * Extract context around matched phrase (30 chars before/after)
 */
function extractContext(text: string, phrase: string): string {
  const index = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (index === -1) return text.substring(0, 100);

  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + phrase.length + 30);
  return '...' + text.substring(start, end) + '...';
}

/**
 * Record scam detection in Firestore
 */
async function recordScamDetection(detection: RomanceScamDetection): Promise<void> {
  try {
    await addDoc(collection(db, 'scamDetections'), {
      ...detection,
      detectedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error recording scam detection:', error);
  }
}

/**
 * Update user's risk score based on detected patterns
 */
export async function updateUserRiskScore(
  userId: string,
  patterns: SuspiciousPattern[]
): Promise<UserRiskScore> {
  const riskRef = doc(db, 'userRiskScores', userId);
  const riskDoc = await getDoc(riskRef);

  const totalPoints = patterns.reduce((sum, p) => {
    const pattern = ROMANCE_SCAM_PATTERNS.find(pat => pat.type === p.patternType);
    return sum + (pattern?.severityPoints || 0);
  }, 0);

  const incidents: RiskIncident[] = patterns.map(p => ({
    incidentId: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    type: p.patternType,
    severityPoints: ROMANCE_SCAM_PATTERNS.find(pat => pat.type === p.patternType)?.severityPoints || 0,
  }));

  if (!riskDoc.exists()) {
    // Create new risk score
    const newScore: UserRiskScore = {
      userId,
      totalScore: Math.min(100, totalPoints),
      lastUpdated: new Date(),
      incidents,
      earnPaused: totalPoints >= DEFAULT_SCAM_CONFIG.autoBlockThreshold,
      requiresManualReview: totalPoints >= DEFAULT_SCAM_CONFIG.manualReviewThreshold,
    };

    await setDoc(riskRef, {
      ...newScore,
      lastUpdated: serverTimestamp(),
      incidents: incidents.map(i => ({ ...i, timestamp: serverTimestamp() })),
    });

    return newScore;
  }

  // Update existing risk score
  const currentData = riskDoc.data() as UserRiskScore;
  const newTotalScore = Math.min(100, currentData.totalScore + totalPoints);
  const updatedIncidents = [...currentData.incidents, ...incidents];

  const updatedScore: UserRiskScore = {
    ...currentData,
    totalScore: newTotalScore,
    lastUpdated: new Date(),
    incidents: updatedIncidents,
    earnPaused: newTotalScore >= DEFAULT_SCAM_CONFIG.autoBlockThreshold,
    requiresManualReview: newTotalScore >= DEFAULT_SCAM_CONFIG.manualReviewThreshold,
  };

  await updateDoc(riskRef, {
    totalScore: newTotalScore,
    lastUpdated: serverTimestamp(),
    incidents: updatedIncidents.map(i => ({ ...i, timestamp: serverTimestamp() })),
    earnPaused: updatedScore.earnPaused,
    requiresManualReview: updatedScore.requiresManualReview,
  });

  return updatedScore;
}

/**
 * Get user's current risk score
 */
export async function getUserRiskScore(userId: string): Promise<UserRiskScore | null> {
  try {
    const riskRef = doc(db, 'userRiskScores', userId);
    const riskDoc = await getDoc(riskRef);

    if (!riskDoc.exists()) {
      return null;
    }

    return riskDoc.data() as UserRiskScore;
  } catch (error) {
    console.error('Error getting user risk score:', error);
    return null;
  }
}

/**
 * Check if user's earning is paused due to scam behavior
 */
export async function isEarningPaused(userId: string): Promise<boolean> {
  const riskScore = await getUserRiskScore(userId);
  return riskScore?.earnPaused || false;
}

/**
 * Submit a Stop-Scam report (silent, confidential)
 * Reporter identity is NOT revealed to the reported user
 */
export async function submitStopScamReport(
  reporterId: string,
  reportedUserId: string,
  chatId: string,
  messageId?: string,
  reason?: string
): Promise<StopScamReport> {
  const report: StopScamReport = {
    reportId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    reporterId,
    reportedUserId,
    chatId,
    messageId,
    timestamp: new Date(),
    reason: reason || 'Financial manipulation suspected',
    status: 'PENDING',
  };

  // Store report in Firestore
  await addDoc(collection(db, 'stopScamReports'), {
    ...report,
    timestamp: serverTimestamp(),
  });

  // Increase reported user's risk score significantly
  await updateUserRiskScore(reportedUserId, [
    {
      patternType: 'EMOTIONAL_BLACKMAIL',
      matchedPhrase: 'user_reported',
      confidence: 1.0,
      context: 'Manual user report',
    },
  ]);

  // Add +45 points directly for being reported
  const riskRef = doc(db, 'userRiskScores', reportedUserId);
  await updateDoc(riskRef, {
    totalScore: increment(45),
    requiresManualReview: true,
  });

  return report;
}

/**
 * Process refund for confirmed romance scam
 * Returns 100% tokens to victim
 */
export async function processScamRefund(
  victimUserId: string,
  scammerUserId: string,
  chatId: string,
  transactionIds: string[],
  reason: string
): Promise<RefundRecord> {
  try {
    // Calculate total tokens to refund
    let totalTokens = 0;
    
    for (const txId of transactionIds) {
      const txRef = doc(db, 'transactions', txId);
      const txDoc = await getDoc(txRef);
      
      if (txDoc.exists()) {
        const txData = txDoc.data();
        totalTokens += txData.tokensAmount || 0;
      }
    }

    const refund: RefundRecord = {
      refundId: `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      victimUserId,
      scammerUserId,
      chatId,
      tokensRefunded: totalTokens,
      transactionIds,
      reason,
      issuedAt: new Date(),
      status: 'PENDING',
    };

    // Store refund record
    const refundRef = await addDoc(collection(db, 'refunds'), {
      ...refund,
      issuedAt: serverTimestamp(),
    });

    // Credit victim's wallet
    const victimWalletRef = doc(db, 'balances', victimUserId, 'wallet', 'wallet');
    await updateDoc(victimWalletRef, {
      tokens: increment(totalTokens),
      lastUpdated: serverTimestamp(),
    });

    // Deduct from scammer's wallet
    const scammerWalletRef = doc(db, 'balances', scammerUserId, 'wallet', 'wallet');
    await updateDoc(scammerWalletRef, {
      tokens: increment(-totalTokens),
      lastUpdated: serverTimestamp(),
    });

    // Permanently block scammer's earning
    const scammerRiskRef = doc(db, 'userRiskScores', scammerUserId);
    await updateDoc(scammerRiskRef, {
      totalScore: 100,
      earnPaused: true,
      requiresManualReview: true,
      accountSuspended: true,
    });

    // Update refund status to completed
    await updateDoc(doc(db, 'refunds', refundRef.id), {
      status: 'COMPLETED',
    });

    return { ...refund, status: 'COMPLETED' };
  } catch (error) {
    console.error('Error processing scam refund:', error);
    throw new Error('Failed to process refund');
  }
}

/**
 * Get all reports for a specific user (for moderation dashboard)
 */
export async function getUserReports(userId: string): Promise<StopScamReport[]> {
  try {
    const reportsQuery = query(
      collection(db, 'stopScamReports'),
      where('reportedUserId', '==', userId)
    );
    
    const snapshot = await getDocs(reportsQuery);
    return snapshot.docs.map(doc => doc.data() as StopScamReport);
  } catch (error) {
    console.error('Error getting user reports:', error);
    return [];
  }
}

/**
 * Confirm a scam report and take action
 * This would typically be called by a moderation panel
 */
export async function confirmScamReport(
  reportId: string,
  reviewerId: string,
  action: ScamAction,
  shouldRefund: boolean,
  transactionIds?: string[]
): Promise<void> {
  try {
    // Get the report
    const reportsQuery = query(
      collection(db, 'stopScamReports'),
      where('reportId', '==', reportId)
    );
    const snapshot = await getDocs(reportsQuery);
    
    if (snapshot.empty) {
      throw new Error('Report not found');
    }

    const reportDoc = snapshot.docs[0];
    const report = reportDoc.data() as StopScamReport;

    // Update report status
    await updateDoc(reportDoc.ref, {
      status: 'CONFIRMED_SCAM',
      reviewedBy: reviewerId,
      reviewedAt: serverTimestamp(),
      actionTaken: action,
    });

    // Process refund if requested
    if (shouldRefund && transactionIds && transactionIds.length > 0) {
      await processScamRefund(
        report.reporterId,
        report.reportedUserId,
        report.chatId,
        transactionIds,
        'Confirmed romance scam'
      );
    }

    // Take additional action based on severity
    if (action === 'ACCOUNT_SUSPENDED') {
      const userRef = doc(db, 'users', report.reportedUserId);
      await updateDoc(userRef, {
        accountStatus: 'SUSPENDED',
        suspendedReason: 'Romance scam confirmed',
        suspendedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('Error confirming scam report:', error);
    throw error;
  }
}

/**
 * Check if a message should show a subtle warning
 * Returns warning message if needed, null otherwise
 */
export function getSubtleWarning(riskLevel: RiskLevel): string | null {
  switch (riskLevel) {
    case 'MEDIUM':
      return 'Be yourself — you don\'t need to buy anything to be liked.';
    case 'HIGH':
      return 'If a conversation turns into financial pressure — report it and we\'ll help.';
    case 'CRITICAL':
      return 'Real feelings are free. They don\'t require payment.';
    default:
      return null;
  }
}

/**
 * Decay risk score over time (called periodically)
 * Good behavior reduces risk score
 */
export async function decayRiskScore(userId: string, decayAmount: number = 5): Promise<void> {
  try {
    const riskRef = doc(db, 'userRiskScores', userId);
    const riskDoc = await getDoc(riskRef);

    if (!riskDoc.exists()) return;

    const currentScore = riskDoc.data().totalScore || 0;
    const newScore = Math.max(0, currentScore - decayAmount);

    await updateDoc(riskRef, {
      totalScore: newScore,
      lastUpdated: serverTimestamp(),
      earnPaused: newScore >= DEFAULT_SCAM_CONFIG.autoBlockThreshold,
      requiresManualReview: newScore >= DEFAULT_SCAM_CONFIG.manualReviewThreshold,
    });
  } catch (error) {
    console.error('Error decaying risk score:', error);
  }
}