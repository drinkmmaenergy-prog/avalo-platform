/**
 * PACK 367: POSITIVE REVIEW FUNNEL (SAFE MODE)
 * Manages ethical review prompts to users
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import {
  StoreReviewPrompt,
  ChurnSegment,
  Platform,
} from './types';

const db = admin.firestore();

export type TriggerType = 'positive_chat' | 'successful_meeting' | 'successful_event' | 'payout_received' | 'support_resolved';

/**
 * Review Funnel Manager
 * Handles safe and ethical review prompt triggers
 */
export class ReviewFunnelManager {
  
  /**
   * Trigger review prompt eligibility check
   */
  async triggerReviewPrompt(params: {
    userId: string;
    triggerType: TriggerType;
    triggerEventId?: string;
    platform?: Platform;
  }): Promise<{ eligible: boolean; promptId?: string; reason?: string }> {
    
    const { userId, triggerType, triggerEventId, platform } = params;
    
    // Get configuration
    const config = await this.getReviewPromptConfig();
    
    if (!config.reviewPromptRules.enabled) {
      return { eligible: false, reason: 'Review prompts disabled globally' };
    }
    
    // Check if defense actions are suppressing prompts
    const suppressActive = await this.isPromptSuppressed(platform);
    if (suppressActive) {
      return { eligible: false, reason: 'Prompts suppressed due to active defense action' };
    }
    
    // Get user data
    const userData = await this.getUserData(userId);
    if (!userData) {
      return { eligible: false, reason: 'User not found' };
    }
    
    // Check user eligibility
    const eligibilityCheck = await this.checkUserEligibility(userId, userData, config);
    if (!eligibilityCheck.eligible) {
      return { eligible: false, reason: eligibilityCheck.reason };
    }
    
    // Create prompt record
    const promptId = await this.createPromptRecord({
      userId,
      triggerType,
      triggerEventId,
      userChurnSegment: userData.churnSegment,
      userRiskScore: userData.riskScore,
    });
    
    logger.info(`Review prompt eligible for user ${userId}`, { triggerType, promptId });
    
    return { eligible: true, promptId };
  }
  
  /**
   * Check if prompts are suppressed by defense actions
   */
  private async isPromptSuppressed(platform?: Platform): Promise<boolean> {
    let query = db.collection('storeDefenseActions')
      .where('actionType', '==', 'suppress_prompts')
      .where('active', '==', true);
    
    if (platform) {
      query = query.where('platform', '==', platform);
    }
    
    const snapshot = await query.limit(1).get();
    return !snapshot.empty;
  }
  
  /**
   * Get user data including risk scores
   */
  private async getUserData(userId: string): Promise<any | null> {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) return null;
    
    const userData = userDoc.data();
    
    // Get retention data from PACK 400
    const retentionDoc = await db.collection('retentionEngine')
      .doc(userId)
      .get();
    
    const retentionData = retentionDoc.exists ? retentionDoc.data() : {};
    
    return {
      ...userData,
      churnSegment: retentionData?.churnSegment || 'ACTIVE',
      riskScore: retentionData?.riskScore || 0,
    };
  }
  
  /**
   * Check if user is eligible for review prompt
   */
  private async checkUserEligibility(
    userId: string,
    userData: any,
    config: any
  ): Promise<{ eligible: boolean; reason?: string }> {
    
    // Check churn segment
    const blockedSegments = config.reviewPromptRules.blockedChurnSegments || [
      'CHURN_RISK',
      'FRAUD_FLAG',
      'SAFETY_UNDER_REVIEW'
    ];
    
    if (blockedSegments.includes(userData.churnSegment)) {
      return {
        eligible: false,
        reason: `User in blocked churn segment: ${userData.churnSegment}`
      };
    }
    
    // Check risk score
    const maxRiskScore = config.reviewPromptRules.minUserRiskScore || 30;
    if (userData.riskScore > maxRiskScore) {
      return {
        eligible: false,
        reason: `User risk score too high: ${userData.riskScore}`
      };
    }
    
    // Check recent prompt history
    const recentPrompts = await this.getRecentPrompts(userId);
    
    // Check max prompts per user
    const maxPrompts = config.reviewPromptRules.maxPromptsPerUser || 3;
    if (recentPrompts.total >= maxPrompts) {
      return {
        eligible: false,
        reason: `User reached max prompts limit: ${maxPrompts}`
      };
    }
    
    // Check time between prompts
    const daysBetween = config.reviewPromptRules.minDaysBetweenPrompts || 30;
    if (recentPrompts.lastShownAt) {
      const daysSinceLastPrompt = 
        (Date.now() - recentPrompts.lastShownAt.toMillis()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLastPrompt < daysBetween) {
        return {
          eligible: false,
          reason: `Too soon since last prompt: ${Math.round(daysSinceLastPrompt)} days ago`
        };
      }
    }
    
    return { eligible: true };
  }
  
  /**
   * Get user's recent prompt history
   */
  private async getRecentPrompts(userId: string): Promise<{
    total: number;
    lastShownAt: admin.firestore.Timestamp | null;
  }> {
    const prompts = await db.collection('storeReviewPrompts')
      .where('userId', '==', userId)
      .orderBy('shownAt', 'desc')
      .get();
    
    return {
      total: prompts.size,
      lastShownAt: prompts.empty ? null : prompts.docs[0].data().shownAt
    };
  }
  
  /**
   * Create prompt record
   */
  private async createPromptRecord(params: {
    userId: string;
    triggerType: TriggerType;
    triggerEventId?: string;
    userChurnSegment: ChurnSegment;
    userRiskScore: number;
  }): Promise<string> {
    
    const promptRef = db.collection('storeReviewPrompts').doc();
    
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    const prompt: Omit<StoreReviewPrompt, 'id'> = {
      userId: params.userId,
      triggerType: params.triggerType,
      triggerEventId: params.triggerEventId,
      shown: false,
      responded: false,
      eligibleAt: admin.firestore.Timestamp.now(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      userChurnSegment: params.userChurnSegment,
      userRiskScore: params.userRiskScore,
      blocked: false,
    };
    
    await promptRef.set(prompt);
    
    // Log to audit (PACK 296)
    await this.logToAudit({
      action: 'review_prompt_created',
      userId: params.userId,
      promptId: promptRef.id,
      triggerType: params.triggerType,
    });
    
    // Log to retention engine (PACK 400)
    await this.logToRetentionEngine({
      userId: params.userId,
      event: 'review_prompt_eligible',
      triggerType: params.triggerType,
    });
    
    return promptRef.id;
  }
  
  /**
   * Mark prompt as shown
   */
  async markPromptShown(promptId: string): Promise<void> {
    await db.collection('storeReviewPrompts').doc(promptId).update({
      shown: true,
      shownAt: admin.firestore.Timestamp.now(),
    });
    
    const promptDoc = await db.collection('storeReviewPrompts').doc(promptId).get();
    const prompt = promptDoc.data() as StoreReviewPrompt;
    
    // Log to audit
    await this.logToAudit({
      action: 'review_prompt_shown',
      userId: prompt.userId,
      promptId,
    });
  }
  
  /**
   * Record prompt response
   */
  async recordPromptResponse(
    promptId: string,
    responseAction: 'reviewed' | 'dismissed' | 'later'
  ): Promise<void> {
    await db.collection('storeReviewPrompts').doc(promptId).update({
      responded: true,
      responseAction,
      respondedAt: admin.firestore.Timestamp.now(),
    });
    
    const promptDoc = await db.collection('storeReviewPrompts').doc(promptId).get();
    const prompt = promptDoc.data() as StoreReviewPrompt;
    
    // Log to audit
    await this.logToAudit({
      action: 'review_prompt_responded',
      userId: prompt.userId,
      promptId,
      responseAction,
    });
    
    // Log to retention engine
    await this.logToRetentionEngine({
      userId: prompt.userId,
      event: 'review_prompt_response',
      responseAction,
    });
  }
  
  /**
   * Get eligible prompts for user
   */
  async getEligiblePrompts(userId: string): Promise<StoreReviewPrompt[]> {
    const now = admin.firestore.Timestamp.now();
    
    const prompts = await db.collection('storeReviewPrompts')
      .where('userId', '==', userId)
      .where('shown', '==', false)
      .where('blocked', '==', false)
      .where('expiresAt', '>', now)
      .orderBy('expiresAt', 'asc')
      .orderBy('eligibleAt', 'desc')
      .get();
    
    return prompts.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as StoreReviewPrompt[];
  }
  
  /**
   * Block a prompt (e.g., if user's status changed)
   */
  async blockPrompt(promptId: string, reason: string): Promise<void> {
    await db.collection('storeReviewPrompts').doc(promptId).update({
      blocked: true,
      blockReason: reason,
    });
    
    logger.info(`Review prompt blocked: ${promptId}`, { reason });
  }
  
  /**
   * Get review prompt configuration
   */
  private async getReviewPromptConfig(): Promise<any> {
    const configDoc = await db.collection('storeDefenseConfig').doc('default').get();
    
    if (!configDoc.exists) {
      return {
        reviewPromptRules: {
          enabled: true,
          minDaysBetweenPrompts: 30,
          blockedChurnSegments: ['CHURN_RISK', 'FRAUD_FLAG', 'SAFETY_UNDER_REVIEW'],
          minUserRiskScore: 30,
          maxPromptsPerUser: 3,
        }
      };
    }
    
    return configDoc.data();
  }
  
  /**
   * Log to audit system (PACK 296)
   */
  private async logToAudit(data: any): Promise<void> {
    await db.collection('auditLogs').add({
      ...data,
      system: 'store-defense',
      pack: 'PACK367',
      timestamp: admin.firestore.Timestamp.now(),
    });
  }
  
  /**
   * Log to retention engine (PACK 400)
   */
  private async logToRetentionEngine(data: any): Promise<void> {
    await db.collection('retentionEvents').add({
      ...data,
      source: 'store-defense',
      pack: 'PACK367',
      timestamp: admin.firestore.Timestamp.now(),
    });
  }
  
  /**
   * Clean up expired prompts (maintenance function)
   */
  async cleanupExpiredPrompts(): Promise<void> {
    const now = admin.firestore.Timestamp.now();
    
    const expiredPrompts = await db.collection('storeReviewPrompts')
      .where('shown', '==', false)
      .where('expiresAt', '<=', now)
      .limit(100)
      .get();
    
    if (expiredPrompts.empty) return;
    
    const batch = db.batch();
    
    expiredPrompts.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    logger.info(`Cleaned up ${expiredPrompts.size} expired review prompts`);
  }
}
