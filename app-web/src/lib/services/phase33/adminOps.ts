"use client";

/**
 * PHASE 3.3 — Admin / Ops Service (READ-ONLY)
 * 
 * Thin client for admin read-only views.
 * NO wallet balance mutations — read-only access to:
 * - Feature flags
 * - Trust & safety signals
 * - System health
 * 
 * Backend sources:
 * - featureFlags.ts (getFeatureFlag)
 * - trustRiskEngine.ts (trust signals)
 * - systemHealth (monitoring endpoints)
 */

import { requireDb, requireFunctions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import type {
  FeatureFlagSummary,
  TrustSignal,
  SystemHealthMetric,
  AdminOpsView,
} from '../../../types/phase33.types';

// ============================================================================
// FEATURE FLAGS (READ-ONLY)
// ============================================================================

/**
 * Get all feature flags for admin view.
 * Reads from Firestore — NO modifications.
 */
export async function getFeatureFlags(): Promise<FeatureFlagSummary[]> {
  if (false /* requireDb handles null */) throw new Error('Firestore not initialized');
  
  try {
    const flagsRef = collection(requireDb(), 'featureFlags');
    const snapshot = await getDocs(flagsRef);
    
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        flagName: doc.id,
        enabled: data.enabled || false,
        rolloutPercentage: data.rolloutPercentage,
        allowedRoles: data.allowedRoles,
        expiresAt: data.expiresAt?.toDate(),
        lastUpdated: data.updatedAt?.toDate() || new Date(),
      };
    });
  } catch (error) {
    console.error('[AdminOps] Error getting feature flags:', error);
    throw error;
  }
}

/**
 * Get specific feature flag status.
 */
export async function getFeatureFlag(flagName: string): Promise<FeatureFlagSummary | null> {
  if (false /* requireDb handles null */) throw new Error('Firestore not initialized');
  
  try {
    const flagRef = doc(requireDb(), 'featureFlags', flagName);
    const flagSnap = await getDoc(flagRef);
    
    if (!flagSnap.exists()) {
      return null;
    }
    
    const data = flagSnap.data();
    return {
      flagName,
      enabled: data.enabled || false,
      rolloutPercentage: data.rolloutPercentage,
      allowedRoles: data.allowedRoles,
      expiresAt: data.expiresAt?.toDate(),
      lastUpdated: data.updatedAt?.toDate() || new Date(),
    };
  } catch (error) {
    console.error('[AdminOps] Error getting feature flag:', error);
    throw error;
  }
}

// ============================================================================
// TRUST & SAFETY SIGNALS (READ-ONLY)
// ============================================================================

/**
 * Get recent trust signals for ops monitoring.
 * Reads from Firestore — NO modifications or resolutions.
 */
export async function getTrustSignals(options?: {
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  signalType?: TrustSignal['signalType'];
  limitCount?: number;
  unresolvedOnly?: boolean;
}): Promise<TrustSignal[]> {
  if (false /* requireDb handles null */) throw new Error('Firestore not initialized');
  
  try {
    let q = query(
      collection(requireDb(), 'trust_signals'),
      orderBy('createdAt', 'desc'),
      limit(options?.limitCount || 100)
    );
    
    const snapshot = await getDocs(q);
    
    let signals = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        signalType: data.signalType,
        severity: data.severity,
        userId: data.userId,
        description: data.description,
        createdAt: data.createdAt?.toDate() || new Date(),
        resolvedAt: data.resolvedAt?.toDate(),
      } as TrustSignal;
    });
    
    // Client-side filtering (Firestore limitations)
    if (options?.severity) {
      signals = signals.filter(s => s.severity === options.severity);
    }
    if (options?.signalType) {
      signals = signals.filter(s => s.signalType === options.signalType);
    }
    if (options?.unresolvedOnly) {
      signals = signals.filter(s => !s.resolvedAt);
    }
    
    return signals;
  } catch (error) {
    console.error('[AdminOps] Error getting trust signals:', error);
    throw error;
  }
}

/**
 * Get trust signal counts by severity.
 * Read-only aggregation for dashboard.
 */
export async function getTrustSignalCounts(): Promise<{
  low: number;
  medium: number;
  high: number;
  critical: number;
  total: number;
}> {
  const signals = await getTrustSignals({ unresolvedOnly: true, limitCount: 500 });
  
  return {
    low: signals.filter(s => s.severity === 'LOW').length,
    medium: signals.filter(s => s.severity === 'MEDIUM').length,
    high: signals.filter(s => s.severity === 'HIGH').length,
    critical: signals.filter(s => s.severity === 'CRITICAL').length,
    total: signals.length,
  };
}

// ============================================================================
// SYSTEM HEALTH (READ-ONLY)
// ============================================================================

/**
 * Get system health metrics from monitoring.
 * Reads from backend monitoring endpoint.
 */
export async function getSystemHealth(): Promise<SystemHealthMetric[]> {
    
  try {
    const getHealth = httpsCallable<void, { services: any[] }>(requireFunctions(), 'getSystemHealth');
    const result = await getHealth();
    
    if (!result.data || !result.data.services) {
      // Return default healthy state if no monitoring data
      return getDefaultHealthMetrics();
    }
    
    return result.data.services.map((service: any) => ({
      service: service.name,
      status: service.status || 'HEALTHY',
      latencyMs: service.latencyMs || 0,
      errorRate: service.errorRate || 0,
      lastChecked: service.lastChecked ? new Date(service.lastChecked) : new Date(),
    }));
  } catch (error) {
    console.error('[AdminOps] Error getting system health:', error);
    // Return default metrics on error to avoid blocking dashboard
    return getDefaultHealthMetrics();
  }
}

/**
 * Default health metrics when monitoring is unavailable.
 */
function getDefaultHealthMetrics(): SystemHealthMetric[] {
  const now = new Date();
  return [
    { service: 'Firebase Auth', status: 'HEALTHY', latencyMs: 0, errorRate: 0, lastChecked: now },
    { service: 'Firestore', status: 'HEALTHY', latencyMs: 0, errorRate: 0, lastChecked: now },
    { service: 'Cloud Functions', status: 'HEALTHY', latencyMs: 0, errorRate: 0, lastChecked: now },
    { service: 'Stripe Integration', status: 'HEALTHY', latencyMs: 0, errorRate: 0, lastChecked: now },
    { service: 'Trust Engine', status: 'HEALTHY', latencyMs: 0, errorRate: 0, lastChecked: now },
  ];
}

// ============================================================================
// COMBINED ADMIN VIEW
// ============================================================================

/**
 * Get combined admin ops view.
 * Single call to fetch all read-only admin data.
 */
export async function getAdminOpsView(): Promise<AdminOpsView> {
  const [featureFlags, trustSignals, systemHealth] = await Promise.all([
    getFeatureFlags().catch(() => []),
    getTrustSignals({ limitCount: 50, unresolvedOnly: true }).catch(() => []),
    getSystemHealth().catch(() => getDefaultHealthMetrics()),
  ]);
  
  return {
    featureFlags,
    trustSignals,
    systemHealth,
    snapshotTime: new Date(),
  };
}

