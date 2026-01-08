/**
 * PACK 439 - App Store Trust, Ratings & Review Shield
 * DefensiveMitigationOrchestrator - Automated defensive actions
 * 
 * Dependencies: PACK 296, 299, 324, 365, 437, 438
 * Status: ACTIVE
 */

import { db } from '../lib/firebase-admin';
import { auditLog } from './pack296-audit-logger';
import { sendAlert } from './pack299-analytics-safety';
import { killSwitchService } from './pack365-kill-switch';
import { reviewBombingDetector, BombingDetectionResult } from './pack439-review-bombing-detector';
import { storeTrustScoreService } from './pack439-store-trust-score';
import { ratingVelocityMonitor } from './pack439-rating-velocity-monitor';
import { Timestamp } from 'firebase-admin/firestore';

export interface MitigationAction {
  id: string;
  type: 'mute_rating_prompts' | 'pause_ua_campaigns' | 'throttle_feature' | 'escalate_manual' | 'emergency_rollback';
  reason: string;
  platform: 'ios' | 'android';
  triggeredBy: 'bombing_detection' | 'trust_score' | 'velocity_spike' | 'manual';
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt: Timestamp;
  completedAt?: Timestamp;
  metadata: any;
}

export interface MitigationStrategy {
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  actions: MitigationAction['type'][];
  autoExecute: boolean;
  requiresApproval: boolean;
}

export interface ThreatAssessment {
  platform: 'ios' | 'android';
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  
  factors: {
    bombingDetected: boolean;
    bombingConfidence: number;
    trustScore: number;
    trustGrade: string;
    velocityAnomaly: boolean;
    uninstallSpike: boolean;
    crashCorrelation: boolean;
  };
  
  recommendedActions: MitigationAction['type'][];
  autoMitigationEnabled: boolean;
  timestamp: Timestamp;
}

export class DefensiveMitigationOrchestrator {
  private activeMitigations: Map<string, MitigationAction> = new Map();

  // Threat level thresholds
  private readonly TRUST_SCORE_THRESHOLDS = {
    critical: 40,
    high: 55,
    medium: 70,
  };

  /**
   * Assess current threat level and recommend mitigations
   */
  async assessThreat(platform: 'ios' | 'android'): Promise<ThreatAssessment> {
    try {
      // Gather intelligence from multiple sources
      const [bombingResult, trustScore, velocitySnapshot] = await Promise.all([
        reviewBombingDetector.detectBombing(platform, 24),
        storeTrustScoreService.getTrustScore(platform),
        ratingVelocityMonitor.getCurrentSnapshot(platform),
      ]);

      // Calculate threat level
      const threatLevel = this.calculateThreatLevel(
        bombingResult,
        trustScore.score,
        velocitySnapshot
      );

      // Determine recommended actions
      const recommendedActions = this.determineActions(
        threatLevel,
        bombingResult,
        trustScore,
        velocitySnapshot
      );

      // Check if auto-mitigation is enabled
      const autoMitigationEnabled = await this.isAutoMitigationEnabled(platform);

      const assessment: ThreatAssessment = {
        platform,
        threatLevel,
        confidence: this.calculateConfidence(bombingResult, trustScore, velocitySnapshot),
        factors: {
          bombingDetected: bombingResult.isBombing,
          bombingConfidence: bombingResult.confidence,
          trustScore: trustScore.score,
          trustGrade: trustScore.grade,
          velocityAnomaly: velocitySnapshot?.velocityAnomaly || false,
          uninstallSpike: velocitySnapshot?.uninstallSpike || false,
          crashCorrelation: velocitySnapshot?.crashCorrelation || false,
        },
        recommendedActions,
        autoMitigationEnabled,
        timestamp: Timestamp.now(),
      };

      // Save assessment
      await this.saveAssessment(assessment);

      // Auto-execute if enabled and threat is high
      if (autoMitigationEnabled && (threatLevel === 'critical' || threatLevel === 'high')) {
        await this.executeMitigationStrategy(platform, threatLevel, 'automatic', assessment);
      } else if (threatLevel === 'critical') {
        // Always alert on critical, even if auto-mitigation is off
        await sendAlert({
          type: 'critical_threat_detected',
          severity: 'critical',
          data: {
            platform,
            assessment,
            message: 'Critical threat detected - manual intervention required',
          },
        });
      }

      await auditLog({
        action: 'threat_assessment',
        userId: 'system',
        metadata: {
          platform,
          threatLevel,
          bombingDetected: bombingResult.isBombing,
          trustScore: trustScore.score,
        },
        packId: 'PACK-439',
      });

      return assessment;

    } catch (error) {
      console.error('[DefensiveMitigationOrchestrator] Assessment error:', error);
      throw error;
    }
  }

  /**
   * Execute mitigation strategy
   */
  async executeMitigationStrategy(
    platform: 'ios' | 'android',
    threatLevel: ThreatAssessment['threatLevel'],
    triggeredBy: 'automatic' | 'manual',
    assessment: ThreatAssessment
  ): Promise<MitigationAction[]> {
    const actions: MitigationAction[] = [];

    for (const actionType of assessment.recommendedActions) {
      const action = await this.executeMitigationAction(
        platform,
        actionType,
        `Mitigation for ${threatLevel} threat`,
        triggeredBy === 'automatic' ? 'bombing_detection' : 'manual',
        assessment
      );
      
      if (action) {
        actions.push(action);
      }
    }

    await sendAlert({
      type: 'mitigation_strategy_executed',
      severity: threatLevel === 'critical' ? 'critical' : 'high',
      data: {
        platform,
        threatLevel,
        actionsExecuted: actions.length,
        triggeredBy,
      },
    });

    return actions;
  }

  /**
   * Execute a single mitigation action
   */
  async executeMitigationAction(
    platform: 'ios' | 'android',
    type: MitigationAction['type'],
    reason: string,
    triggeredBy: MitigationAction['triggeredBy'],
    metadata: any
  ): Promise<MitigationAction | null> {
    try {
      const action: MitigationAction = {
        id: `mitigation_${Date.now()}_${type}`,
        type,
        reason,
        platform,
        triggeredBy,
        status: 'pending',
        startedAt: Timestamp.now(),
        metadata,
      };

      // Execute the action
      switch (type) {
        case 'mute_rating_prompts':
          await this.muteRatingPrompts(platform);
          break;

        case 'pause_ua_campaigns':
          await this.pauseUACampaigns(platform);
          break;

        case 'throttle_feature':
          await this.throttleHighRiskFeatures(platform);
          break;

        case 'escalate_manual':
          await this.escalateToManualReview(platform, metadata);
          break;

        case 'emergency_rollback':
          await this.initiateEmergencyRollback(platform);
          break;

        default:
          throw new Error(`Unknown mitigation action type: ${type}`);
      }

      action.status = 'active';
      action.completedAt = Timestamp.now();

      // Save and track
      await this.saveMitigationAction(action);
      this.activeMitigations.set(action.id, action);

      await auditLog({
        action: 'mitigation_executed',
        userId: 'system',
        metadata: {
          actionId: action.id,
          type,
          platform,
          triggeredBy,
        },
        packId: 'PACK-439',
      });

      return action;

    } catch (error) {
      console.error(`[DefensiveMitigationOrchestrator] Action ${type} failed:`, error);
      return null;
    }
  }

  /**
   * Mute rating prompts to prevent more reviews during attack
   */
  private async muteRatingPrompts(platform: 'ios' | 'android'): Promise<void> {
    await db.collection('featureFlags').doc(`rating_prompts_${platform}`).set({
      enabled: false,
      mutedBy: 'PACK-439',
      mutedAt: Timestamp.now(),
      reason: 'Defensive mitigation active',
    });

    await sendAlert({
      type: 'rating_prompts_muted',
      severity: 'medium',
      data: { platform, message: 'Rating prompts temporarily disabled' },
    });
  }

  /**
   * Pause UA (User Acquisition) campaigns
   */
  private async pauseUACampaigns(platform: 'ios' | 'android'): Promise<void> {
    await db.collection('featureFlags').doc(`ua_campaigns_${platform}`).set({
      paused: true,
      pausedBy: 'PACK-439',
      pausedAt: Timestamp.now(),
      reason: 'Store trust protection',
    });

    await sendAlert({
      type: 'ua_campaigns_paused',
      severity: 'high',
      data: { platform, message: 'UA campaigns paused due to threat detection' },
    });
  }

  /**
   * Throttle high-risk features via PACK 365
   */
  private async throttleHighRiskFeatures(platform: 'ios' | 'android'): Promise<void> {
    // Use kill switch service to throttle features
    const highRiskFeatures = await this.identifyHighRiskFeatures(platform);

    for (const featureId of highRiskFeatures) {
      await killSwitchService.setFeatureState(featureId, 'partial', {
        reason: 'Defensive mitigation',
        throttlePercentage: 50,
      });
    }

    await sendAlert({
      type: 'features_throttled',
      severity: 'medium',
      data: {
        platform,
        features: highRiskFeatures,
        message: 'High-risk features throttled to 50%',
      },
    });
  }

  /**
   * Escalate to manual review by ops/legal team
   */
  private async escalateToManualReview(platform: 'ios' | 'android', assessment: any): Promise<void> {
    await db.collection('manualReviewQueue').add({
      type: 'store_threat',
      platform,
      priority: 'high',
      assessment,
      createdAt: Timestamp.now(),
      status: 'pending',
      assignedTo: null,
    });

    await sendAlert({
      type: 'manual_review_escalated',
      severity: 'critical',
      data: {
        platform,
        message: 'Critical threat requires immediate manual review',
      },
    });
  }

  /**
   * Initiate emergency rollback
   */
  private async initiateEmergencyRollback(platform: 'ios' | 'android'): Promise<void> {
    await killSwitchService.emergencyKillSwitch(
      `${platform}_app`,
      'Critical store threat detected'
    );

    await sendAlert({
      type: 'emergency_rollback_initiated',
      severity: 'critical',
      data: {
        platform,
        message: 'Emergency rollback initiated due to critical threat',
      },
    });
  }

  /**
   * Revert a mitigation action
   */
  async revertMitigation(actionId: string): Promise<void> {
    const action = this.activeMitigations.get(actionId);
    
    if (!action) {
      const doc = await db.collection('mitigationActions').doc(actionId).get();
      if (!doc.exists) {
        throw new Error(`Mitigation action ${actionId} not found`);
      }
    }

    const actionData = action || (await db.collection('mitigationActions').doc(actionId).get()).data() as MitigationAction;

    // Revert based on type
    switch (actionData.type) {
      case 'mute_rating_prompts':
        await db.collection('featureFlags').doc(`rating_prompts_${actionData.platform}`).update({
          enabled: true,
          unmutedAt: Timestamp.now(),
        });
        break;

      case 'pause_ua_campaigns':
        await db.collection('featureFlags').doc(`ua_campaigns_${actionData.platform}`).update({
          paused: false,
          resumedAt: Timestamp.now(),
        });
        break;

      case 'throttle_feature':
        // Restore features
        const features = await this.identifyHighRiskFeatures(actionData.platform);
        for (const featureId of features) {
          await killSwitchService.setFeatureState(featureId, 'enabled', {
            reason: 'Mitigation reverted',
          });
        }
        break;
    }

    // Update action status
    await db.collection('mitigationActions').doc(actionId).update({
      status: 'completed',
      revertedAt: Timestamp.now(),
    });

    this.activeMitigations.delete(actionId);

    await auditLog({
      action: 'mitigation_reverted',
      userId: 'admin',
      metadata: { actionId, type: actionData.type, platform: actionData.platform },
      packId: 'PACK-439',
    });
  }

  /**
   * Get all active mitigations
   */
  async getActiveMitigations(platform?: 'ios' | 'android'): Promise<MitigationAction[]> {
    let query = db
      .collection('mitigationActions')
      .where('status', '==', 'active');

    if (platform) {
      query = query.where('platform', '==', platform);
    }

    const snapshot = await query.orderBy('startedAt', 'desc').get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as MitigationAction));
  }

  // Private helper methods

  private calculateThreatLevel(
    bombingResult: BombingDetectionResult,
    trustScore: number,
    velocitySnapshot: any
  ): ThreatAssessment['threatLevel'] {
    // Critical: bombing + low trust score
    if (
      bombingResult.isBombing &&
      bombingResult.confidence > 0.8 &&
      trustScore < this.TRUST_SCORE_THRESHOLDS.critical
    ) {
      return 'critical';
    }

    // High: bombing detected or very low trust
    if (
      (bombingResult.isBombing && bombingResult.confidence > 0.7) ||
      trustScore < this.TRUST_SCORE_THRESHOLDS.critical
    ) {
      return 'high';
    }

    // Medium: moderate bombing signals or low trust
    if (
      bombingResult.signals.length >= 2 ||
      trustScore < this.TRUST_SCORE_THRESHOLDS.high ||
      velocitySnapshot?.crashCorrelation
    ) {
      return 'medium';
    }

    // Low: some concerning signals
    if (
      bombingResult.signals.length > 0 ||
      trustScore < this.TRUST_SCORE_THRESHOLDS.medium ||
      velocitySnapshot?.velocityAnomaly
    ) {
      return 'low';
    }

    return 'low';
  }

  private determineActions(
    threatLevel: ThreatAssessment['threatLevel'],
    bombingResult: BombingDetectionResult,
    trustScore: any,
    velocitySnapshot: any
  ): MitigationAction['type'][] {
    const actions: MitigationAction['type'][] = [];

    switch (threatLevel) {
      case 'critical':
        actions.push('emergency_rollback');
        actions.push('escalate_manual');
        actions.push('pause_ua_campaigns');
        actions.push('mute_rating_prompts');
        break;

      case 'high':
        actions.push('escalate_manual');
        actions.push('pause_ua_campaigns');
        actions.push('mute_rating_prompts');
        actions.push('throttle_feature');
        break;

      case 'medium':
        actions.push('mute_rating_prompts');
        actions.push('throttle_feature');
        break;

      case 'low':
        // Monitor only, no automatic actions
        break;
    }

    return actions;
  }

  private calculateConfidence(
    bombingResult: BombingDetectionResult,
    trustScore: any,
    velocitySnapshot: any
  ): number {
    let confidence = 0;
    let factors = 0;

    if (bombingResult.isBombing) {
      confidence += bombingResult.confidence;
      factors++;
    }

    if (trustScore.score < 70) {
      confidence += (70 - trustScore.score) / 70;
      factors++;
    }

    if (velocitySnapshot?.velocityAnomaly) {
      confidence += 0.7;
      factors++;
    }

    return factors > 0 ? confidence / factors : 0;
  }

  private async isAutoMitigationEnabled(platform: 'ios' | 'android'): Promise<boolean> {
    const doc = await db.collection('config').doc(`pack439_${platform}`).get();
    return doc.exists ? (doc.data()?.autoMitigationEnabled !== false) : true;
  }

  private async identifyHighRiskFeatures(platform: 'ios' | 'android'): Promise<string[]> {
    // Placeholder - would be customized per app
    return ['premium_features', 'social_sharing', 'user_invites'];
  }

  private async saveAssessment(assessment: ThreatAssessment): Promise<void> {
    await db.collection('threatAssessments').add(assessment);
  }

  private async saveMitigationAction(action: MitigationAction): Promise<void> {
    await db.collection('mitigationActions').doc(action.id).set(action);
  }
}

export const defensiveMitigationOrchestrator = new DefensiveMitigationOrchestrator();
