/**
 * PACK 328A: Identity Verification Engine
 * Triggers, enforcement, and wallet locking logic
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  IdentityVerificationRequest,
  IdentityVerificationResult,
  VerificationAuditLog,
  EnforcementAction,
  VerificationReason,
  VerificationProvider,
  VerificationStatus,
  VERIFICATION_CONFIG,
  VERIFICATION_TRIGGERS,
  VerificationInput,
  DocumentType,
} from './pack328a-identity-verification-types';
import { VerificationProviderFactory } from './pack328a-verification-providers';

// ============================================================================
// Verification Request Management
// ============================================================================

export class VerificationEngine {
  
  /**
   * Create a verification request for a user
   */
  static async createVerificationRequest(
    userId: string,
    reason: VerificationReason,
    metadata?: any
  ): Promise<string> {
    console.log(`[VerificationEngine] Creating verification request for ${userId}, reason: ${reason}`);
    
    // Check if there's already a pending request
    const existingRequest = await this.getPendingRequest(userId);
    if (existingRequest) {
      console.log(`[VerificationEngine] User ${userId} already has pending request: ${existingRequest.id}`);
      return existingRequest.id;
    }

    // Select appropriate provider based on reason
    const provider = this.selectProvider(reason);
    
    // Create verification request
    const requestData: IdentityVerificationRequest = {
      userId,
      reason,
      provider,
      status: 'PENDING',
      requestedAt: Timestamp.now(),
      timeoutAt: Timestamp.fromMillis(
        Date.now() + VERIFICATION_CONFIG.VERIFICATION_TIMEOUT_HOURS * 60 * 60 * 1000
      ),
      metadata,
    };

    const requestRef = await db.collection('identityVerificationRequests').add(requestData);
    
    // Apply immediate restrictions
    await this.applyPendingRestrictions(userId, reason);
    
    // Log audit trail
    await this.logAudit({
      userId,
      action: 'REQUEST_CREATED',
      timestamp: Timestamp.now(),
      performedBy: 'SYSTEM',
      requestId: requestRef.id,
      details: { reason, provider, metadata },
    });

    console.log(`[VerificationEngine] Created verification request: ${requestRef.id}`);
    return requestRef.id;
  }

  /**
   * Process a verification request with uploaded documents
   */
  static async processVerification(
    requestId: string,
    documents: { type: DocumentType; data: Buffer | string }[]
  ): Promise<IdentityVerificationResult> {
    console.log(`[VerificationEngine] Processing verification request: ${requestId}`);
    
    // Get request
    const requestDoc = await db.collection('identityVerificationRequests').doc(requestId).get();
    if (!requestDoc.exists) {
      throw new Error('Verification request not found');
    }

    const request = requestDoc.data() as IdentityVerificationRequest;
    
    if (request.status !== 'PENDING') {
      throw new Error(`Request is not pending: ${request.status}`);
    }

    // Get provider and verify
    const provider = VerificationProviderFactory.getProvider(request.provider);
    
    const input: VerificationInput = {
      userId: request.userId,
      requestId,
      documents,
      metadata: request.metadata,
    };

    // Log verification start
    await this.logAudit({
      userId: request.userId,
      action: 'VERIFICATION_STARTED',
      timestamp: Timestamp.now(),
      performedBy: 'SYSTEM',
      requestId,
      details: { provider: request.provider },
    });

    // Perform verification
    const output = await provider.verifyIdentity(input);

    // Create result
    const result: IdentityVerificationResult = {
      userId: request.userId,
      verified: output.verified,
      ageConfirmed: output.ageConfirmed,
      identityMatch: output.identityMatch,
      provider: request.provider,
      reviewedBy: 'AI',
      createdAt: Timestamp.now(),
      extractedData: output.extractedData,
      confidence: output.confidence,
      failureReasons: output.failureReasons,
    };

    const resultRef = await db.collection('identityVerificationResults').add(result);

    // Update request status
    const newStatus: VerificationStatus = output.verified ? 'VERIFIED' : 'REJECTED';
    await requestDoc.ref.update({
      status: newStatus,
      completedAt: Timestamp.now(),
    });

    // Apply enforcement based on result
    await this.applyEnforcement(request.userId, request.reason, result);

    // Log completion
    await this.logAudit({
      userId: request.userId,
      action: 'VERIFICATION_COMPLETED',
      timestamp: Timestamp.now(),
      performedBy: 'SYSTEM',
      requestId,
      resultId: resultRef.id,
      details: { verified: output.verified, status: newStatus },
    });

    console.log(`[VerificationEngine] Verification completed: ${resultRef.id}, verified: ${output.verified}`);
    return result;
  }

  /**
   * Trigger verification based on conditions
   */
  static async triggerVerificationIfNeeded(
    userId: string,
    context: {
      selfieMismatch?: boolean;
      profileMismatchReported?: boolean;
      fraudScore?: number;
      estimatedAge?: number;
      underageFlag?: boolean;
    }
  ): Promise<boolean> {
    console.log(`[VerificationEngine] Checking triggers for user ${userId}`, context);
    
    // Check all triggers
    for (const trigger of VERIFICATION_TRIGGERS) {
      if (trigger.condition(context)) {
        console.log(`[VerificationEngine] Trigger matched: ${trigger.reason}`);
        
        // Create verification request
        await this.createVerificationRequest(userId, trigger.reason, {
          triggeredBy: 'AUTOMATED_SYSTEM',
          context,
        });
        
        return true;
      }
    }
    
    console.log(`[VerificationEngine] No triggers matched for user ${userId}`);
    return false;
  }

  // ============================================================================
  // Enforcement Logic
  // ============================================================================

  /**
   * Apply restrictions while verification is pending
   */
  private static async applyPendingRestrictions(
    userId: string,
    reason: VerificationReason
  ): Promise<void> {
    console.log(`[VerificationEngine] Applying pending restrictions for ${userId}`);
    
    const restrictions = {
      payoutBlocked: true,
      profileVisible: reason !== 'UNDERAGE_RISK', // Hide profile if underage suspected
      chatDisabled: false,
      callsDisabled: true,
      calendarDisabled: true,
    };

    await db.collection('users').doc(userId).update({
      'wallet.payoutBlocked': restrictions.payoutBlocked,
      'profile.visibility': restrictions.profileVisible ? 'PUBLIC' : 'HIDDEN',
      'restrictions.chatDisabled': restrictions.chatDisabled,
      'restrictions.callsDisabled': restrictions.callsDisabled,
      'restrictions.calendarDisabled': restrictions.calendarDisabled,
      'restrictions.reason': 'PENDING_IDENTITY_VERIFICATION',
      'restrictions.appliedAt': Timestamp.now(),
    });

    // Also update wallet directly
    await db.collection('wallets').doc(userId).update({
      payoutBlocked: true,
      blockedReason: 'PENDING_IDENTITY_VERIFICATION',
      blockedAt: Timestamp.now(),
    });
  }

  /**
   * Apply enforcement based on verification result
   */
  private static async applyEnforcement(
    userId: string,
    reason: VerificationReason,
    result: IdentityVerificationResult
  ): Promise<void> {
    console.log(`[VerificationEngine] Applying enforcement for ${userId}`, {
      verified: result.verified,
      ageConfirmed: result.ageConfirmed,
    });

    let action: EnforcementAction['action'];
    let expiresAt: Timestamp | undefined;
    let restrictions;

    // Determine enforcement action
    if (!result.ageConfirmed && result.extractedData?.age && result.extractedData.age < 18) {
      // UNDERAGE - Permanent ban
      action = 'BAN_UNDERAGE';
      restrictions = {
        payoutBlocked: true,
        profileVisible: false,
        chatDisabled: true,
        callsDisabled: true,
        calendarDisabled: true,
      };
    } else if (!result.identityMatch) {
      // Identity mismatch - Profile freeze
      action = 'FREEZE_PROFILE';
      restrictions = {
        payoutBlocked: true,
        profileVisible: false,
        chatDisabled: true,
        callsDisabled: true,
        calendarDisabled: true,
      };
    } else if (reason === 'FRAUD_FLAG' && !result.verified) {
      // Fraud confirmed - Wallet lock
      action = 'LOCK_WALLET';
      restrictions = {
        payoutBlocked: true,
        profileVisible: true,
        chatDisabled: false,
        callsDisabled: true,
        calendarDisabled: true,
      };
    } else if (result.verified && result.ageConfirmed) {
      // VERIFIED - Remove all restrictions
      await this.removeRestrictions(userId);
      
      await this.logAudit({
        userId,
        action: 'ENFORCEMENT_APPLIED',
        timestamp: Timestamp.now(),
        performedBy: 'SYSTEM',
        details: { action: 'RESTRICTIONS_REMOVED', verified: true },
      });
      
      return;
    } else {
      // Default temporary suspension
      action = 'SUSPEND_TEMPORARY';
      expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      restrictions = {
        payoutBlocked: true,
        profileVisible: false,
        chatDisabled: false,
        callsDisabled: true,
        calendarDisabled: true,
      };
    }

    // Apply enforcement
    const enforcement: EnforcementAction = {
      userId,
      action,
      reason,
      appliedAt: Timestamp.now(),
      expiresAt,
      restrictions,
    };

    await db.collection('enforcementActions').add(enforcement);

    // Update user document
    await db.collection('users').doc(userId).update({
      'wallet.payoutBlocked': restrictions.payoutBlocked,
      'profile.visibility': restrictions.profileVisible ? 'PUBLIC' : 'HIDDEN',
      'restrictions.chatDisabled': restrictions.chatDisabled,
      'restrictions.callsDisabled': restrictions.callsDisabled,
      'restrictions.calendarDisabled': restrictions.calendarDisabled,
      'restrictions.enforcementAction': action,
      'restrictions.reason': `VERIFICATION_FAILED_${reason}`,
      'restrictions.appliedAt': Timestamp.now(),
      'restrictions.expiresAt': expiresAt || null,
    });

    // Update wallet
    await db.collection('wallets').doc(userId).update({
      payoutBlocked: restrictions.payoutBlocked,
      blockedReason: `VERIFICATION_FAILED_${reason}`,
      blockedAt: Timestamp.now(),
    });

    // If underage, also ban from platform
    if (action === 'BAN_UNDERAGE') {
      await db.collection('users').doc(userId).update({
        accountStatus: 'BANNED',
        banReason: 'UNDERAGE_VERIFIED',
        bannedAt: Timestamp.now(),
      });
    }

    await this.logAudit({
      userId,
      action: 'ENFORCEMENT_APPLIED',
      timestamp: Timestamp.now(),
      performedBy: 'SYSTEM',
      details: { enforcementAction: action, restrictions },
    });

    console.log(`[VerificationEngine] Enforcement applied: ${action}`);
  }

  /**
   * Remove all verification-related restrictions
   */
  private static async removeRestrictions(userId: string): Promise<void> {
    console.log(`[VerificationEngine] Removing restrictions for ${userId}`);
    
    await db.collection('users').doc(userId).update({
      'wallet.payoutBlocked': false,
      'profile.visibility': 'PUBLIC',
      'restrictions.chatDisabled': false,
      'restrictions.callsDisabled': false,
      'restrictions.calendarDisabled': false,
      'restrictions.enforcementAction': null,
      'restrictions.reason': null,
      'restrictions.appliedAt': null,
      'restrictions.expiresAt': null,
    });

    await db.collection('wallets').doc(userId).update({
      payoutBlocked: false,
      blockedReason: null,
      blockedAt: null,
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Select provider based on verification reason
   */
  private static selectProvider(reason: VerificationReason): VerificationProvider {
    switch (reason) {
      case 'UNDERAGE_RISK':
        return 'BANK_ID'; // Highest reliability for age verification
      case 'FRAUD_FLAG':
      case 'SELFIE_FAIL':
      case 'MISMATCH':
        return 'DOC_AI'; // Good for document + selfie verification
      default:
        return 'DOC_AI';
    }
  }

  /**
   * Get pending verification request for user
   */
  private static async getPendingRequest(
    userId: string
  ): Promise<{ id: string; data: IdentityVerificationRequest } | null> {
    const snapshot = await db
      .collection('identityVerificationRequests')
      .where('userId', '==', userId)
      .where('status', '==', 'PENDING')
      .orderBy('requestedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      data: doc.data() as IdentityVerificationRequest,
    };
  }

  /**
   * Log audit event
   */
  private static async logAudit(log: VerificationAuditLog): Promise<void> {
    await db.collection('verificationAuditLog').add(log);
  }

  /**
   * Check for timeout and apply enforcement
   */
  static async checkTimeout(requestId: string): Promise<void> {
    const requestDoc = await db.collection('identityVerificationRequests').doc(requestId).get();
    
    if (!requestDoc.exists) {
      return;
    }

    const request = requestDoc.data() as IdentityVerificationRequest;
    
    if (request.status !== 'PENDING') {
      return;
    }

    const now = Date.now();
    const timeoutTime = request.timeoutAt?.toMillis() || 0;

    if (now >= timeoutTime) {
      console.log(`[VerificationEngine] Request ${requestId} timed out`);
      
      // Update request status
      await requestDoc.ref.update({
        status: 'TIMEOUT',
        completedAt: Timestamp.now(),
      });

      // Apply timeout enforcement (temporary suspension)
      const enforcement: EnforcementAction = {
        userId: request.userId,
        action: 'SUSPEND_TEMPORARY',
        reason: request.reason,
        appliedAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000), // 7 days
        restrictions: {
          payoutBlocked: true,
          profileVisible: false,
          chatDisabled: false,
          callsDisabled: true,
          calendarDisabled: true,
        },
      };

      await db.collection('enforcementActions').add(enforcement);

      await this.logAudit({
        userId: request.userId,
        action: 'TIMEOUT_TRIGGERED',
        timestamp: Timestamp.now(),
        performedBy: 'SYSTEM',
        requestId,
        details: { reason: request.reason },
      });
    }
  }
}

// ============================================================================
// Fraud Detection Integration
// ============================================================================

export class VerificationFraudIntegration {
  
  /**
   * Report verification result to fraud detection system
   */
  static async reportToFraudSystem(
    userId: string,
    result: IdentityVerificationResult
  ): Promise<void> {
    try {
      // Create fraud signal
      const signal = {
        userId,
        signalType: result.verified ? 'IDENTITY_VERIFIED' : 'IDENTITY_VERIFICATION_FAILED',
        severity: result.verified ? 'LOW' : 'HIGH',
        confidence: result.confidence?.overall || 0,
        timestamp: Timestamp.now(),
        metadata: {
          ageConfirmed: result.ageConfirmed,
          identityMatch: result.identityMatch,
          provider: result.provider,
          extractedAge: result.extractedData?.age,
          failureReasons: result.failureReasons,
        },
      };

      await db.collection('fraudSignals').add(signal);

      // Update creator trust score if applicable
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      if (userData?.isCreator) {
        const trustScoreRef = db.collection('creatorTrustScores').doc(userId);
        const trustScoreDoc = await trustScoreRef.get();
        
        if (trustScoreDoc.exists) {
          const currentScore = trustScoreDoc.data()?.score || 50;
          const adjustment = result.verified ? +10 : -20; // Reward verification, penalize failure
          
          await trustScoreRef.update({
            score: Math.max(0, Math.min(100, currentScore + adjustment)),
            lastUpdated: Timestamp.now(),
            [`verifications.${result.provider}`]: {
              verified: result.verified,
              timestamp: Timestamp.now(),
            },
          });
        }
      }

      console.log(`[VerificationFraudIntegration] Reported to fraud system: ${signal.signalType}`);
      
    } catch (error) {
      console.error('[VerificationFraudIntegration] Error reporting to fraud system:', error);
    }
  }
}