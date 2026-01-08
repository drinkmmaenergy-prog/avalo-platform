/**
 * PACK 168 — Multi-Account Farm Detection
 * Detects coordinated farming operations across multiple accounts
 */

import { db } from "./init";
import { Timestamp } from "firebase-admin/firestore";
import {
  MultiAccountCluster,
  ClusterSignal,
  FarmingCaseType,
  FarmingCaseStatus
} from "./pack168-types";
import { calculateFarmingRiskScore } from "./pack168-anti-farming-engine";

const MULTI_ACCOUNT_CLUSTERS_COLLECTION = "multi_account_clusters";
const FARMING_CASES_COLLECTION = "farming_cases";

interface DeviceFingerprint {
  userId: string;
  ip: string;
  deviceId: string;
  userAgent: string;
  timestamp: Date;
  sessionId: string;
}

interface UserBehavior {
  userId: string;
  messagePatterns: string[];
  activeHours: number[];
  responseTimings: number[];
  transactionPatterns: Array<{amount: number; timestamp: Date}>;
}

interface AffiliateChain {
  userId: string;
  referrerId?: string;
  referralCount: number;
  referralTree: string[];
}

export async function detectMultiAccountFarming(
  userIds: string[]
): Promise<{clusters: MultiAccountCluster[]; confidence: number}> {
  const clusters: MultiAccountCluster[] = [];

  const ipClusters = await detectIPCorrelation(userIds);
  clusters.push(...ipClusters);

  const deviceClusters = await detectDeviceCorrelation(userIds);
  clusters.push(...deviceClusters);

  const behaviorClusters = await detectBehaviorSimilarity(userIds);
  clusters.push(...behaviorClusters);

  const scriptClusters = await detectMessageScripts(userIds);
  clusters.push(...scriptClusters);

  const referralLoops = await detectReferralLoops(userIds);
  clusters.push(...referralLoops);

  const synchronizedClusters = await detectSynchronizedActivity(userIds);
  clusters.push(...synchronizedClusters);

  const mergedClusters = mergeClusters(clusters);

  for (const cluster of mergedClusters) {
    if (cluster.confidence > 0.7) {
      await db.collection(MULTI_ACCOUNT_CLUSTERS_COLLECTION).doc(cluster.clusterId).set(cluster);

      if (cluster.confidence > 0.85) {
        const caseId = await createMultiAccountFarmingCase(cluster);
        cluster.investigationId = caseId;
        await db.collection(MULTI_ACCOUNT_CLUSTERS_COLLECTION).doc(cluster.clusterId).update({
          status: "confirmed",
          investigationId: caseId
        });

        for (const userId of cluster.accountIds) {
          await calculateFarmingRiskScore(userId);
        }
      }
    }
  }

  const avgConfidence = mergedClusters.length > 0 
    ? mergedClusters.reduce((sum, c) => sum + c.confidence, 0) / mergedClusters.length 
    : 0;

  return { clusters: mergedClusters, confidence: avgConfidence };
}

async function detectIPCorrelation(userIds: string[]): Promise<MultiAccountCluster[]> {
  const clusters: MultiAccountCluster[] = [];
  const ipToUsers = new Map<string, string[]>();

  for (const userId of userIds) {
    const sessionsSnapshot = await db.collection("user_sessions")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    sessionsSnapshot.forEach(doc => {
      const data = doc.data();
      const ip = data.ip;
      if (ip) {
        if (!ipToUsers.has(ip)) {
          ipToUsers.set(ip, []);
        }
        if (!ipToUsers.get(ip)!.includes(userId)) {
          ipToUsers.get(ip)!.push(userId);
        }
      }
    });
  }

  for (const [ip, users] of Array.from(ipToUsers.entries())) {
    if (users.length >= 3) {
      const clusterId = `cluster_ip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const confidence = Math.min(0.95, 0.5 + (users.length - 3) * 0.1);

      clusters.push({
        clusterId,
        accountIds: users,
        detectedAt: Timestamp.now(),
        signals: [{
          signalType: "ip_correlation",
          strength: confidence,
          evidence: { ip, userCount: users.length },
          description: `${users.length} accounts sharing IP address ${ip}`
        }],
        confidence,
        status: "suspected"
      });
    }
  }

  return clusters;
}

async function detectDeviceCorrelation(userIds: string[]): Promise<MultiAccountCluster[]> {
  const clusters: MultiAccountCluster[] = [];
  const deviceToUsers = new Map<string, string[]>();

  for (const userId of userIds) {
    const devicesSnapshot = await db.collection("device_fingerprints")
      .where("userId", "==", userId)
      .limit(5)
      .get();

    devicesSnapshot.forEach(doc => {
      const data = doc.data();
      const deviceId = data.deviceId || data.fingerprint;
      if (deviceId) {
        if (!deviceToUsers.has(deviceId)) {
          deviceToUsers.set(deviceId, []);
        }
        if (!deviceToUsers.get(deviceId)!.includes(userId)) {
          deviceToUsers.get(deviceId)!.push(userId);
        }
      }
    });
  }

  for (const [deviceId, users] of Array.from(deviceToUsers.entries())) {
    if (users.length >= 2) {
      const clusterId = `cluster_device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const confidence = Math.min(0.98, 0.6 + (users.length - 2) * 0.15);

      clusters.push({
        clusterId,
        accountIds: users,
        detectedAt: Timestamp.now(),
        signals: [{
          signalType: "device_correlation",
          strength: confidence,
          evidence: { deviceId, userCount: users.length },
          description: `${users.length} accounts using same device fingerprint`
        }],
        confidence,
        status: "suspected"
      });
    }
  }

  return clusters;
}

async function detectBehaviorSimilarity(userIds: string[]): Promise<MultiAccountCluster[]> {
  const clusters: MultiAccountCluster[] = [];
  const behaviors: UserBehavior[] = [];

  for (const userId of userIds) {
    const messagesSnapshot = await db.collection("messages")
      .where("senderId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();

    const messagePatterns: string[] = [];
    const activeHours: number[] = [];
    const responseTimings: number[] = [];

    messagesSnapshot.forEach(doc => {
      const data = doc.data();
      messagePatterns.push(data.content || "");
      const hour = new Date(data.timestamp.toDate()).getHours();
      activeHours.push(hour);
    });

    behaviors.push({
      userId,
      messagePatterns,
      activeHours,
      responseTimings,
      transactionPatterns: []
    });
  }

  for (let i = 0; i < behaviors.length; i++) {
    for (let j = i + 1; j < behaviors.length; j++) {
      const similarity = calculateBehaviorSimilarity(behaviors[i], behaviors[j]);
      
      if (similarity > 0.7) {
        const clusterId = `cluster_behavior_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        clusters.push({
          clusterId,
          accountIds: [behaviors[i].userId, behaviors[j].userId],
          detectedAt: Timestamp.now(),
          signals: [{
            signalType: "behavior_similarity",
            strength: similarity,
            evidence: { similarity, comparison: "behavioral_patterns" },
            description: `High behavioral similarity (${(similarity * 100).toFixed(1)}%) between accounts`
          }],
          confidence: similarity,
          status: "suspected"
        });
      }
    }
  }

  return clusters;
}

function calculateBehaviorSimilarity(b1: UserBehavior, b2: UserBehavior): number {
  const hourOverlap = calculateArrayOverlap(b1.activeHours, b2.activeHours);
  const patternSimilarity = calculateTextSimilarity(
    b1.messagePatterns.join(" "),
    b2.messagePatterns.join(" ")
  );

  return (hourOverlap + patternSimilarity) / 2;
}

function calculateArrayOverlap(arr1: number[], arr2: number[]): number {
  if (arr1.length === 0 || arr2.length === 0) return 0;
  
  const set1 = new Set(arr1);
  const set2 = new Set(arr2);
  let overlap = 0;
  
  for (const item of Array.from(set1)) {
    if (set2.has(item)) overlap++;
  }
  
  return overlap / Math.max(set1.size, set2.size);
}

function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let overlap = 0;
  
  for (const word of Array.from(set1)) {
    if (set2.has(word)) overlap++;
  }
  
  return overlap / Math.max(set1.size, set2.size);
}

async function detectMessageScripts(userIds: string[]): Promise<MultiAccountCluster[]> {
  const clusters: MultiAccountCluster[] = [];
  const messagesByUser = new Map<string, string[]>();

  for (const userId of userIds) {
    const messagesSnapshot = await db.collection("messages")
      .where("senderId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(20)
      .get();

    const messages: string[] = [];
    messagesSnapshot.forEach(doc => {
      messages.push(doc.data().content || "");
    });

    messagesByUser.set(userId, messages);
  }

  const users = Array.from(messagesByUser.keys());
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const messages1 = messagesByUser.get(users[i]) || [];
      const messages2 = messagesByUser.get(users[j]) || [];

      let identicalCount = 0;
      for (const msg1 of messages1) {
        for (const msg2 of messages2) {
          if (msg1 === msg2 && msg1.length > 20) {
            identicalCount++;
          }
        }
      }

      if (identicalCount >= 3) {
        const clusterId = `cluster_scripts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const confidence = Math.min(0.95, 0.6 + identicalCount * 0.1);

        clusters.push({
          clusterId,
          accountIds: [users[i], users[j]],
          detectedAt: Timestamp.now(),
          signals: [{
            signalType: "message_scripts",
            strength: confidence,
            evidence: { identicalMessages: identicalCount },
            description: `${identicalCount} identical message scripts detected`
          }],
          confidence,
          status: "suspected"
        });
      }
    }
  }

  return clusters;
}

async function detectReferralLoops(userIds: string[]): Promise<MultiAccountCluster[]> {
  const clusters: MultiAccountCluster[] = [];
  const referralGraph = new Map<string, string>();

  for (const userId of userIds) {
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const referrerId = userDoc.data()?.referredBy;
      if (referrerId) {
        referralGraph.set(userId, referrerId);
      }
    }
  }

  const cycles = findReferralCycles(referralGraph, userIds);

  for (const cycle of cycles) {
    const clusterId = `cluster_referral_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const confidence = Math.min(0.9, 0.7 + cycle.length * 0.05);

    clusters.push({
      clusterId,
      accountIds: cycle,
      detectedAt: Timestamp.now(),
      signals: [{
        signalType: "referral_loop",
        strength: confidence,
        evidence: { cycle: cycle.join(" → ") },
        description: `Circular referral loop detected: ${cycle.join(" → ")}`
      }],
      confidence,
      status: "suspected"
    });
  }

  return clusters;
}

function findReferralCycles(graph: Map<string, string>, userIds: string[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();

  for (const userId of userIds) {
    if (visited.has(userId)) continue;

    const path: string[] = [];
    const pathSet = new Set<string>();
    let current = userId;

    while (current && !visited.has(current)) {
      if (pathSet.has(current)) {
        const cycleStart = path.indexOf(current);
        cycles.push(path.slice(cycleStart));
        break;
      }

      path.push(current);
      pathSet.add(current);
      visited.add(current);
      current = graph.get(current) || "";
    }
  }

  return cycles;
}

async function detectSynchronizedActivity(userIds: string[]): Promise<MultiAccountCluster[]> {
  const clusters: MultiAccountCluster[] = [];
  const activityTimelines = new Map<string, Date[]>();

  for (const userId of userIds) {
    const activitySnapshot = await db.collection("user_activity")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();

    const timestamps: Date[] = [];
    activitySnapshot.forEach(doc => {
      timestamps.push(doc.data().timestamp.toDate());
    });

    activityTimelines.set(userId, timestamps);
  }

  const users = Array.from(activityTimelines.keys());
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const timeline1 = activityTimelines.get(users[i]) || [];
      const timeline2 = activityTimelines.get(users[j]) || [];

      const synchronization = calculateSynchronization(timeline1, timeline2);

      if (synchronization > 0.6) {
        const clusterId = `cluster_sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        clusters.push({
          clusterId,
          accountIds: [users[i], users[j]],
          detectedAt: Timestamp.now(),
          signals: [{
            signalType: "synchronized_activity",
            strength: synchronization,
            evidence: { synchronization },
            description: `High activity synchronization (${(synchronization * 100).toFixed(1)}%)`
          }],
          confidence: synchronization,
          status: "suspected"
        });
      }
    }
  }

  return clusters;
}

function calculateSynchronization(timeline1: Date[], timeline2: Date[]): number {
  if (timeline1.length === 0 || timeline2.length === 0) return 0;

  let synchronizedCount = 0;
  const timeWindow = 5 * 60 * 1000;

  for (const t1 of timeline1) {
    for (const t2 of timeline2) {
      if (Math.abs(t1.getTime() - t2.getTime()) < timeWindow) {
        synchronizedCount++;
        break;
      }
    }
  }

  return synchronizedCount / Math.min(timeline1.length, timeline2.length);
}

function mergeClusters(clusters: MultiAccountCluster[]): MultiAccountCluster[] {
  const merged: MultiAccountCluster[] = [];
  const processed = new Set<string>();

  for (const cluster of clusters) {
    if (processed.has(cluster.clusterId)) continue;

    const relatedClusters = clusters.filter(c => 
      !processed.has(c.clusterId) &&
      c.accountIds.some(id => cluster.accountIds.includes(id))
    );

    if (relatedClusters.length <= 1) {
      merged.push(cluster);
      processed.add(cluster.clusterId);
      continue;
    }

    const allAccountIds = new Set<string>();
    const allSignals: ClusterSignal[] = [];
    let totalConfidence = 0;

    for (const c of relatedClusters) {
      c.accountIds.forEach(id => allAccountIds.add(id));
      allSignals.push(...c.signals);
      totalConfidence += c.confidence;
      processed.add(c.clusterId);
    }

    const avgConfidence = totalConfidence / relatedClusters.length;
    const mergedClusterId = `cluster_merged_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    merged.push({
      clusterId: mergedClusterId,
      accountIds: Array.from(allAccountIds),
      detectedAt: Timestamp.now(),
      signals: allSignals,
      confidence: avgConfidence,
      status: avgConfidence > 0.85 ? "confirmed" : "suspected"
    });
  }

  return merged;
}

async function createMultiAccountFarmingCase(cluster: MultiAccountCluster): Promise<string> {
  const caseId = `fc_multi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.collection(FARMING_CASES_COLLECTION).doc(caseId).set({
    caseId,
    type: FarmingCaseType.MULTI_ACCOUNT_FARMING,
    status: FarmingCaseStatus.DETECTED,
    severity: cluster.confidence > 0.95 ? "critical" : cluster.confidence > 0.85 ? "high" : "medium",
    involvedUserIds: cluster.accountIds,
    detectedAt: Timestamp.now(),
    evidence: [{
      type: "multi_account_cluster",
      timestamp: Timestamp.now(),
      data: { 
        clusterId: cluster.clusterId, 
        signals: cluster.signals,
        accountCount: cluster.accountIds.length 
      },
      confidence: cluster.confidence,
      description: `Multi-account farming cluster detected with ${cluster.signals.length} signals`
    }],
    investigationNotes: [],
    metadata: {
      clusterId: cluster.clusterId,
      signalTypes: cluster.signals.map(s => s.signalType)
    }
  });

  return caseId;
}

export async function requestIdentityReVerification(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await db.collection("kyc_verification_requests").add({
      userId,
      requestedAt: Timestamp.now(),
      reason: "multi_account_farming_suspected",
      status: "pending",
      requiredLevel: "enhanced"
    });

    await db.collection("users").doc(userId).update({
      kycStatus: "re_verification_required",
      accountRestricted: true,
      restrictionReason: "Identity re-verification required due to suspicious activity"
    });
  }
}

export async function disableAffiliateLinks(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await db.collection("affiliate_links").where("userId", "==", userId).get()
      .then(snapshot => {
        const batch = db.batch();
        snapshot.forEach(doc => {
          batch.update(doc.ref, {
            disabled: true,
            disabledAt: Timestamp.now(),
            disableReason: "multi_account_farming_detected"
          });
        });
        return batch.commit();
      });
  }
}