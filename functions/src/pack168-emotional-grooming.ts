/**
 * PACK 168 — Emotional Grooming Recognition
 * Detects emotional manipulation and romance-for-payment patterns
 */

import { db } from "./init";
import { Timestamp } from "firebase-admin/firestore";
import {
  EmotionalGroomingPattern,
  GroomingTactic,
  GroomingInstance,
  FarmingCaseType,
  ProtectionPhase
} from "./pack168-types";
import { applyWealthProtection } from "./pack168-anti-farming-engine";

const EMOTIONAL_GROOMING_PATTERNS_COLLECTION = "emotional_grooming_patterns";
const FARMING_CASES_COLLECTION = "farming_cases";

interface Message {
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: Date;
  metadata?: {
    relatedPayment?: boolean;
    amount?: number;
  };
}

const GROOMING_INDICATORS = {
  guilt_tripping: [
    "if you really cared",
    "if you loved me",
    "you don't care about me",
    "i thought you were different",
    "you're just like everyone else",
    "after all i've done",
    "disappointed in you",
    "you're hurting me"
  ],
  forced_loyalty: [
    "prove your loyalty",
    "show me you're serious",
    "prove you're real",
    "if you're genuine",
    "real fans would",
    "true supporters",
    "only if you care"
  ],
  prove_care_payment: [
    "prove you care by",
    "show me by buying",
    "if you want to make me happy",
    "support me with",
    "want to show your love",
    "demonstrate your affection"
  ],
  buy_or_leave: [
    "buy or i'll block you",
    "pay or leave",
    "subscribe or goodbye",
    "tip or i'm done",
    "support me or move on",
    "no payment, no talk"
  ],
  seduction_tied_tokens: [
    "unlock my photos",
    "pay to see more",
    "tip for special content",
    "exclusive for tippers",
    "intimate for supporters",
    "private show for payment"
  ],
  voice_manipulation: [
    "my voice message costs",
    "call me if you pay",
    "audio is premium",
    "hear my voice for"
  ]
};

export async function detectEmotionalGrooming(
  groomerId: string,
  victimId: string,
  messages: Message[],
  transactions: Array<{amount: number; timestamp: Date}>
): Promise<{detected: boolean; pattern?: EmotionalGroomingPattern; severity: number}> {
  const tactics: Map<string, GroomingInstance[]> = new Map();

  for (const message of messages) {
    if (message.senderId !== groomerId) continue;

    const content = message.content.toLowerCase();
    
    for (const [tacticName, indicators] of Object.entries(GROOMING_INDICATORS)) {
      for (const indicator of indicators) {
        if (content.includes(indicator)) {
          if (!tactics.has(tacticName)) {
            tactics.set(tacticName, []);
          }

          const relatedTransaction = transactions.find(t => 
            Math.abs(t.timestamp.getTime() - message.timestamp.getTime()) < 3600000
          );

          tactics.get(tacticName)!.push({
            timestamp: Timestamp.fromDate(message.timestamp),
            context: message.content.substring(0, 200),
            amount: relatedTransaction?.amount,
            messageSnippet: indicator
          });
        }
      }
    }
  }

  if (tactics.size === 0) {
    return { detected: false, severity: 0 };
  }

  let severity = 0;
  let monetizationLinked = false;

  const groomingTactics: GroomingTactic[] = Array.from(tactics.entries()).map(([tactic, instances]) => {
    const averageAmount = instances
      .filter(i => i.amount !== undefined)
      .reduce((sum, i) => sum + (i.amount || 0), 0) / instances.length || undefined;

    if (averageAmount && averageAmount > 0) {
      monetizationLinked = true;
      severity += 0.3;
    }

    severity += instances.length * 0.1;

    return {
      tactic: tactic as any,
      instances,
      averageAmount
    };
  });

  severity = Math.min(1.0, severity);

  const patternId = `egp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const pattern: EmotionalGroomingPattern = {
    patternId,
    detectedAt: Timestamp.now(),
    groomerId,
    victimId,
    tactics: groomingTactics,
    severity,
    monetizationLinked,
    blocked: false
  };

  await db.collection(EMOTIONAL_GROOMING_PATTERNS_COLLECTION).doc(patternId).set(pattern);

  if (severity > 0.6 || monetizationLinked) {
    if (severity > 0.8) {
      await applyWealthProtection(
        victimId,
        groomerId,
        ProtectionPhase.PHASE_3_HARD_BLOCK,
        {
          reason: "Emotional grooming with monetization detected",
          patternId,
          severity,
          tactics: Array.from(tactics.keys())
        }
      );

      pattern.blocked = true;
      await db.collection(EMOTIONAL_GROOMING_PATTERNS_COLLECTION).doc(patternId).update({ blocked: true });
    } else {
      await applyWealthProtection(
        victimId,
        groomerId,
        ProtectionPhase.PHASE_2_HEALTH_REMINDER,
        {
          reason: "Potential emotional grooming detected",
          patternId,
          severity
        }
      );
    }

    if (monetizationLinked) {
      await createGroomingCase(pattern);
    }
  }

  return { detected: true, pattern, severity };
}

export async function analyzeConversationForGrooming(
  conversationId: string
): Promise<{risk: number; tactics: string[]; recommendation: string}> {
  const messagesSnapshot = await db.collection("messages")
    .where("conversationId", "==", conversationId)
    .orderBy("timestamp", "desc")
    .limit(100)
    .get();

  const messages: Message[] = [];
  const participantIds = new Set<string>();

  messagesSnapshot.forEach(doc => {
    const data = doc.data();
    messages.push({
      senderId: data.senderId,
      recipientId: data.recipientId,
      content: data.content || "",
      timestamp: data.timestamp.toDate(),
      metadata: data.metadata
    });
    participantIds.add(data.senderId);
    participantIds.add(data.recipientId);
  });

  if (participantIds.size !== 2) {
    return { risk: 0, tactics: [], recommendation: "normal" };
  }

  const [user1, user2] = Array.from(participantIds);
  
  const transactionsSnapshot = await db.collection("transactions")
    .where("conversationId", "==", conversationId)
    .orderBy("timestamp", "desc")
    .limit(50)
    .get();

  const transactions: Array<{amount: number; timestamp: Date}> = [];
  transactionsSnapshot.forEach(doc => {
    const data = doc.data();
    transactions.push({
      amount: data.amount,
      timestamp: data.timestamp.toDate()
    });
  });

  const result1 = await detectEmotionalGrooming(user1, user2, messages, transactions);
  const result2 = await detectEmotionalGrooming(user2, user1, messages, transactions);

  const maxSeverity = Math.max(result1.severity, result2.severity);
  const allTactics = new Set<string>();

  if (result1.detected && result1.pattern) {
    result1.pattern.tactics.forEach(t => allTactics.add(t.tactic));
  }
  if (result2.detected && result2.pattern) {
    result2.pattern.tactics.forEach(t => allTactics.add(t.tactic));
  }

  let recommendation = "normal";
  if (maxSeverity > 0.8) {
    recommendation = "block_immediately";
  } else if (maxSeverity > 0.6) {
    recommendation = "monitor_closely";
  } else if (maxSeverity > 0.3) {
    recommendation = "warning_advisable";
  }

  return {
    risk: maxSeverity,
    tactics: Array.from(allTactics),
    recommendation
  };
}

async function createGroomingCase(pattern: EmotionalGroomingPattern): Promise<string> {
  const caseId = `fc_grooming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.collection(FARMING_CASES_COLLECTION).doc(caseId).set({
    caseId,
    type: pattern.monetizationLinked 
      ? FarmingCaseType.ROMANCE_FOR_PAYMENT 
      : FarmingCaseType.EMOTIONAL_GROOMING,
    status: "detected",
    severity: pattern.severity > 0.9 ? "critical" : pattern.severity > 0.7 ? "high" : "medium",
    involvedUserIds: [pattern.groomerId, pattern.victimId],
    primaryTargetUserId: pattern.victimId,
    detectedAt: Timestamp.now(),
    evidence: [{
      type: "emotional_grooming_pattern",
      timestamp: Timestamp.now(),
      data: {
        patternId: pattern.patternId,
        tactics: pattern.tactics.map(t => t.tactic),
        instanceCount: pattern.tactics.reduce((sum, t) => sum + t.instances.length, 0),
        monetizationLinked: pattern.monetizationLinked
      },
      confidence: pattern.severity,
      description: `Emotional grooming pattern with ${pattern.tactics.length} tactics and ${pattern.monetizationLinked ? 'direct' : 'no'} monetization linkage`
    }],
    investigationNotes: [],
    metadata: {
      patternId: pattern.patternId,
      tacticsUsed: pattern.tactics.length,
      blocked: pattern.blocked
    }
  });

  return caseId;
}

export async function blockRomanceMonetization(
  userId: string,
  targetUserId: string
): Promise<void> {
  await db.collection("blocked_monetization_pairs").add({
    userId,
    targetUserId,
    blockedAt: Timestamp.now(),
    reason: "romance_monetization_detected",
    blockType: "permanent",
    canAppeal: true
  });

  await db.collection("users").doc(userId).update({
    [`blockedMonetization.${targetUserId}`]: true
  });

  const conversationsSnapshot = await db.collection("conversations")
    .where("participantIds", "array-contains", userId)
    .get();

  for (const doc of conversationsSnapshot.docs) {
    const data = doc.data();
    if (data.participantIds && data.participantIds.includes(targetUserId)) {
      await doc.ref.update({
        monetizationBlocked: true,
        monetizationBlockedAt: Timestamp.now(),
        monetizationBlockedReason: "romance_monetization_detected"
      });
    }
  }
}

export async function checkRomanceMonetizationAttempt(
  senderId: string,
  recipientId: string,
  messageContent: string,
  hasPaymentIntent: boolean
): Promise<{blocked: boolean; reason?: string}> {
  const romanticKeywords = [
    "love", "baby", "darling", "sweetheart", "honey", "babe",
    "kiss", "hug", "miss you", "adore", "romantic", "date"
  ];

  const monetizationKeywords = [
    "tip", "pay", "buy", "purchase", "subscribe", "donate",
    "support", "token", "credit", "unlock", "premium"
  ];

  const lowerContent = messageContent.toLowerCase();
  
  const hasRomanticLanguage = romanticKeywords.some(word => lowerContent.includes(word));
  const hasMonetizationLanguage = monetizationKeywords.some(word => lowerContent.includes(word));

  if (!hasRomanticLanguage || !hasMonetizationLanguage) {
    if (hasPaymentIntent) {
      return { blocked: false };
    }
    return { blocked: false };
  }

  const blockCheckSnapshot = await db.collection("blocked_monetization_pairs")
    .where("userId", "in", [senderId, recipientId])
    .where("targetUserId", "in", [senderId, recipientId])
    .get();

  if (!blockCheckSnapshot.empty) {
    return { 
      blocked: true, 
      reason: "Romance monetization is not permitted on this platform" 
    };
  }

  const patternSnapshot = await db.collection(EMOTIONAL_GROOMING_PATTERNS_COLLECTION)
    .where("groomerId", "==", senderId)
    .where("victimId", "==", recipientId)
    .where("blocked", "==", true)
    .get();

  if (!patternSnapshot.empty) {
    return { 
      blocked: true, 
      reason: "This interaction has been blocked due to detected grooming patterns" 
    };
  }

  const profileRef = db.collection("wealth_protection_profiles").doc(recipientId);
  const profile = await profileRef.get();

  if (profile.exists) {
    const data = profile.data();
    if (data?.protectionSettings?.autoRejectRomanticMonetization) {
      await blockRomanceMonetization(recipientId, senderId);
      
      return { 
        blocked: true, 
        reason: "Recipient has enabled automatic rejection of romantic monetization" 
      };
    }
  }

  if (hasRomanticLanguage && hasMonetizationLanguage) {
    await applyWealthProtection(
      recipientId,
      senderId,
      ProtectionPhase.PHASE_1_SOFT_FILTER,
      {
        reason: "Potential romance monetization detected",
        messageContent: messageContent.substring(0, 100),
        hasRomanticLanguage,
        hasMonetizationLanguage
      }
    );
  }

  return { blocked: false };
}

export async function scanConversationHistory(
  userId: string,
  daysBack: number = 30
): Promise<{suspiciousConversations: string[]; totalRisk: number}> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const conversationsSnapshot = await db.collection("conversations")
    .where("participantIds", "array-contains", userId)
    .where("lastMessageAt", ">", Timestamp.fromDate(since))
    .get();

  const suspicious: string[] = [];
  let totalRisk = 0;

  for (const doc of conversationsSnapshot.docs) {
    const analysis = await analyzeConversationForGrooming(doc.id);
    
    if (analysis.risk > 0.5) {
      suspicious.push(doc.id);
      totalRisk += analysis.risk;
    }
  }

  return {
    suspiciousConversations: suspicious,
    totalRisk: suspicious.length > 0 ? totalRisk / suspicious.length : 0
  };
}