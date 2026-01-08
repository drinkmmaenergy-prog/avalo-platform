/**
 * PACK 446: AI Governance, Explainability & Model Risk Control
 * Module: AI Kill-Switch & Rollback Controller
 * 
 * Provides immediate model shutdown and rollback capabilities.
 * Integrated with PACK 365 (Kill-Switch Framework).
 */

import { logger } from 'firebase-functions';
import { ModelStatus } from './AIModelRegistry';

export enum KillSwitchTrigger {
  MANUAL = 'MANUAL',
  AUTOMATED_RISK = 'AUTOMATED_RISK',
  AUTOMATED_PERFORMANCE = 'AUTOMATED_PERFORMANCE',
  AUTOMATED_BIAS = 'AUTOMATED_BIAS',
  REGULATORY = 'REGULATORY',
  SECURITY = 'SECURITY',
  EMERGENCY = 'EMERGENCY'
}

export enum KillSwitchAction {
  DISABLE_MODEL = 'DISABLE_MODEL',
  ROLLBACK_MODEL = 'ROLLBACK_MODEL',
  THROTTLE_MODEL = 'THROTTLE_MODEL',
  ROUTE_TO_FALLBACK = 'ROUTE_TO_FALLBACK',
  ALERT_ONLY = 'ALERT_ONLY'
}

export interface KillSwitchRule {
  ruleId: string;
  modelId: string;
  enabled: boolean;
  
  // Trigger Conditions
  trigger: KillSwitchTrigger;
  conditions: RuleCondition[];
  
  // Actions
  action: KillSwitchAction;
  fallbackModelId?: string;
  throttlePercentage?: number;
  
  // Configuration
  autoResolve: boolean;
  resolutionCriteria?: string;
  notifyContacts: string[];
  
  createdAt: Date;
  createdBy: string;
  lastTriggered?: Date;
  triggerCount: number;
}

export interface RuleCondition {
  metric: string;              // e.g., 'biasScore', 'driftScore', 'errorRate'
  operator: '>' | '<' | '=' | '>=' | '<=';
  threshold: number;
  duration?: number;           // Condition must persist for N seconds
}

export interface KillSwitchEvent {
  eventId: string;
  modelId: string;
  modelVersion: string;
  
  trigger: KillSwitchTrigger;
  action: KillSwitchAction;
  reason: string;
  details: Record<string, any>;
  
  triggeredAt: Date;
  triggeredBy: string;
  automatic: boolean;
  
  // Impact Tracking
  affectedRequests?: number;
  downtimeSeconds?: number;
  
  // Resolution
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
}

export class AIKillSwitchController {
  private db: FirebaseFirestore.Firestore;
  private readonly RULES_COLLECTION = 'ai_killswitch_rules';
  private readonly EVENTS_COLLECTION = 'ai_killswitch_events';
  private readonly ACTIVE_MODELS_CACHE = 'ai_active_models_cache';

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Manually trigger kill switch
   */
  async triggerManualKillSwitch(
    modelId: string,
    action: KillSwitchAction,
    reason: string,
    triggeredBy: string,
    details?: Record<string, any>
  ): Promise<string> {
    try {
      logger.warn(`[AIKillSwitch] Manual trigger for ${modelId}: ${action}`);

      // Get model info
      const modelDoc = await this.db.collection('ai_model_registry').doc(modelId).get();
      if (!modelDoc.exists) {
        throw new Error(`Model ${modelId} not found`);
      }

      const modelData = modelDoc.data();
      const eventId = await this.executeKillSwitch({
        modelId,
        modelVersion: modelData?.version || 'unknown',
        trigger: KillSwitchTrigger.MANUAL,
        action,
        reason,
        details: details || {},
        triggeredBy,
        automatic: false
      });

      return eventId;
    } catch (error) {
      logger.error('[AIKillSwitch] Manual trigger failed:', error);
      throw error;
    }
  }

  /**
   * Execute kill switch action
   */
  private async executeKillSwitch(event: Omit<KillSwitchEvent, 'eventId' | 'triggeredAt' | 'resolved'>): Promise<string> {
    try {
      const eventId = `ks_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fullEvent: KillSwitchEvent = {
        eventId,
        ...event,
        triggeredAt: new Date(),
        resolved: false
      };

      // Execute the action
      switch (event.action) {
        case KillSwitchAction.DISABLE_MODEL:
          await this.disableModel(event.modelId, eventId);
          break;
        
        case KillSwitchAction.ROLLBACK_MODEL:
          await this.rollbackModel(event.modelId, event.reason, eventId);
          break;
        
        case KillSwitchAction.THROTTLE_MODEL:
          await this.throttleModel(event.modelId, 10, eventId); // 10% traffic
          break;
        
        case KillSwitchAction.ROUTE_TO_FALLBACK:
          await this.routeToFallback(event.modelId, eventId);
          break;
        
        case KillSwitchAction.ALERT_ONLY:
          // Just log, don't take action
          break;
      }

      // Store kill switch event
      await this.db.collection(this.EVENTS_COLLECTION).doc(eventId).set(fullEvent);

      // Send notifications
      await this.sendNotifications(fullEvent);

      // Update metrics (integration with PACK 299)
      await this.updateMetrics(fullEvent);

      logger.warn(`[AIKillSwitch] Action executed: ${event.action} for ${event.modelId}`);

      return eventId;
    } catch (error) {
      logger.error('[AIKillSwitch] Execute kill switch failed:', error);
      throw error;
    }
  }

  /**
   * Disable model completely
   */
  private async disableModel(modelId: string, eventId: string): Promise<void> {
    try {
      // Update model status in registry
      await this.db.collection('ai_model_registry').doc(modelId).update({
        status: ModelStatus.DISABLED,
        disabledAt: new Date(),
        disabledBy: 'KILL_SWITCH',
        killSwitchEventId: eventId
      });

      // Update runtime cache to reject all requests
      await this.db.collection(this.ACTIVE_MODELS_CACHE).doc(modelId).set({
        enabled: false,
        disabledAt: new Date(),
        reason: 'KILL_SWITCH_TRIGGERED'
      });

      logger.info(`[AIKillSwitch] Model disabled: ${modelId}`);
    } catch (error) {
      logger.error('[AIKillSwitch] Disable model failed:', error);
      throw error;
    }
  }

  /**
   * Rollback model to previous version
   */
  private async rollbackModel(modelId: string, reason: string, eventId: string): Promise<void> {
    try {
      const modelDoc = await this.db.collection('ai_model_registry').doc(modelId).get();
      if (!modelDoc.exists) {
        throw new Error(`Model ${modelId} not found`);
      }

      const modelData = modelDoc.data();
      if (!modelData?.previousVersion) {
        throw new Error('No previous version available for rollback');
      }

      // Perform rollback
      await this.db.collection('ai_model_registry').doc(modelId).update({
        version: modelData.previousVersion,
        previousVersion: modelData.version,
        status: ModelStatus.ROLLED_BACK,
        rolledBackAt: new Date(),
        rollbackReason: reason,
        killSwitchEventId: eventId
      });

      // Update runtime cache
      await this.db.collection(this.ACTIVE_MODELS_CACHE).doc(modelId).update({
        version: modelData.previousVersion,
        rolledBackAt: new Date()
      });

      logger.info(`[AIKillSwitch] Model rolled back: ${modelId} to v${modelData.previousVersion}`);
    } catch (error) {
      logger.error('[AIKillSwitch] Rollback model failed:', error);
      throw error;
    }
  }

  /**
   * Throttle model to reduced traffic percentage
   */
  private async throttleModel(modelId: string, percentage: number, eventId: string): Promise<void> {
    try {
      await this.db.collection(this.ACTIVE_MODELS_CACHE).doc(modelId).update({
        throttled: true,
        throttlePercentage: percentage,
        throttledAt: new Date(),
        killSwitchEventId: eventId
      });

      logger.info(`[AIKillSwitch] Model throttled: ${modelId} to ${percentage}%`);
    } catch (error) {
      logger.error('[AIKillSwitch] Throttle model failed:', error);
      throw error;
    }
  }

  /**
   * Route traffic to fallback model
   */
  private async routeToFallback(modelId: string, eventId: string): Promise<void> {
    try {
      // Get fallback model from rules
      const rulesSnapshot = await this.db.collection(this.RULES_COLLECTION)
        .where('modelId', '==', modelId)
        .where('enabled', '==', true)
        .limit(1)
        .get();

      let fallbackModelId = 'default_fallback';
      if (!rulesSnapshot.empty) {
        const rule = rulesSnapshot.docs[0].data();
        fallbackModelId = rule.fallbackModelId || fallbackModelId;
      }

      await this.db.collection(this.ACTIVE_MODELS_CACHE).doc(modelId).update({
        routedToFallback: true,
        fallbackModelId,
        fallbackAt: new Date(),
        killSwitchEventId: eventId
      });

      logger.info(`[AIKillSwitch] Traffic routed to fallback: ${modelId} -> ${fallbackModelId}`);
    } catch (error) {
      logger.error('[AIKillSwitch] Route to fallback failed:', error);
      throw error;
    }
  }

  /**
   * Create kill switch rule
   */
  async createRule(rule: Omit<KillSwitchRule, 'ruleId' | 'createdAt' | 'triggerCount'>): Promise<string> {
    try {
      const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fullRule: KillSwitchRule = {
        ruleId,
        ...rule,
        createdAt: new Date(),
        triggerCount: 0
      };

      await this.db.collection(this.RULES_COLLECTION).doc(ruleId).set(fullRule);

      logger.info(`[AIKillSwitch] Rule created: ${ruleId} for model ${rule.modelId}`);

      return ruleId;
    } catch (error) {
      logger.error('[AIKillSwitch] Create rule failed:', error);
      throw error;
    }
  }

  /**
   * Evaluate rules for a model
   */
  async evaluateRules(modelId: string, metrics: Record<string, number>): Promise<void> {
    try {
      // Get active rules for this model
      const snapshot = await this.db.collection(this.RULES_COLLECTION)
        .where('modelId', '==', modelId)
        .where('enabled', '==', true)
        .get();

      for (const doc of snapshot.docs) {
        const rule = doc.data() as KillSwitchRule;
        
        // Check if conditions are met
        const conditionsMet = this.checkConditions(rule.conditions, metrics);
        
        if (conditionsMet) {
          logger.warn(`[AIKillSwitch] Rule triggered: ${rule.ruleId} for ${modelId}`);
          
          // Get model version
          const modelDoc = await this.db.collection('ai_model_registry').doc(modelId).get();
          const modelData = modelDoc.data();
          
          // Trigger kill switch
          await this.executeKillSwitch({
            modelId,
            modelVersion: modelData?.version || 'unknown',
            trigger: rule.trigger,
            action: rule.action,
            reason: `Automated rule trigger: ${rule.ruleId}`,
            details: { rule: rule.ruleId, metrics },
            triggeredBy: 'SYSTEM',
            automatic: true
          });

          // Update rule trigger count
          await doc.ref.update({
            lastTriggered: new Date(),
            triggerCount: (rule.triggerCount || 0) + 1
          });
        }
      }
    } catch (error) {
      logger.error('[AIKillSwitch] Evaluate rules failed:', error);
      throw error;
    }
  }

  /**
   * Check if rule conditions are met
   */
  private checkConditions(conditions: RuleCondition[], metrics: Record<string, number>): boolean {
    // All conditions must be met
    return conditions.every(condition => {
      const value = metrics[condition.metric];
      if (value === undefined) return false;

      switch (condition.operator) {
        case '>': return value > condition.threshold;
        case '<': return value < condition.threshold;
        case '=': return value === condition.threshold;
        case '>=': return value >= condition.threshold;
        case '<=': return value <= condition.threshold;
        default: return false;
      }
    });
  }

  /**
   * Resolve kill switch event (re-enable model)
   */
  async resolveKillSwitch(
    eventId: string,
    resolution: string,
    resolvedBy: string
  ): Promise<void> {
    try {
      const eventDoc = await this.db.collection(this.EVENTS_COLLECTION).doc(eventId).get();
      if (!eventDoc.exists) {
        throw new Error(`Kill switch event ${eventId} not found`);
      }

      const event = eventDoc.data() as KillSwitchEvent;

      // Update event
      await eventDoc.ref.update({
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
        resolution
      });

      // Re-enable model
      await this.db.collection('ai_model_registry').doc(event.modelId).update({
        status: ModelStatus.PRODUCTION,
        reenabledAt: new Date(),
        reenabledBy: resolvedBy
      });

      // Clear cache restrictions
      await this.db.collection(this.ACTIVE_MODELS_CACHE).doc(event.modelId).update({
        enabled: true,
        throttled: false,
        routedToFallback: false,
        reenabledAt: new Date()
      });

      logger.info(`[AIKillSwitch] Event resolved: ${eventId}`);
    } catch (error) {
      logger.error('[AIKillSwitch] Resolve kill switch failed:', error);
      throw error;
    }
  }

  /**
   * Get active kill switch events
   */
  async getActiveEvents(modelId?: string): Promise<KillSwitchEvent[]> {
    try {
      let query: FirebaseFirestore.Query = this.db.collection(this.EVENTS_COLLECTION)
        .where('resolved', '==', false);

      if (modelId) {
        query = query.where('modelId', '==', modelId);
      }

      const snapshot = await query.orderBy('triggeredAt', 'desc').get();
      return snapshot.docs.map(doc => doc.data() as KillSwitchEvent);
    } catch (error) {
      logger.error('[AIKillSwitch] Get active events failed:', error);
      throw error;
    }
  }

  /**
   * Test kill switch (dry run)
   */
  async testKillSwitch(modelId: string, action: KillSwitchAction): Promise<{
    success: boolean;
    wouldAffect: number;
    fallbackAvailable: boolean;
    estimatedDowntime: number;
  }> {
    try {
      logger.info(`[AIKillSwitch] Testing kill switch for ${modelId}: ${action}`);

      // Simulate impact
      const recentRequests = await this.getRecentRequestCount(modelId);
      const fallbackAvailable = await this.checkFallbackAvailability(modelId);
      
      let estimatedDowntime = 0;
      if (action === KillSwitchAction.DISABLE_MODEL) {
        estimatedDowntime = 300; // 5 minutes to investigate and resolve
      } else if (action === KillSwitchAction.ROLLBACK_MODEL) {
        estimatedDowntime = 60; // 1 minute for rollback
      }

      return {
        success: true,
        wouldAffect: recentRequests,
        fallbackAvailable,
        estimatedDowntime
      };
    } catch (error) {
      logger.error('[AIKillSwitch] Test kill switch failed:', error);
      return {
        success: false,
        wouldAffect: 0,
        fallbackAvailable: false,
        estimatedDowntime: 0
      };
    }
  }

  /**
   * Get recent request count for a model
   */
  private async getRecentRequestCount(modelId: string): Promise<number> {
    // In production, would query actual request logs
    // For now, return simulated count
    return Math.floor(Math.random() * 10000) + 1000;
  }

  /**
   * Check if fallback model is available
   */
  private async checkFallbackAvailability(modelId: string): Promise<boolean> {
    try {
      const rulesSnapshot = await this.db.collection(this.RULES_COLLECTION)
        .where('modelId', '==', modelId)
        .where('enabled', '==', true)
        .limit(1)
        .get();

      if (rulesSnapshot.empty) {
        return false;
      }

      const rule = rulesSnapshot.docs[0].data();
      return !!rule.fallbackModelId;
    } catch (error) {
      return false;
    }
  }

  /**
   * Send notifications for kill switch event
   */
  private async sendNotifications(event: KillSwitchEvent): Promise<void> {
    try {
      // Get notification contacts from rules
      const rulesSnapshot = await this.db.collection(this.RULES_COLLECTION)
        .where('modelId', '==', event.modelId)
        .where('enabled', '==', true)
        .get();

      const contacts: Set<string> = new Set();
      rulesSnapshot.docs.forEach(doc => {
        const rule = doc.data();
        rule.notifyContacts?.forEach((contact: string) => contacts.add(contact));
      });

      // Send notifications (would integrate with notification system)
      for (const contact of Array.from(contacts)) {
        await this.db.collection('notifications').add({
          type: 'AI_KILL_SWITCH',
          severity: 'CRITICAL',
          recipient: contact,
          subject: `AI Kill Switch Triggered: ${event.modelId}`,
          message: `Model ${event.modelId} ${event.action} triggered by ${event.trigger}`,
          details: event,
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error('[AIKillSwitch] Send notifications failed:', error);
      // Don't throw - notification failure shouldn't block kill switch
    }
  }

  /**
   * Update metrics (integration with PACK 299)
   */
  private async updateMetrics(event: KillSwitchEvent): Promise<void> {
    try {
      await this.db.collection('monitoring_events').add({
        type: 'AI_KILLSWITCH_EVENT',
        severity: 'CRITICAL',
        source: 'PACK_446',
        event,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('[AIKillSwitch] Update metrics failed:', error);
      // Don't throw
    }
  }
}
