/**
 * PACK 317 — Launch Gate Configuration & Enforcement
 * 
 * Controls launch status and critical production gates:
 * - Launch status (PRELAUNCH | LIMITED_BETA | OPEN)
 * - Registration blocking (for maintenance or high-risk periods)
 * - Paid feature blocking (emergency freeze)
 * 
 * CRITICAL: NO tokenomics changes, only temporary safety gates
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logTechEvent, logBusinessEvent } from './pack90-logging';

// ============================================================================
// TYPES
// ============================================================================

export type LaunchStatus = 'PRELAUNCH' | 'LIMITED_BETA' | 'OPEN';

export interface LaunchConfig {
  status: LaunchStatus;
  minPacksRequired: number;
  blockNewRegistrations: boolean;
  blockPaidFeatures: boolean;
  blockNewChats: boolean;
  blockNewCalls: boolean;
  blockNewMeetings: boolean;
  blockNewEvents: boolean;
  blockTokenPurchases: boolean;
  maintenanceMessage?: string;
  updatedAt: Timestamp;
  updatedBy?: string;
}

export interface LaunchCheckResult {
  allowed: boolean;
  reason?: string;
  maintenanceMessage?: string;
}

// ============================================================================
// GET LAUNCH CONFIG
// ============================================================================

let cachedLaunchConfig: LaunchConfig | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Get current launch configuration (with caching)
 */
export async function getLaunchConfig(): Promise<LaunchConfig> {
  const now = Date.now();

  // Return cached value if still valid
  if (cachedLaunchConfig && now < cacheExpiry) {
    return cachedLaunchConfig;
  }

  try {
    const doc = await db.collection('config').doc('launch').get();

    if (!doc.exists) {
      // Return default config if not set
      const defaultConfig: LaunchConfig = {
        status: 'PRELAUNCH',
        minPacksRequired: 317,
        blockNewRegistrations: false,
        blockPaidFeatures: false,
        blockNewChats: false,
        blockNewCalls: false,
        blockNewMeetings: false,
        blockNewEvents: false,
        blockTokenPurchases: false,
        updatedAt: Timestamp.now(),
      };

      cachedLaunchConfig = defaultConfig;
      cacheExpiry = now + CACHE_TTL_MS;
      return defaultConfig;
    }

    const config = doc.data() as LaunchConfig;
    cachedLaunchConfig = config;
    cacheExpiry = now + CACHE_TTL_MS;

    return config;
  } catch (error) {
    console.error('[Pack317] Failed to get launch config:', error);

    // Fail open - allow operations if config fetch fails
    return {
      status: 'OPEN',
      minPacksRequired: 317,
      blockNewRegistrations: false,
      blockPaidFeatures: false,
      blockNewChats: false,
      blockNewCalls: false,
      blockNewMeetings: false,
      blockNewEvents: false,
      blockTokenPurchases: false,
      updatedAt: Timestamp.now(),
    };
  }
}

/**
 * Invalidate launch config cache
 */
export function invalidateLaunchConfigCache(): void {
  cachedLaunchConfig = null;
  cacheExpiry = 0;
}

// ============================================================================
// LAUNCH GATE CHECKS
// ============================================================================

/**
 * Check if new registrations are allowed
 */
export async function checkRegistrationAllowed(): Promise<LaunchCheckResult> {
  const config = await getLaunchConfig();

  if (config.blockNewRegistrations) {
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'checkRegistrationAllowed',
      message: 'Registration blocked by launch gate',
      context: { status: config.status },
    });

    return {
      allowed: false,
      reason: 'REGISTRATION_TEMPORARILY_DISABLED',
      maintenanceMessage: config.maintenanceMessage || 'Registration is temporarily disabled. Please try again later.',
    };
  }

  return { allowed: true };
}

/**
 * Check if paid features are allowed
 */
export async function checkPaidFeaturesAllowed(
  featureType: 'CHAT' | 'CALL' | 'MEETING' | 'EVENT' | 'TOKEN_PURCHASE'
): Promise<LaunchCheckResult> {
  const config = await getLaunchConfig();

  // Check global paid features block
  if (config.blockPaidFeatures) {
    return {
      allowed: false,
      reason: 'PAID_FEATURES_TEMPORARILY_DISABLED',
      maintenanceMessage: config.maintenanceMessage || 'Paid features are temporarily disabled for maintenance.',
    };
  }

  // Check specific feature blocks
  const featureBlocks: Record<string, boolean> = {
    CHAT: config.blockNewChats,
    CALL: config.blockNewCalls,
    MEETING: config.blockNewMeetings,
    EVENT: config.blockNewEvents,
    TOKEN_PURCHASE: config.blockTokenPurchases,
  };

  if (featureBlocks[featureType]) {
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'checkPaidFeaturesAllowed',
      message: `${featureType} blocked by launch gate`,
      context: { featureType },
    });

    return {
      allowed: false,
      reason: `${featureType}_TEMPORARILY_DISABLED`,
      maintenanceMessage: config.maintenanceMessage || `This feature is temporarily disabled.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if system is in maintenance mode (all blocks active)
 */
export function isMaintenanceMode(config: LaunchConfig): boolean {
  return config.blockNewRegistrations && config.blockPaidFeatures;
}

// ============================================================================
// ADMIN: UPDATE LAUNCH CONFIG
// ============================================================================

export interface UpdateLaunchConfigParams {
  status?: LaunchStatus;
  blockNewRegistrations?: boolean;
  blockPaidFeatures?: boolean;
  blockNewChats?: boolean;
  blockNewCalls?: boolean;
  blockNewMeetings?: boolean;
  blockNewEvents?: boolean;
  blockTokenPurchases?: boolean;
  maintenanceMessage?: string;
  updatedBy: string;
}

/**
 * Update launch configuration (admin only)
 */
export async function updateLaunchConfig(
  params: UpdateLaunchConfigParams
): Promise<LaunchConfig> {
  try {
    const currentConfig = await getLaunchConfig();

    const updates: Partial<LaunchConfig> = {
      updatedAt: Timestamp.now(),
      updatedBy: params.updatedBy,
    };

    if (params.status !== undefined) updates.status = params.status;
    if (params.blockNewRegistrations !== undefined) updates.blockNewRegistrations = params.blockNewRegistrations;
    if (params.blockPaidFeatures !== undefined) updates.blockPaidFeatures = params.blockPaidFeatures;
    if (params.blockNewChats !== undefined) updates.blockNewChats = params.blockNewChats;
    if (params.blockNewCalls !== undefined) updates.blockNewCalls = params.blockNewCalls;
    if (params.blockNewMeetings !== undefined) updates.blockNewMeetings = params.blockNewMeetings;
    if (params.blockNewEvents !== undefined) updates.blockNewEvents = params.blockNewEvents;
    if (params.blockTokenPurchases !== undefined) updates.blockTokenPurchases = params.blockTokenPurchases;
    if (params.maintenanceMessage !== undefined) updates.maintenanceMessage = params.maintenanceMessage;

    await db.collection('config').doc('launch').set(updates, { merge: true });

    // Invalidate cache
    invalidateLaunchConfigCache();

    // Get updated config
    const newConfig = await getLaunchConfig();

    // Log change
    await logBusinessEvent({
      eventType: 'ENFORCEMENT_CHANGED',
      actorUserId: params.updatedBy,
      metadata: {
        entity: 'LAUNCH_CONFIG',
        before: currentConfig,
        after: newConfig,
      },
      source: 'ADMIN_PANEL',
      functionName: 'updateLaunchConfig',
    });

    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'updateLaunchConfig',
      message: 'Launch configuration updated',
      context: {
        updatedBy: params.updatedBy,
        changes: updates,
      },
    });

    return newConfig;
  } catch (error) {
    console.error('[Pack317] Failed to update launch config:', error);
    throw error;
  }
}

// ============================================================================
// LAUNCH CONFIG HISTORY
// ============================================================================

/**
 * Get launch configuration change history
 */
export async function getLaunchConfigHistory(
  limit: number = 50
): Promise<Array<{
  timestamp: number;
  status: LaunchStatus;
  updatedBy: string;
  changes: Record<string, any>;
}>> {
  try {
    const snapshot = await db
      .collection('business_audit_log')
      .where('metadata.entity', '==', 'LAUNCH_CONFIG')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        timestamp: data.createdAt.toMillis(),
        status: data.metadata.after?.status || 'UNKNOWN',
        updatedBy: data.actorUserId || 'UNKNOWN',
        changes: data.metadata.after || {},
      };
    });
  } catch (error) {
    console.error('[Pack317] Failed to get config history:', error);
    return [];
  }
}