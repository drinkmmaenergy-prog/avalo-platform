/**
 * PACK 156: Compliance Schedulers
 * Automated probing, score decay, and cleanup tasks
 */

import { db } from '../init';
import { scheduleRandomProbe, getActiveShoppers } from './probe-engine';
import { decayComplianceScore } from './compliance-cases';
import { cleanupExpiredActions } from './enforcement';
import { cleanupExpiredCases } from './compliance-cases';

const COLLECTIONS = {
  COMPLIANCE_RISK_SCORES: 'compliance_risk_scores'
};

export async function runScheduledProbes(): Promise<{
  totalProbesScheduled: number;
  usersTargeted: number;
}> {
  const usersNeedingAudit = await getUsersNeedingAudit();

  let totalProbesScheduled = 0;

  for (const userId of usersNeedingAudit) {
    try {
      await scheduleRandomProbe({ targetUserId: userId });
      totalProbesScheduled++;
    } catch (error) {
      console.error(`Failed to schedule probe for user ${userId}:`, error);
    }
  }

  return {
    totalProbesScheduled,
    usersTargeted: usersNeedingAudit.length
  };
}

export async function runScoreDecayJob(): Promise<{
  usersProcessed: number;
  errors: number;
}> {
  const snapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_RISK_SCORES)
    .where('score', '<', 100)
    .get();

  let usersProcessed = 0;
  let errors = 0;

  const promises = snapshot.docs.map(async (doc) => {
    try {
      await decayComplianceScore(doc.id);
      usersProcessed++;
    } catch (error) {
      console.error(`Failed to decay score for user ${doc.id}:`, error);
      errors++;
    }
  });

  await Promise.all(promises);

  return { usersProcessed, errors };
}

export async function runCleanupJob(): Promise<{
  expiredActions: number;
  expiredCases: number;
}> {
  const expiredActions = await cleanupExpiredActions();
  const expiredCases = await cleanupExpiredCases();

  return { expiredActions, expiredCases };
}

export async function runConsistencyAudit(): Promise<{
  inconsistencies: string[];
  fixed: number;
}> {
  const inconsistencies: string[] = [];
  let fixed = 0;

  const shoppers = await getActiveShoppers();
  const inactiveShoppers = shoppers.filter(s => {
    const daysSinceActive = Math.floor(
      (Date.now() - s.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceActive > 30;
  });

  if (inactiveShoppers.length > 0) {
    inconsistencies.push(
      `Found ${inactiveShoppers.length} shoppers inactive for >30 days`
    );
  }

  const riskScoresSnapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_RISK_SCORES)
    .where('score', '<', 0)
    .get();

  if (!riskScoresSnapshot.empty) {
    inconsistencies.push(
      `Found ${riskScoresSnapshot.size} risk scores below 0`
    );
    
    const batch = db.batch();
    riskScoresSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { score: 0 });
      fixed++;
    });
    await batch.commit();
  }

  const overScoresSnapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_RISK_SCORES)
    .where('score', '>', 100)
    .get();

  if (!overScoresSnapshot.empty) {
    inconsistencies.push(
      `Found ${overScoresSnapshot.size} risk scores above 100`
    );
    
    const batch = db.batch();
    overScoresSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { score: 100 });
      fixed++;
    });
    await batch.commit();
  }

  return { inconsistencies, fixed };
}

async function getUsersNeedingAudit(): Promise<string[]> {
  const now = new Date();
  
  const snapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_RISK_SCORES)
    .where('nextAuditScheduledAt', '<=', now)
    .limit(100)
    .get();

  return snapshot.docs.map(doc => doc.id);
}

export async function scheduleHighRiskUserAudit(userId: string): Promise<void> {
  const doc = await db
    .collection(COLLECTIONS.COMPLIANCE_RISK_SCORES)
    .doc(userId)
    .get();

  const data = doc.data();
  
  if (!data) {
    return;
  }

  if (data.tier === 'critical' || data.tier === 'poor') {
    await scheduleRandomProbe({
      targetUserId: userId,
      probeTypes: ['romantic_monetization', 'escort_dynamics', 'nsfw_solicitation']
    });
  }
}

export async function getSchedulerMetrics() {
  const shoppers = await getActiveShoppers();
  
  const riskScoresSnapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_RISK_SCORES)
    .get();

  const riskScores = riskScoresSnapshot.docs.map(doc => doc.data());

  const tierCounts = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    critical: 0
  };

  riskScores.forEach(score => {
    tierCounts[score.tier as keyof typeof tierCounts]++;
  });

  const now = new Date();
  const auditScheduleCounts = {
    overdue: 0,
    today: 0,
    thisWeek: 0,
    thisMonth: 0
  };

  riskScores.forEach(score => {
    if (!score.nextAuditScheduledAt) return;
    
    const nextAudit = score.nextAuditScheduledAt.toDate();
    const daysUntil = Math.floor(
      (nextAudit.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntil < 0) {
      auditScheduleCounts.overdue++;
    } else if (daysUntil === 0) {
      auditScheduleCounts.today++;
    } else if (daysUntil <= 7) {
      auditScheduleCounts.thisWeek++;
    } else if (daysUntil <= 30) {
      auditScheduleCounts.thisMonth++;
    }
  });

  return {
    activeShoppers: shoppers.length,
    totalUsersWithRiskScores: riskScores.length,
    tierDistribution: tierCounts,
    auditSchedule: auditScheduleCounts
  };
}