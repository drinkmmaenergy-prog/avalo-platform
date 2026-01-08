/**
 * PACK 367: AUTOMATED DEFENSE ACTIONS
 * Manages automatic responses to store threats
 */

import { firestore } from 'firebase-admin';
import { logger } from 'firebase-functions';
import {
  StoreDefenseAction,
  StoreCrisisEvent,
  DefenseActionType,
  Platform,
} from './types';

const db = firestore();

/**
 * Defense Action Manager
 * Handles automatic defense action triggers and management
 */
export class DefenseActionManager {
  
  /**
   * Trigger defense actions for a crisis event
   */
  async triggerCrisisDefense(crisisId: string): Promise<string[]> {
    const crisisDoc = await db.collection('storeCrisisEvents').doc(crisisId).get();
    
    if (!crisisDoc.exists) {
      logger.error(`Crisis event not found: ${crisisId}`);
      return [];
    }
    
    const crisis = crisisDoc.data() as StoreCrisisEvent;
    const actionIds: string[] = [];
    
    // Determine which actions to trigger based on crisis type
    let actionsToTrigger: DefenseActionType[] = [];
    
    switch (crisis.crisisType) {
      case 'coordinated_attack':
        actionsToTrigger = [
          'pause_notifications',
          'suppress_prompts',
          'disable_invites',
          'lock_referrals',
          'show_crisis_banner',
          'prioritize_support',
        ];
        break;
        
      case 'rating_drop':
        actionsToTrigger = [
          'pause_notifications',
          'suppress_prompts',
          'prioritize_support',
          'show_crisis_banner',
        ];
        break;
        
      case 'uninstall_spike':
        actionsToTrigger = [
          'delay_updates',
          'suppress_prompts',
          'show_crisis_banner',
          'prioritize_support',
        ];
        break;
        
      case 'fraud_cluster':
        actionsToTrigger = [
          'suppress_prompts',
          'disable_invites',
          'lock_referrals',
          'shield_swipe',
        ];
        break;
        
      case 'mass_negative_reviews':
        actionsToTrigger = [
          'pause_notifications',
          'suppress_prompts',
          'show_crisis_banner',
          'prioritize_support',
        ];
        break;
    }
    
    // Trigger each action
    for (const actionType of actionsToTrigger) {
      try {
        const actionId = await this.triggerDefenseAction({
          actionType,
          platform: crisis.platform,
          triggeredBy: 'system',
          triggerReason: `Auto-triggered by crisis: ${crisis.crisisType}`,
          relatedCrisisId: crisisId,
          autoTriggered: true,
        });
        
        actionIds.push(actionId);
        logger.info(`Defense action triggered: ${actionType} for crisis ${crisisId}`);
      } catch (error) {
        logger.error(`Error triggering defense action ${actionType}:`, error);
      }
    }
    
    // Update crisis with triggered actions
    await db.collection('storeCrisisEvents').doc(crisisId).update({
      triggeredActions: firestore.FieldValue.arrayUnion(...actionsToTrigger),
      activeActionIds: firestore.FieldValue.arrayUnion(...actionIds),
    });
    
    // Notify admins
    await this.notifyAdmins(crisis, actionIds);
    
    return actionIds;
  }
  
  /**
   * Trigger a specific defense action
   */
  async triggerDefenseAction(params: {
    actionType: DefenseActionType;
    platform?: Platform;
    triggeredBy: string;
    triggerReason: string;
    relatedCrisisId?: string;
    autoTriggered: boolean;
    durationHours?: number;
  }): Promise<string> {
    
    // Check if action already active
    const existingAction = await this.getActiveAction(params.actionType, params.platform);
    if (existingAction) {
      logger.info(`Defense action ${params.actionType} already active`);
      return existingAction.id;
    }
    
    // Get config for default duration
    const config = await this.getDefenseConfig();
    const durationHours = params.durationHours || 
      config.defenseActionDurations?.[params.actionType] || 
      24; // default 24 hours
    
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
    
    const actionRef = db.collection('storeDefenseActions').doc();
    const action: Omit<StoreDefenseAction, 'id'> = {
      actionType: params.actionType,
      platform: params.platform,
      active: true,
      autoTriggered: params.autoTriggered,
      triggeredBy: params.triggeredBy,
      triggerReason: params.triggerReason,
      relatedCrisisId: params.relatedCrisisId,
      triggeredAt: firestore.Timestamp.now(),
      expiresAt: firestore.Timestamp.fromDate(expiresAt),
    };
    
    await actionRef.set(action);
    
    // Log to audit (PACK 296)
    await this.logToAudit({
      action: 'defense_action_triggered',
      actionId: actionRef.id,
      actionType: params.actionType,
      triggeredBy: params.triggeredBy,
      reason: params.triggerReason,
    });
    
    // Execute the action
    await this.executeDefenseAction(params.actionType, params.platform);
    
    return actionRef.id;
  }
  
  /**
   * Execute the actual defense action
   */
  private async executeDefenseAction(
    actionType: DefenseActionType,
    platform?: Platform
  ): Promise<void> {
    
    switch (actionType) {
      case 'pause_notifications':
        await this.pauseNotifications(platform);
        break;
        
      case 'delay_updates':
        await this.delayUpdates(platform);
        break;
        
      case 'suppress_prompts':
        await this.suppressPrompts(platform);
        break;
        
      case 'prioritize_support':
        await this.prioritizeSupportTickets();
        break;
        
      case 'show_crisis_banner':
        await this.enableCrisisBanner(platform);
        break;
        
      case 'disable_invites':
        await this.disableInviteCampaigns(platform);
        break;
        
      case 'lock_referrals':
        await this.lockReferralPromotions(platform);
        break;
        
      case 'shield_swipe':
        await this.shieldSwipeFunnel(platform);
        break;
    }
  }
  
  /**
   * Pause push notifications globally or per platform
   */
  private async pauseNotifications(platform?: Platform): Promise<void> {
    // Integration with PACK 293 (Notifications)
    await db.collection('notificationConfig').doc('defense').set({
      paused: true,
      platform,
      pausedAt: firestore.Timestamp.now(),
      reason: 'store_defense',
    }, { merge: true });
    
    logger.info('Notifications paused', { platform });
  }
  
  /**
   * Delay forced update prompts
   */
  private async delayUpdates(platform?: Platform): Promise<void> {
    await db.collection('appConfig').doc('updates').set({
      delayUpdates: true,
      platform,
      delayedAt: firestore.Timestamp.now(),
      reason: 'store_defense',
    }, { merge: true });
    
    logger.info('Updates delayed', { platform });
  }
  
  /**
   * Suppress risky prompts (review prompts, upsells, etc.)
   */
  private async suppressPrompts(platform?: Platform): Promise<void> {
    await db.collection('appConfig').doc('prompts').set({
      suppressPrompts: true,
      platform,
      suppressedAt: firestore.Timestamp.now(),
      reason: 'store_defense',
    }, { merge: true });
    
    logger.info('Prompts suppressed', { platform });
  }
  
  /**
   * Auto-prioritize support tickets (PACK 300/300A)
   */
  private async prioritizeSupportTickets(): Promise<void> {
    // Mark all open tickets as high priority
    const openTickets = await db.collection('supportTickets')
      .where('status', 'in', ['open', 'pending'])
      .get();
    
    const batch = db.batch();
    openTickets.docs.forEach(doc => {
      batch.update(doc.ref, {
        priority: 'high',
        autoEscalated: true,
        escalatedReason: 'store_defense_crisis',
        escalatedAt: firestore.Timestamp.now(),
      });
    });
    
    await batch.commit();
    logger.info(`Prioritized ${openTickets.size} support tickets`);
  }
  
  /**
   * Enable crisis banner in app
   */
  private async enableCrisisBanner(platform?: Platform): Promise<void> {
    await db.collection('appConfig').doc('crisisBanner').set({
      enabled: true,
      platform,
      message: 'We are aware of recent issues and are working to improve your experience.',
      showSupportLink: true,
      enabledAt: firestore.Timestamp.now(),
    }, { merge: true });
    
    logger.info('Crisis banner enabled', { platform });
  }
  
  /**
   * Disable public invite campaigns (PACK 215 Viral Loop)
   */
  private async disableInviteCampaigns(platform?: Platform): Promise<void> {
    await db.collection('viralLoopConfig').doc('invites').set({
      disabled: true,
      platform,
      disabledAt: firestore.Timestamp.now(),
      reason: 'store_defense',
    }, { merge: true });
    
    logger.info('Invite campaigns disabled', { platform });
  }
  
  /**
   * Lock referral promotions
   */
  private async lockReferralPromotions(platform?: Platform): Promise<void> {
    await db.collection('referralConfig').doc('defense').set({
      locked: true,
      platform,
      lockedAt: firestore.Timestamp.now(),
      reason: 'store_defense',
    }, { merge: true });
    
    logger.info('Referral promotions locked', { platform });
  }
  
  /**
   * Shield swipe funnel pressure (reduce aggressive matching)
   */
  private async shieldSwipeFunnel(platform?: Platform): Promise<void> {
    await db.collection('matchingConfig').doc('defense').set({
      shielded: true,
      reduceAggressiveMatching: true,
      platform,
      shieldedAt: firestore.Timestamp.now(),
      reason: 'store_defense',
    }, { merge: true });
    
    logger.info('Swipe funnel shielded', { platform });
  }
  
  /**
   * Deactivate a defense action
   */
  async deactivateDefenseAction(actionId: string, deactivatedBy: string): Promise<void> {
    await db.collection('storeDefenseActions').doc(actionId).update({
      active: false,
      deactivatedAt: firestore.Timestamp.now(),
      overriddenBy: deactivatedBy,
    });
    
    // Log to audit
    await this.logToAudit({
      action: 'defense_action_deactivated',
      actionId,
      deactivatedBy,
    });
    
    logger.info(`Defense action deactivated: ${actionId}`);
  }
  
  /**
   * Get active defense action
   */
  private async getActiveAction(
    actionType: DefenseActionType,
    platform?: Platform
  ): Promise<StoreDefenseAction | null> {
    let query = db.collection('storeDefenseActions')
      .where('actionType', '==', actionType)
      .where('active', '==', true);
    
    if (platform) {
      query = query.where('platform', '==', platform);
    }
    
    const snapshot = await query.limit(1).get();
    
    if (snapshot.empty) return null;
    
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as StoreDefenseAction;
  }
  
  /**
   * Get defense configuration
   */
  private async getDefenseConfig(): Promise<any> {
    const configDoc = await db.collection('storeDefenseConfig').doc('default').get();
    
    if (!configDoc.exists) {
      return {
        autoDefenseEnabled: true,
        defenseActionDurations: {},
      };
    }
    
    return configDoc.data();
  }
  
  /**
   * Notify admins of crisis and actions
   */
  private async notifyAdmins(crisis: StoreCrisisEvent, actionIds: string[]): Promise<void> {
    // Get admin users
    const admins = await db.collection('users')
      .where('role', '==', 'admin')
      .get();
    
    const adminIds = admins.docs.map(doc => doc.id);
    
    // Create notifications (PACK 293)
    const batch = db.batch();
    
    for (const adminId of adminIds) {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: adminId,
        type: 'store_crisis',
        title: 'Store Defense Crisis Detected',
        message: `Crisis: ${crisis.crisisType}. ${actionIds.length} defense actions triggered.`,
        priority: 'urgent',
        data: {
          crisisId: crisis.id,
          actionIds,
          severity: crisis.severity,
        },
        read: false,
        createdAt: firestore.Timestamp.now(),
      });
    }
    
    await batch.commit();
    
    // Update crisis with notified admins
    await db.collection('storeCrisisEvents').doc(crisis.id).update({
      adminsNotified: adminIds,
    });
    
    logger.info(`Notified ${adminIds.length} admins of crisis ${crisis.id}`);
  }
  
  /**
   * Log to audit system (PACK 296)
   */
  private async logToAudit(data: any): Promise<void> {
    await db.collection('auditLogs').add({
      ...data,
      system: 'store-defense',
      pack: 'PACK367',
      timestamp: firestore.Timestamp.now(),
    });
  }
  
  /**
   * Check and expire old defense actions
   */
  async expireOldActions(): Promise<void> {
    const now = firestore.Timestamp.now();
    
    const expiredActions = await db.collection('storeDefenseActions')
      .where('active', '==', true)
      .where('expiresAt', '<=', now)
      .get();
    
    if (expiredActions.empty) return;
    
    const batch = db.batch();
    
    expiredActions.docs.forEach(doc => {
      batch.update(doc.ref, {
        active: false,
        deactivatedAt: now,
        overriddenBy: 'system_expiry',
      });
    });
    
    await batch.commit();
    
    logger.info(`Expired ${expiredActions.size} defense actions`);
  }
}
