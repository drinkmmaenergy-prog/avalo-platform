/**
 * PACK 450 — Technical Debt Registry Service
 * 
 * Central register of technical debt with:
 * - Module identification
 * - Debt type (code / infrastructure / data / process)
 * - Impact (revenue, risk, velocity)
 * - Maintenance cost
 * - Owner and repayment SLA
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firestore
const db = admin.firestore();

// Types
export enum DebtType {
  CODE = 'CODE',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  DATA = 'DATA',
  PROCESS = 'PROCESS'
}

export enum DebtSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export enum DebtStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  ACCEPTED = 'ACCEPTED'
}

export interface TechnicalDebtImpact {
  revenueRisk: number; // USD per month
  velocityImpact: number; // % slowdown
  securityRisk: number; // 0-100 score
  scalabilityRisk: number; // 0-100 score
}

export interface TechnicalDebtEntry {
  id: string;
  module: string;
  component: string;
  debtType: DebtType;
  severity: DebtSeverity;
  status: DebtStatus;
  title: string;
  description: string;
  impact: TechnicalDebtImpact;
  maintenanceCostMonthly: number; // USD
  estimatedResolutionCost: number; // USD
  estimatedResolutionTime: number; // hours
  owner: string; // user ID
  repaymentSLA: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  tags: string[];
  relatedModules: string[];
  dependencies: string[];
  technicalDetails: {
    location: string; // file path or resource identifier
    affectedLines?: number;
    duplicatedCode?: boolean;
    circularDependency?: boolean;
    outdatedDependency?: string;
    missingTests?: boolean;
    missingDocs?: boolean;
    performanceIssue?: boolean;
    securityIssue?: boolean;
  };
}

/**
 * Register new technical debt entry
 */
export const pack450TechnicalDebtRegister = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to register technical debt'
      );
    }

    const userId = context.auth.uid;

    // Validate input
    const {
      module,
      component,
      debtType,
      severity,
      title,
      description,
      impact,
      maintenanceCostMonthly,
      estimatedResolutionCost,
      estimatedResolutionTime,
      repaymentSLA,
      tags,
      relatedModules,
      dependencies,
      technicalDetails
    } = data;

    if (!module || !debtType || !severity || !title) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    // Create debt entry
    const debtEntry: Partial<TechnicalDebtEntry> = {
      module,
      component: component || 'unknown',
      debtType,
      severity,
      status: DebtStatus.OPEN,
      title,
      description: description || '',
      impact: impact || {
        revenueRisk: 0,
        velocityImpact: 0,
        securityRisk: 0,
        scalabilityRisk: 0
      },
      maintenanceCostMonthly: maintenanceCostMonthly || 0,
      estimatedResolutionCost: estimatedResolutionCost || 0,
      estimatedResolutionTime: estimatedResolutionTime || 0,
      owner: userId,
      repaymentSLA: repaymentSLA ? new Date(repaymentSLA) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      tags: tags || [],
      relatedModules: relatedModules || [],
      dependencies: dependencies || [],
      technicalDetails: technicalDetails || {}
    };

    // Save to Firestore
    const debtRef = await db.collection('technical_debt').add(debtEntry);

    // Log to audit trail
    await db.collection('technical_debt_audit').add({
      debtId: debtRef.id,
      action: 'CREATED',
      userId,
      timestamp: new Date(),
      changes: debtEntry
    });

    // Calculate total debt metrics
    await updateDebtMetrics(module);

    return {
      success: true,
      debtId: debtRef.id,
      message: 'Technical debt registered successfully'
    };
  });

/**
 * Query technical debt entries
 */
export const pack450TechnicalDebtQuery = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to query technical debt'
      );
    }

    const {
      module,
      debtType,
      severity,
      status,
      owner,
      limit = 50,
      offset = 0
    } = data;

    let query: FirebaseFirestore.Query = db.collection('technical_debt');

    // Apply filters
    if (module) {
      query = query.where('module', '==', module);
    }
    if (debtType) {
      query = query.where('debtType', '==', debtType);
    }
    if (severity) {
      query = query.where('severity', '==', severity);
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    if (owner) {
      query = query.where('owner', '==', owner);
    }

    // Order and paginate
    query = query.orderBy('createdAt', 'desc').limit(limit).offset(offset);

    const snapshot = await query.get();

    const debts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Calculate summary statistics
    const summary = await calculateDebtSummary(debts);

    return {
      success: true,
      debts,
      summary,
      total: debts.length
    };
  });

/**
 * Update technical debt entry
 */
export const pack450TechnicalDebtUpdate = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to update technical debt'
      );
    }

    const userId = context.auth.uid;
    const { debtId, updates } = data;

    if (!debtId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Debt ID is required'
      );
    }

    // Get existing debt entry
    const debtRef = db.collection('technical_debt').doc(debtId);
    const debtDoc = await debtRef.get();

    if (!debtDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Technical debt entry not found'
      );
    }

    const existingDebt = debtDoc.data();

    // Update entry
    const updatedData = {
      ...updates,
      updatedAt: new Date()
    };

    // If status is being changed to RESOLVED, set resolvedAt
    if (updates.status === DebtStatus.RESOLVED && existingDebt?.status !== DebtStatus.RESOLVED) {
      updatedData.resolvedAt = new Date();
    }

    await debtRef.update(updatedData);

    // Log to audit trail
    await db.collection('technical_debt_audit').add({
      debtId,
      action: 'UPDATED',
      userId,
      timestamp: new Date(),
      before: existingDebt,
      after: updatedData
    });

    // Recalculate metrics if module changed
    if (existingDebt?.module) {
      await updateDebtMetrics(existingDebt.module);
    }

    return {
      success: true,
      message: 'Technical debt updated successfully'
    };
  });

/**
 * Get technical debt metrics for a module
 */
async function updateDebtMetrics(module: string): Promise<void> {
  const snapshot = await db
    .collection('technical_debt')
    .where('module', '==', module)
    .where('status', '!=', DebtStatus.RESOLVED)
    .get();

  let totalMaintenanceCost = 0;
  let totalResolutionCost = 0;
  let totalResolutionTime = 0;
  let totalRevenueRisk = 0;
  let maxSecurityRisk = 0;

  const debtByType: Record<string, number> = {};
  const debtBySeverity: Record<string, number> = {};

  snapshot.docs.forEach(doc => {
    const debt = doc.data() as TechnicalDebtEntry;

    totalMaintenanceCost += debt.maintenanceCostMonthly || 0;
    totalResolutionCost += debt.estimatedResolutionCost || 0;
    totalResolutionTime += debt.estimatedResolutionTime || 0;
    totalRevenueRisk += debt.impact?.revenueRisk || 0;
    maxSecurityRisk = Math.max(maxSecurityRisk, debt.impact?.securityRisk || 0);

    debtByType[debt.debtType] = (debtByType[debt.debtType] || 0) + 1;
    debtBySeverity[debt.severity] = (debtBySeverity[debt.severity] || 0) + 1;
  });

  // Store metrics
  await db.collection('technical_debt_metrics').doc(module).set({
    module,
    totalDebtItems: snapshot.size,
    totalMaintenanceCostMonthly: totalMaintenanceCost,
    totalEstimatedResolutionCost: totalResolutionCost,
    totalEstimatedResolutionTime: totalResolutionTime,
    totalRevenueRisk: totalRevenueRisk,
    maxSecurityRisk,
    debtByType,
    debtBySeverity,
    updatedAt: new Date()
  }, { merge: true });
}

/**
 * Calculate debt summary statistics
 */
function calculateDebtSummary(debts: any[]): any {
  let totalMaintenanceCost = 0;
  let totalResolutionCost = 0;
  let totalRevenueRisk = 0;

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  debts.forEach(debt => {
    totalMaintenanceCost += debt.maintenanceCostMonthly || 0;
    totalResolutionCost += debt.estimatedResolutionCost || 0;
    totalRevenueRisk += debt.impact?.revenueRisk || 0;

    byType[debt.debtType] = (byType[debt.debtType] || 0) + 1;
    bySeverity[debt.severity] = (bySeverity[debt.severity] || 0) + 1;
    byStatus[debt.status] = (byStatus[debt.status] || 0) + 1;
  });

  return {
    totalDebtItems: debts.length,
    totalMaintenanceCostMonthly: totalMaintenanceCost,
    totalEstimatedResolutionCost: totalResolutionCost,
    totalRevenueRisk,
    byType,
    bySeverity,
    byStatus
  };
}
