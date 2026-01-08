/**
 * PACK 106 — Multi-Currency Admin Endpoints
 * 
 * Admin-only functions for currency management:
 * - List currency profiles
 * - Update currency profile settings
 * - Set base token price (requires 2-key approval)
 * - View currency dashboard stats
 * - Manual FX refresh trigger
 * 
 * Security: All functions require admin role
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  CurrencyProfile,
  UpdateCurrencyProfileRequest,
  SetBaseTokenPriceRequest,
  CurrencyDashboardStats,
  BaseTokenPriceConfig,
} from './pack106-types';
import { logBusinessAudit } from './pack105-audit-logger';

// ============================================================================
// ADMIN ROLE VERIFICATION
// ============================================================================

/**
 * Verify user has admin role
 */
async function verifyAdminRole(uid: string): Promise<void> {
  const userDoc = await db.collection('users').doc(uid).get();
  
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data();
  if (!userData?.roles?.admin) {
    throw new HttpsError(
      'permission-denied',
      'Admin role required for this operation'
    );
  }
}

// ============================================================================
// LIST CURRENCY PROFILES
// ============================================================================

/**
 * Get all currency profiles
 * Admin only - for currency management dashboard
 */
export const admin_listCurrencyProfiles = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CurrencyProfile[]> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminRole(request.auth.uid);

    try {
      const snapshot = await db.collection('currency_profiles').get();
      
      const profiles = snapshot.docs.map(doc => ({
        ...doc.data(),
      } as CurrencyProfile));

      // Sort by currency code
      profiles.sort((a, b) => a.code.localeCompare(b.code));

      logger.info(`[PACK106] Admin ${request.auth.uid} listed ${profiles.length} currency profiles`);

      return profiles;
    } catch (error: any) {
      logger.error('[PACK106] Error listing currency profiles', error);
      throw new HttpsError('internal', `Failed to list currencies: ${error.message}`);
    }
  }
);

// ============================================================================
// UPDATE CURRENCY PROFILE
// ============================================================================

/**
 * Update currency profile settings
 * Admin can update tax rules, PSP support, enable/disable
 * Cannot update FX rate (only via scheduled refresh)
 */
export const admin_updateCurrencyProfile = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminRole(request.auth.uid);

    try {
      const updates = request.data as UpdateCurrencyProfileRequest;

      if (!updates.code) {
        throw new HttpsError('invalid-argument', 'Currency code is required');
      }

      const profileRef = db.collection('currency_profiles').doc(updates.code);
      const profileDoc = await profileRef.get();

      if (!profileDoc.exists) {
        throw new HttpsError('not-found', `Currency ${updates.code} not found`);
      }

      // Build update object (exclude FX rate changes)
      const updateData: Partial<CurrencyProfile> = {
        updatedAt: Timestamp.now(),
      };

      if (updates.taxIncluded !== undefined) {
        updateData.taxIncluded = updates.taxIncluded;
      }

      if (updates.taxRate !== undefined) {
        updateData.taxRate = updates.taxRate;
      }

      if (updates.enabled !== undefined) {
        updateData.enabled = updates.enabled;
      }

      if (updates.supportedPSPs !== undefined) {
        updateData.supportedPSPs = updates.supportedPSPs;
      }

      if (updates.metadata !== undefined) {
        updateData.metadata = updates.metadata;
      }

      await profileRef.update(updateData);

      // Log to audit
      await logBusinessAudit({
        eventType: 'BALANCE_ADJUSTMENT', // Reusing closest type
        userId: request.auth.uid,
        context: {
          action: 'CURRENCY_PROFILE_UPDATED',
          currencyCode: updates.code,
          updates: updateData,
        },
        source: 'pack106-admin',
      });

      logger.info(`[PACK106] Admin ${request.auth.uid} updated currency ${updates.code}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[PACK106] Error updating currency profile', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to update currency: ${error.message}`);
    }
  }
);

// ============================================================================
// SET BASE TOKEN PRICE
// ============================================================================

/**
 * Set base token price (EUR)
 * Requires 2-key approval from different admins
 * This is a CRITICAL operation that affects global pricing
 */
export const admin_setBaseTokenPrice = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean; requiresSecondApproval?: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminRole(request.auth.uid);

    try {
      const params = request.data as SetBaseTokenPriceRequest;

      if (!params.basePriceEUR || params.basePriceEUR <= 0) {
        throw new HttpsError('invalid-argument', 'Invalid base price');
      }

      if (!params.reason) {
        throw new HttpsError('invalid-argument', 'Reason is required');
      }

      // Get config reference
      const configRef = db.collection('system_config').doc('base_token_price');
      const configDoc = await configRef.get();

      // Check for pending approval
      if (configDoc.exists) {
        const config = configDoc.data() as BaseTokenPriceConfig & { pendingApproval?: any };
        
        // If there's a pending approval from a different admin, complete the 2-key process
        if (config.pendingApproval && config.pendingApproval.admin1 !== request.auth.uid) {
          // Second approval - execute change
          const newConfig: BaseTokenPriceConfig = {
            basePriceEUR: config.pendingApproval.basePriceEUR,
            referenceCurrency: 'EUR',
            updatedAt: Timestamp.now(),
            updatedBy: request.auth.uid,
            approvals: {
              admin1: config.pendingApproval.admin1,
              admin2: request.auth.uid,
              timestamp: Timestamp.now(),
            },
          };

          await configRef.set(newConfig);

          // Log to audit
          await logBusinessAudit({
            eventType: 'BALANCE_ADJUSTMENT',
            userId: request.auth.uid,
            context: {
              action: 'BASE_TOKEN_PRICE_CHANGED',
              oldPrice: config.basePriceEUR,
              newPrice: newConfig.basePriceEUR,
              approver1: config.pendingApproval.admin1,
              approver2: request.auth.uid,
              reason: config.pendingApproval.reason,
            },
            source: 'pack106-admin',
          });

          logger.warn(`[PACK106] BASE TOKEN PRICE CHANGED: €${newConfig.basePriceEUR}`, {
            admin1: config.pendingApproval.admin1,
            admin2: request.auth.uid,
          });

          return { success: true, requiresSecondApproval: false };
        }
      }

      // First approval - store pending change
      await configRef.set({
        ...(configDoc.exists ? configDoc.data() : {}),
        pendingApproval: {
          basePriceEUR: params.basePriceEUR,
          admin1: request.auth.uid,
          reason: params.reason,
          requestedAt: Timestamp.now(),
        },
      }, { merge: true });

      logger.info(`[PACK106] Admin ${request.auth.uid} requested base price change to €${params.basePriceEUR}`, {
        reason: params.reason,
      });

      return { success: true, requiresSecondApproval: true };
    } catch (error: any) {
      logger.error('[PACK106] Error setting base token price', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to set base price: ${error.message}`);
    }
  }
);

// ============================================================================
// CURRENCY DASHBOARD STATS
// ============================================================================

/**
 * Get currency dashboard statistics
 * Shows health and usage of currency system
 */
export const admin_getCurrencyDashboardStats = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CurrencyDashboardStats> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminRole(request.auth.uid);

    try {
      // Count active currencies
      const profilesSnapshot = await db
        .collection('currency_profiles')
        .where('enabled', '==', true)
        .get();
      
      const activeCurrencies = profilesSnapshot.size;

      // Check for stale rates (not updated in last 12 hours)
      const twelveHoursAgo = Timestamp.fromMillis(Date.now() - 12 * 60 * 60 * 1000);
      const staleSnapshot = await db
        .collection('currency_profiles')
        .where('updatedAt', '<', twelveHoursAgo)
        .get();
      
      const staleRates = staleSnapshot.size;

      // Get last refresh timestamp
      const allProfiles = await db.collection('currency_profiles').get();
      let lastRefresh = Timestamp.now();
      allProfiles.forEach(doc => {
        const profile = doc.data() as CurrencyProfile;
        if (profile.updatedAt && profile.updatedAt.toMillis() < lastRefresh.toMillis()) {
          lastRefresh = profile.updatedAt;
        }
      });

      // Get top currencies by transaction count (stub - would need actual transaction data)
      const topCurrencies = [
        { code: 'EUR', transactions: 0, volume: 0 },
        { code: 'USD', transactions: 0, volume: 0 },
        { code: 'GBP', transactions: 0, volume: 0 },
      ];

      // Check for FX variance warnings (stub)
      const fxVarianceWarnings: Array<{
        currency: string;
        expectedRate: number;
        actualRate: number;
        variance: number;
      }> = [];

      const stats: CurrencyDashboardStats = {
        activeCurrencies,
        staleRates,
        lastRefresh,
        topCurrencies,
        fxVarianceWarnings,
      };

      logger.info(`[PACK106] Admin ${request.auth.uid} fetched currency dashboard stats`);

      return stats;
    } catch (error: any) {
      logger.error('[PACK106] Error getting dashboard stats', error);
      throw new HttpsError('internal', `Failed to get stats: ${error.message}`);
    }
  }
);

// ============================================================================
// MANUAL FX REFRESH
// ============================================================================

/**
 * Manually trigger FX rate refresh
 * Useful if rates need immediate update
 */
export const admin_triggerFXRefresh = onCall(
  { region: 'europe-west3', timeoutSeconds: 60 },
  async (request): Promise<{ success: boolean; updatedCount: number }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminRole(request.auth.uid);

    try {
      // Note: This would ideally call the scheduled job function directly
      // For now, we log the request and the scheduled job will run on its schedule
      
      logger.info(`[PACK106] Admin ${request.auth.uid} requested manual FX refresh`);

      await logBusinessAudit({
        eventType: 'CURRENCY_CONVERSION_FOR_PURCHASE',
        userId: request.auth.uid,
        context: {
          action: 'MANUAL_FX_REFRESH_REQUESTED',
        },
        source: 'pack106-admin',
      });

      // Return stub response
      // In production, this would trigger the actual refresh job
      return { success: true, updatedCount: 0 };
    } catch (error: any) {
      logger.error('[PACK106] Error triggering FX refresh', error);
      throw new HttpsError('internal', `Failed to trigger refresh: ${error.message}`);
    }
  }
);

// ============================================================================
// GET BASE TOKEN PRICE CONFIG
// ============================================================================

/**
 * Get current base token price configuration
 */
export const admin_getBaseTokenPriceConfig = onCall(
  { region: 'europe-west3' },
  async (request): Promise<BaseTokenPriceConfig & { pendingApproval?: any }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await verifyAdminRole(request.auth.uid);

    try {
      const configDoc = await db.collection('system_config').doc('base_token_price').get();

      if (!configDoc.exists) {
        // Return default if not set
        return {
          basePriceEUR: 0.25, // Default from pack106-types
          referenceCurrency: 'EUR',
          updatedAt: Timestamp.now(),
        };
      }

      return configDoc.data() as BaseTokenPriceConfig & { pendingApproval?: any };
    } catch (error: any) {
      logger.error('[PACK106] Error getting base price config', error);
      throw new HttpsError('internal', `Failed to get config: ${error.message}`);
    }
  }
);