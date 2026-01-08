/**
 * PACK 168 — Avalo Anti-Farming & Wealth-Protection Engine
 * Core Detection and Protection Functions
 */

import { db } from "./init";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import {
  FarmingCase,
  FarmingCaseType,
  FarmingCaseStatus,
  FarmingEvidence,
  WealthProtectionProfile,
  ProtectionLevel,
  ProtectionPhase,
  SpendingRiskEvent,
  SpendingRiskEventType,
  HarvestDetectionLog,
  FarmingRiskScore,
  RiskFactor,
  MultiAccountCluster,
  ClusterSignal,
  EmotionalGroomingPattern,
  GroomingTactic,
  GroomingInstance,
  TokenLaunderingNetwork,
  LaunderingTransaction,
  ResolutionAction,
  SpendingThreshold,
  EarningThreshold
} from "./pack168-types";

const FARMING_CASES_COLLECTION = "farming_cases";
const WEALTH_PROTECTION_PROFILES_COLLECTION = "wealth_protection_profiles";
const SPENDING_RISK_EVENTS_COLLECTION = "spending_risk_events";
const HARVEST_DETECTION_LOGS_COLLECTION = "harvest_detection_logs";
const FARMING_RISK_SCORES_COLLECTION = "farming_risk_scores";
const MULTI_ACCOUNT_CLUSTERS_COLLECTION = "multi_account_clusters";
const EMOTIONAL_GROOMING_PATTERNS_COLLECTION = "emotional_grooming_patterns";
const TOKEN_LAUNDERING_NETWORKS_COLLECTION = "token_laundering_networks";

const HIGH_SPENDER_THRESHOLD = 5000;
const VERY_HIGH_SPENDER_THRESHOLD = 15000;
const WHALE_SPENDER_THRESHOLD = 50000;
const HIGH_EARNER_THRESHOLD = 10000;
const VERY_HIGH_EARNER_THRESHOLD = 30000;
const TOP_CREATOR_THRESHOLD = 100000;

export async function detectTokenLaundering(
  transactions: Array<{from: string; to: string; amount: number; timestamp: Date}>
): Promise<{detected: boolean; network?: TokenLaunderingNetwork; confidence: number}> {
  const userGraph = new Map<string, Set<string>>();
  const transactionsByPair = new Map<string, LaunderingTransaction[]>();

  for (const tx of transactions) {
    if (!userGraph.has(tx.from)) {
      userGraph.set(tx.from, new Set());
    }
    userGraph.get(tx.from)!.add(tx.to);

    const pairKey = [tx.from, tx.to].sort().join("-");
    if (!transactionsByPair.has(pairKey)) {
      transactionsByPair.set(pairKey, []);
    }
    transactionsByPair.get(pairKey)!.push({
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      timestamp: Timestamp.fromDate(tx.timestamp),
      suspicious: false
    });
  }

  const cycles = detectCycles(userGraph);
  
  if (cycles.length === 0) {
    return { detected: false, confidence: 0 };
  }

  const suspiciousTransactions: LaunderingTransaction[] = [];
  let totalVolume = 0;
  const involvedAccounts = new Set<string>();

  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length; i++) {
      const from = cycle[i];
      const to = cycle[(i + 1) % cycle.length];
      const pairKey = [from, to].sort().join("-");
      const txs = transactionsByPair.get(pairKey) || [];
      
      for (const tx of txs) {
        tx.suspicious = true;
        tx.reason = "Part of token recycling cycle";
        suspiciousTransactions.push(tx);
        totalVolume += tx.amount;
        involvedAccounts.add(tx.from);
        involvedAccounts.add(tx.to);
      }
    }
  }

  const confidence = Math.min(0.95, 0.5 + (cycles.length * 0.1) + (involvedAccounts.size > 5 ? 0.2 : 0));

  const networkId = `tl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const network: TokenLaunderingNetwork = {
    networkId,
    detectedAt: Timestamp.now(),
    accounts: Array.from(involvedAccounts),
    transactions: suspiciousTransactions,
    cycleDetected: true,
    totalVolume,
    confidence,
    frozen: false
  };

  await db.collection(TOKEN_LAUNDERING_NETWORKS_COLLECTION).doc(networkId).set(network);

  await logHarvestDetection({
    detectionType: "token_laundering",
    involvedUserIds: Array.from(involvedAccounts),
    patterns: [{
      pattern: "cyclic_token_flow",
      description: `Detected ${cycles.length} cycles involving ${involvedAccounts.size} accounts`,
      evidence: cycles.map(c => c.join(" → ")),
      weight: confidence
    }],
    confidence,
    actionTaken: "network_recorded",
    escalated: confidence > 0.7
  });

  if (confidence > 0.7) {
    await createFarmingCase({
      type: FarmingCaseType.TOKEN_LAUNDERING,
      severity: confidence > 0.9 ? "critical" : "high",
      involvedUserIds: Array.from(involvedAccounts),
      evidence: [{
        type: "token_laundering_network",
        timestamp: Timestamp.now(),
        data: { networkId, cycles: cycles.length, volume: totalVolume },
        confidence,
        description: "Cyclic token flow pattern detected between accounts"
      }]
    });
  }

  return { detected: true, network, confidence };
}

function detectCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of Array.from(neighbors)) {
      if (!visited.has(neighbor)) {
        parent.set(neighbor, node);
        dfs(neighbor, [...path]);
      } else if (recStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
      }
    }

    recStack.delete(node);
  }

  for (const node of Array.from(graph.keys())) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}

export async function detectSpendHarvesting(
  userId: string,
  targetUserId: string,
  recentTransactions: Array<{amount: number; timestamp: Date; context: string}>
): Promise<{detected: boolean; riskScore: number; patterns: string[]}> {
  const patterns: string[] = [];
  let riskScore = 0;

  const amounts = recentTransactions.map(t => t.amount);
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const totalSpent = amounts.reduce((a, b) => a + b, 0);

  if (avgAmount > 500) {
    patterns.push("high_average_transaction");
    riskScore += 0.2;
  }

  if (totalSpent > 2000) {
    patterns.push("high_total_spending");
    riskScore += 0.15;
  }

  const timestamps = recentTransactions.map(t => t.timestamp.getTime());
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  
  if (avgInterval < 3600000) {
    patterns.push("rapid_transaction_frequency");
    riskScore += 0.25;
  }

  const targetProfileRef = db.collection(WEALTH_PROTECTION_PROFILES_COLLECTION).doc(targetUserId);
  const targetProfile = await targetProfileRef.get();
  
  if (targetProfile.exists) {
    const data = targetProfile.data() as WealthProtectionProfile;
    const earnedFromUser = recentTransactions.length;
    const totalInteractions = data.totalEarned / 100;
    
    if (earnedFromUser / totalInteractions > 0.5) {
      patterns.push("disproportionate_earnings_from_single_user");
      riskScore += 0.3;
    }
  }

  const contextAnalysis = analyzeTransactionContexts(recentTransactions.map(t => t.context));
  if (contextAnalysis.romanticLanguage > 0.5) {
    patterns.push("romantic_monetization_detected");
    riskScore += 0.4;
  }

  if (contextAnalysis.pressureLanguage > 0.5) {
    patterns.push("pressure_tactics_detected");
    riskScore += 0.35;
  }

  riskScore = Math.min(1.0, riskScore);

  if (riskScore > 0.6) {
    await logHarvestDetection({
      detectionType: "spend_harvesting",
      involvedUserIds: [userId, targetUserId],
      patterns: patterns.map(p => ({
        pattern: p,
        description: `Detected in transaction analysis`,
        evidence: recentTransactions.map(t => t.amount),
        weight: riskScore
      })),
      confidence: riskScore,
      actionTaken: "monitoring_enabled",
      escalated: riskScore > 0.8
    });

    if (riskScore > 0.8) {
      await applyWealthProtection(userId, targetUserId, ProtectionPhase.PHASE_2_HEALTH_REMINDER, {
        reason: "Potential spend harvesting detected",
        riskScore,
        patterns
      });
    }
  }

  return { detected: riskScore > 0.6, riskScore, patterns };
}

function analyzeTransactionContexts(contexts: string[]): {romanticLanguage: number; pressureLanguage: number} {
  const romanticKeywords = ["love", "heart", "baby", "darling", "miss you", "thinking of you", "special", "together"];
  const pressureKeywords = ["prove", "if you care", "show me", "buy", "need", "deserve", "owe me", "leave"];

  let romanticCount = 0;
  let pressureCount = 0;

  for (const context of contexts) {
    const lower = context.toLowerCase();
    for (const keyword of romanticKeywords) {
      if (lower.includes(keyword)) {
        romanticCount++;
        break;
      }
    }
    for (const keyword of pressureKeywords) {
      if (lower.includes(keyword)) {
        pressureCount++;
        break;
      }
    }
  }

  return {
    romanticLanguage: contexts.length > 0 ? romanticCount / contexts.length : 0,
    pressureLanguage: contexts.length > 0 ? pressureCount / contexts.length : 0
  };
}

export async function applyWealthProtection(
  userId: string,
  targetUserId: string,
  phase: ProtectionPhase,
  metadata: Record<string, any>
): Promise<void> {
  const profileRef = db.collection(WEALTH_PROTECTION_PROFILES_COLLECTION).doc(userId);
  const profile = await profileRef.get();

  let protectionData: Partial<WealthProtectionProfile>;
  
  if (!profile.exists) {
    protectionData = {
      userId,
      totalSpent: 0,
      totalEarned: 0,
      last30DaysSpent: 0,
      last30DaysEarned: 0,
      protectionLevel: ProtectionLevel.BASIC,
      protectionSettings: {
        spendingAlertsEnabled: true,
        safePurchaseModeEnabled: false,
        autoRejectRomanticMonetization: false,
        autoReportFarmingAttempts: true,
        lockedPayoutCalendar: false
      },
      spendingAlerts: [],
      blockedInteractions: [],
      healthReminders: [],
      lastUpdated: Timestamp.now()
    };
  } else {
    protectionData = profile.data() as WealthProtectionProfile;
  }

  const eventId = `sre_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const riskEvent: SpendingRiskEvent = {
    eventId,
    userId,
    targetUserId,
    timestamp: Timestamp.now(),
    eventType: metadata.eventType || SpendingRiskEventType.UNUSUAL_LARGE_PURCHASE,
    amount: metadata.amount || 0,
    context: metadata.reason || "Protection triggered",
    riskScore: metadata.riskScore || 0,
    phase,
    action: getPhaseAction(phase),
    metadata
  };

  await db.collection(SPENDING_RISK_EVENTS_COLLECTION).doc(eventId).set(riskEvent);

  switch (phase) {
    case ProtectionPhase.PHASE_1_SOFT_FILTER:
      protectionData.spendingAlerts = protectionData.spendingAlerts || [];
      protectionData.spendingAlerts.push({
        alertId: `alert_${Date.now()}`,
        timestamp: Timestamp.now(),
        type: "high_risk_purchase",
        amount: metadata.amount || 0,
        recipientUserId: targetUserId,
        message: "Are you sure this is a good idea?"
      });
      break;

    case ProtectionPhase.PHASE_2_HEALTH_REMINDER:
      protectionData.healthReminders = protectionData.healthReminders || [];
      protectionData.healthReminders.push({
        reminderId: `reminder_${Date.now()}`,
        timestamp: Timestamp.now(),
        type: "spending_health",
        message: "Consider setting a weekly budget to protect your financial wellbeing.",
        action: "set_budget",
        dismissed: false
      });
      break;

    case ProtectionPhase.PHASE_3_HARD_BLOCK:
      protectionData.blockedInteractions = protectionData.blockedInteractions || [];
      protectionData.blockedInteractions.push({
        blockId: `block_${Date.now()}`,
        timestamp: Timestamp.now(),
        targetUserId,
        reason: "Predatory patterns detected - this chat has been suspended for your protection",
        blockType: "hard_block",
        canAppeal: false
      });
      break;

    case ProtectionPhase.PHASE_4_INVESTIGATION:
      await createFarmingCase({
        type: FarmingCaseType.MONEY_HARVESTING,
        severity: "high",
        involvedUserIds: [userId, targetUserId],
        primaryTargetUserId: userId,
        evidence: [{
          type: "spend_harvesting",
          timestamp: Timestamp.now(),
          data: metadata,
          confidence: metadata.riskScore || 0.8,
          description: "Predatory spending pattern triggered investigation"
        }]
      });
      break;
  }

  protectionData.lastUpdated = Timestamp.now();
  await profileRef.set(protectionData, { merge: true });
}

function getPhaseAction(phase: ProtectionPhase): string {
  switch (phase) {
    case ProtectionPhase.PHASE_1_SOFT_FILTER: return "soft_warning_shown";
    case ProtectionPhase.PHASE_2_HEALTH_REMINDER: return "health_reminder_sent";
    case ProtectionPhase.PHASE_3_HARD_BLOCK: return "interaction_blocked";
    case ProtectionPhase.PHASE_4_INVESTIGATION: return "case_created";
    default: return "no_action";
  }
}

export async function freezeFarmedEarnings(
  userIds: string[],
  reason: string,
  caseId: string
): Promise<{frozenAmount: number; affectedAccounts: number}> {
  let totalFrozen = 0;
  let affectedCount = 0;

  for (const userId of userIds) {
    const earningsRef = db.collection("creator_earnings").doc(userId);
    const earnings = await earningsRef.get();

    if (earnings.exists) {
      const data = earnings.data();
      const currentBalance = data?.balance || 0;

      await earningsRef.update({
        balance: 0,
        frozenBalance: FieldValue.increment(currentBalance),
        frozenReason: reason,
        frozenCaseId: caseId,
        frozenAt: Timestamp.now()
      });

      totalFrozen += currentBalance;
      affectedCount++;
    }
  }

  return { frozenAmount: totalFrozen, affectedAccounts: affectedCount };
}

async function createFarmingCase(params: {
  type: FarmingCaseType;
  severity: "low" | "medium" | "high" | "critical";
  involvedUserIds: string[];
  primaryTargetUserId?: string;
  evidence: Array<Omit<FarmingEvidence, "timestamp"> & {timestamp: Timestamp}>;
}): Promise<string> {
  const caseId = `fc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const farmingCase: FarmingCase = {
    caseId,
    type: params.type,
    status: FarmingCaseStatus.DETECTED,
    severity: params.severity,
    involvedUserIds: params.involvedUserIds,
    primaryTargetUserId: params.primaryTargetUserId,
    detectedAt: Timestamp.now(),
    evidence: params.evidence,
    investigationNotes: [],
    metadata: {}
  };

  await db.collection(FARMING_CASES_COLLECTION).doc(caseId).set(farmingCase);

  return caseId;
}

async function logHarvestDetection(params: {
  detectionType: string;
  involvedUserIds: string[];
  patterns: Array<{pattern: string; description: string; evidence: any[]; weight: number}>;
  confidence: number;
  actionTaken: string;
  escalated: boolean;
  caseId?: string;
}): Promise<void> {
  const logId = `hdl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const log: HarvestDetectionLog = {
    logId,
    timestamp: Timestamp.now(),
    detectionType: params.detectionType,
    involvedUserIds: params.involvedUserIds,
    patterns: params.patterns,
    confidence: params.confidence,
    actionTaken: params.actionTaken,
    escalated: params.escalated,
    caseId: params.caseId
  };

  await db.collection(HARVEST_DETECTION_LOGS_COLLECTION).doc(logId).set(log);
}

export async function calculateFarmingRiskScore(userId: string): Promise<FarmingRiskScore> {
  const factors: RiskFactor[] = [];
  let totalScore = 0;

  const casesSnapshot = await db.collection(FARMING_CASES_COLLECTION)
    .where("involvedUserIds", "array-contains", userId)
    .get();
  
  if (!casesSnapshot.empty) {
    const weight = Math.min(0.4, casesSnapshot.size * 0.1);
    factors.push({
      factor: "previous_farming_cases",
      weight,
      evidence: `Involved in ${casesSnapshot.size} farming cases`,
      confidence: 0.9
    });
    totalScore += weight;
  }

  const clustersSnapshot = await db.collection(MULTI_ACCOUNT_CLUSTERS_COLLECTION)
    .where("accountIds", "array-contains", userId)
    .get();
  
  if (!clustersSnapshot.empty) {
    const weight = 0.35;
    factors.push({
      factor: "multi_account_clustering",
      weight,
      evidence: `Part of ${clustersSnapshot.size} suspicious account clusters`,
      confidence: 0.85
    });
    totalScore += weight;
  }

  const groomingSnapshot = await db.collection(EMOTIONAL_GROOMING_PATTERNS_COLLECTION)
    .where("groomerId", "==", userId)
    .get();
  
  if (!groomingSnapshot.empty) {
    const weight = 0.45;
    factors.push({
      factor: "emotional_grooming_patterns",
      weight,
      evidence: `${groomingSnapshot.size} grooming patterns detected`,
      confidence: 0.95
    });
    totalScore += weight;
  }

  totalScore = Math.min(1.0, totalScore);

  const riskScore: FarmingRiskScore = {
    userId,
    score: totalScore,
    factors,
    lastCalculated: Timestamp.now(),
    auditFrequency: totalScore > 0.7 ? 7 : totalScore > 0.4 ? 14 : 30,
    mysteryShopperTriggers: Math.floor(totalScore * 10),
    escrowProtectionDays: Math.floor(totalScore * 30),
    notes: []
  };

  await db.collection(FARMING_RISK_SCORES_COLLECTION).doc(userId).set(riskScore);

  return riskScore;
}

export async function getSpendingThreshold(userId: string): Promise<SpendingThreshold> {
  const profileRef = db.collection(WEALTH_PROTECTION_PROFILES_COLLECTION).doc(userId);
  const profile = await profileRef.get();
  
  const spending = profile.exists ? (profile.data() as WealthProtectionProfile).last30DaysSpent : 0;

  if (spending >= WHALE_SPENDER_THRESHOLD) {
    return { level: "whale", monthlySpending: spending, protectionTriggered: true };
  } else if (spending >= VERY_HIGH_SPENDER_THRESHOLD) {
    return { level: "very_high", monthlySpending: spending, protectionTriggered: true };
  } else if (spending >= HIGH_SPENDER_THRESHOLD) {
    return { level: "high", monthlySpending: spending, protectionTriggered: true };
  }
  
  return { level: "normal", monthlySpending: spending, protectionTriggered: false };
}

export async function getEarningThreshold(userId: string): Promise<EarningThreshold> {
  const profileRef = db.collection(WEALTH_PROTECTION_PROFILES_COLLECTION).doc(userId);
  const profile = await profileRef.get();
  
  const earnings = profile.exists ? (profile.data() as WealthProtectionProfile).last30DaysEarned : 0;

  if (earnings >= TOP_CREATOR_THRESHOLD) {
    return { level: "top_creator", monthlyEarnings: earnings, protectionTriggered: true };
  } else if (earnings >= VERY_HIGH_EARNER_THRESHOLD) {
    return { level: "very_high", monthlyEarnings: earnings, protectionTriggered: true };
  } else if (earnings >= HIGH_EARNER_THRESHOLD) {
    return { level: "high", monthlyEarnings: earnings, protectionTriggered: true };
  }
  
  return { level: "normal", monthlyEarnings: earnings, protectionTriggered: false };
}

export async function investigateFarmingCase(caseId: string, investigatorId: string, notes: string): Promise<void> {
  const caseRef = db.collection(FARMING_CASES_COLLECTION).doc(caseId);
  
  await caseRef.update({
    status: FarmingCaseStatus.INVESTIGATING,
    investigationNotes: FieldValue.arrayUnion(`[${new Date().toISOString()}] ${investigatorId}: ${notes}`)
  });
}

export async function resolveFarmingCase(
  caseId: string,
  action: ResolutionAction,
  reason: string,
  resolvedBy: string
): Promise<void> {
  const caseRef = db.collection(FARMING_CASES_COLLECTION).doc(caseId);
  const caseDoc = await caseRef.get();
  
  if (!caseDoc.exists) {
    throw new Error("Case not found");
  }

  const caseData = caseDoc.data() as FarmingCase;
  const penaltiesApplied: string[] = [];

  if (action === ResolutionAction.EARNINGS_FROZEN) {
    const result = await freezeFarmedEarnings(caseData.involvedUserIds, reason, caseId);
    penaltiesApplied.push(`Frozen ${result.frozenAmount} tokens from ${result.affectedAccounts} accounts`);
  }

  if (action === ResolutionAction.ACCOUNT_SUSPENDED || action === ResolutionAction.PERMANENT_BAN) {
    for (const userId of caseData.involvedUserIds) {
      await db.collection("users").doc(userId).update({
        accountStatus: action === ResolutionAction.PERMANENT_BAN ? "banned" : "suspended",
        banReason: reason,
        bannedAt: Timestamp.now(),
        bannedBy: resolvedBy
      });
      penaltiesApplied.push(`${action} applied to user ${userId}`);
    }
  }

  await caseRef.update({
    status: FarmingCaseStatus.RESOLVED,
    resolution: {
      action,
      reason,
      penaltiesApplied,
      affectedAccounts: caseData.involvedUserIds
    },
    resolvedAt: Timestamp.now(),
    resolvedBy
  });
}