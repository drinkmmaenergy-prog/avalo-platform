import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  ViolationType,
  EventType,
  PressureType,
  RestrictionType,
  SeverityLevel,
  CreatorIndependenceCase,
  FanEntitlementEvent,
  EmotionalPressureLog,
  CreatorBoundarySettings,
  FanRestrictionRecord,
  EntitlementDetectionPattern,
  DetectionResult,
  BoundaryViolationContext,
  IndependenceEnforcementResult,
  IndependenceMeasure,
  CreatorIndependenceStats,
  FanBehaviorProfile,
  IndependenceSystemConfig
} from '../types/pack181-independence.types';

const db = getFirestore();

const ENTITLEMENT_PATTERNS: EntitlementDetectionPattern[] = [
  {
    pattern: /you owe me|i deserve|i paid|i spent|i supported/i,
    type: 'emotional_debt',
    severity: 'high',
    weight: 0.8
  },
  {
    pattern: /you('re| are) mine|you belong to me|my (creator|girl|boy)/i,
    type: 'ownership_claim',
    severity: 'critical',
    weight: 0.95
  },
  {
    pattern: /you (must|should|have to) (reply|answer|respond)|why (aren't|didn't) you (replying|responding)/i,
    type: 'access_demand',
    severity: 'medium',
    weight: 0.7
  },
  {
    pattern: /stop talking to|don't (talk to|message) (other|them)|i('ll| will) stop (paying|supporting)/i,
    type: 'control_attempt',
    severity: 'high',
    weight: 0.85
  },
  {
    pattern: /(answer|reply to) me (first|before)|you should prioritize me/i,
    type: 'time_demand',
    severity: 'medium',
    weight: 0.65
  },
  {
    pattern: /i('ll| will) (pay|spend) more if|if you (act like|be my)|exclusive (relationship|attention)/i,
    type: 'financial_leverage',
    severity: 'critical',
    weight: 0.9
  },
  {
    pattern: /after (all|everything) i('ve| have) done|i supported you when|don't forget (who|what i)/i,
    type: 'guilt_trip',
    severity: 'high',
    weight: 0.75
  },
  {
    pattern: /who (is|are) you talking to|i('m| am) jealous|why (them|him|her) and not me/i,
    type: 'jealousy_display',
    severity: 'medium',
    weight: 0.6
  },
  {
    pattern: /i('ve been| have been) watching|i know (when|where) you|tracking your (time|status)/i,
    type: 'tracking_behavior',
    severity: 'high',
    weight: 0.8
  }
];

const DEFAULT_CONFIG: IndependenceSystemConfig = {
  enabled: true,
  autoDetectionEnabled: true,
  autoBanEnabled: false,
  detectionSensitivity: 'medium',
  cooldownDurations: {
    low: 3600000,
    medium: 21600000,
    high: 86400000,
    critical: 259200000
  },
  banThresholds: {
    violationCount: 3,
    timeWindowHours: 168,
    severityWeight: {
      low: 1,
      medium: 2,
      high: 3,
      critical: 5
    }
  },
  patterns: ENTITLEMENT_PATTERNS
};

export async function detectFanEntitlement(
  context: BoundaryViolationContext
): Promise<DetectionResult> {
  const { messageContent, chatHistory, previousViolations } = context;
  
  const detections: Array<{
    type: EventType;
    severity: SeverityLevel;
    confidence: number;
    pattern: string;
  }> = [];

  for (const patternConfig of ENTITLEMENT_PATTERNS) {
    if (patternConfig.pattern.test(messageContent)) {
      detections.push({
        type: patternConfig.type,
        severity: patternConfig.severity,
        confidence: patternConfig.weight,
        pattern: patternConfig.pattern.source
      });
    }
  }

  if (chatHistory && chatHistory.length > 0) {
    const recentMessages = chatHistory.slice(-5);
    const repetitivePatterns = checkRepetitivePatterns(recentMessages);
    if (repetitivePatterns.detected) {
      detections.push({
        type: 'access_demand',
        severity: 'high',
        confidence: 0.85,
        pattern: 'repetitive_demands'
      });
    }
  }

  if (previousViolations && previousViolations.length > 0) {
    const recentViolations = previousViolations.filter(
      v => v.timestamp.toMillis() > Date.now() - 7 * 24 * 60 * 60 * 1000
    );
    
    if (recentViolations.length >= 2) {
      const highestSeverity = detections.length > 0 
        ? detections[0].severity 
        : 'medium';
      
      detections.push({
        type: 'tracking_behavior',
        severity: escalateSeverity(highestSeverity),
        confidence: 0.9,
        pattern: 'repeat_offender'
      });
    }
  }

  if (detections.length === 0) {
    return {
      detected: false,
      confidence: 0,
      patterns: [],
      triggers: []
    };
  }

  detections.sort((a, b) => b.confidence - a.confidence);
  const topDetection = detections[0];

  const recommendedAction = determineRecommendedAction(
    topDetection.severity,
    previousViolations?.length || 0
  );

  return {
    detected: true,
    eventType: topDetection.type,
    severity: topDetection.severity,
    confidence: topDetection.confidence,
    patterns: detections.map(d => d.pattern),
    triggers: detections.map(d => d.type),
    recommendedAction
  };
}

function checkRepetitivePatterns(messages: Array<{ content: string; timestamp: Timestamp; senderId: string }>): {
  detected: boolean;
  pattern?: string;
} {
  const timeWindow = 3600000;
  const similarityThreshold = 0.7;
  
  for (let i = 0; i < messages.length - 1; i++) {
    const msg1 = messages[i];
    const msg2 = messages[i + 1];
    
    if (msg1.senderId === msg2.senderId) {
      const timeDiff = msg2.timestamp.toMillis() - msg1.timestamp.toMillis();
      
      if (timeDiff < timeWindow) {
        const similarity = calculateSimilarity(msg1.content, msg2.content);
        
        if (similarity > similarityThreshold) {
          return {
            detected: true,
            pattern: 'repetitive_messaging'
          };
        }
      }
    }
  }
  
  return { detected: false };
}

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  
  const commonWords = words1.filter(word => words2.includes(word));
  return commonWords.length / Math.max(words1.length, words2.length);
}

function escalateSeverity(current: SeverityLevel): SeverityLevel {
  const hierarchy: SeverityLevel[] = ['low', 'medium', 'high', 'critical'];
  const currentIndex = hierarchy.indexOf(current);
  return currentIndex < hierarchy.length - 1 ? hierarchy[currentIndex + 1] : 'critical';
}

function determineRecommendedAction(
  severity: SeverityLevel,
  violationCount: number
): IndependenceMeasure {
  if (violationCount >= 3) {
    return {
      type: 'ban',
      reason: 'Multiple creator independence violations',
      severity: 'critical'
    };
  }

  switch (severity) {
    case 'low':
      return {
        type: 'warning',
        reason: 'Minor entitlement behavior detected',
        severity: 'low'
      };
    case 'medium':
      return {
        type: 'cooldown',
        duration: DEFAULT_CONFIG.cooldownDurations.medium,
        reason: 'Moderate entitlement behavior',
        severity: 'medium'
      };
    case 'high':
      return {
        type: 'block',
        duration: DEFAULT_CONFIG.cooldownDurations.high,
        reason: 'Serious entitlement violation',
        severity: 'high'
      };
    case 'critical':
      return {
        type: 'freeze',
        duration: DEFAULT_CONFIG.cooldownDurations.critical,
        reason: 'Critical creator independence violation',
        severity: 'critical'
      };
  }
}

export async function applyCreatorIndependenceMeasures(
  fanId: string,
  creatorId: string,
  measure: IndependenceMeasure,
  detectionResult: DetectionResult
): Promise<IndependenceEnforcementResult> {
  const batch = db.batch();

  try {
    const caseRef = db.collection('creator_independence_cases').doc();
    const caseData: CreatorIndependenceCase = {
      caseId: caseRef.id,
      creatorId,
      fanId,
      violationType: mapEventToViolation(detectionResult.eventType!),
      evidence: {
        description: `Auto-detected ${detectionResult.eventType}`,
        context: `Confidence: ${detectionResult.confidence}`
      },
      status: 'pending',
      severity: detectionResult.severity!,
      timestamp: Timestamp.now(),
      reporterId: 'system',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    batch.set(caseRef, caseData);

    const eventRef = db.collection('fan_entitlement_events').doc();
    const eventData: FanEntitlementEvent = {
      eventId: eventRef.id,
      fanId,
      creatorId,
      eventType: detectionResult.eventType!,
      messageContent: '[Auto-detected violation]',
      severity: detectionResult.severity!,
      timestamp: Timestamp.now(),
      autoDetected: true,
      detectionDetails: {
        patterns: detectionResult.patterns,
        confidence: detectionResult.confidence,
        triggers: detectionResult.triggers
      },
      createdAt: Timestamp.now()
    };
    batch.set(eventRef, eventData);

    if (measure.type !== 'warning') {
      const restrictionRef = db.collection('fan_restriction_records').doc();
      const endTime = measure.duration 
        ? Timestamp.fromMillis(Date.now() + measure.duration)
        : null;
      
      const restrictionData: FanRestrictionRecord = {
        recordId: restrictionRef.id,
        fanId,
        creatorId,
        restrictionType: mapMeasureToRestriction(measure.type),
        reason: measure.reason,
        startTime: Timestamp.now(),
        endTime,
        status: 'active',
        issuedBy: 'system',
        metadata: {
          caseId: caseRef.id
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      batch.set(restrictionRef, restrictionData);

      await batch.commit();

      return {
        success: true,
        actionTaken: measure,
        caseId: caseRef.id,
        eventId: eventRef.id,
        restrictionId: restrictionRef.id,
        message: `Applied ${measure.type} for ${measure.severity} violation`
      };
    }

    await batch.commit();

    return {
      success: true,
      actionTaken: measure,
      caseId: caseRef.id,
      eventId: eventRef.id,
      message: 'Warning issued'
    };
  } catch (error) {
    console.error('Error applying independence measures:', error);
    return {
      success: false,
      actionTaken: measure,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

function mapEventToViolation(eventType: EventType): ViolationType {
  const mapping: Record<EventType, ViolationType> = {
    'emotional_debt': 'emotional_debt',
    'ownership_claim': 'ownership_claim',
    'access_demand': 'access_demand',
    'control_attempt': 'control_attempt',
    'time_demand': 'time_demand',
    'financial_leverage': 'financial_leverage',
    'guilt_trip': 'guilt_pressure',
    'jealousy_display': 'jealousy_war',
    'tracking_behavior': 'harassment'
  };
  return mapping[eventType];
}

function mapMeasureToRestriction(measureType: string): RestrictionType {
  const mapping: Record<string, RestrictionType> = {
    'cooldown': 'chat_cooldown',
    'block': 'temporary_block',
    'ban': 'permanent_ban',
    'freeze': 'access_freeze'
  };
  return mapping[measureType] || 'chat_cooldown';
}

export async function enforceCreatorBoundaryTools(
  creatorId: string,
  messageContent: string,
  fanId: string
): Promise<{ blocked: boolean; reason?: string }> {
  const settingsDoc = await db
    .collection('creator_boundary_settings')
    .doc(creatorId)
    .get();

  if (!settingsDoc.exists) {
    return { blocked: false };
  }

  const settings = settingsDoc.data() as CreatorBoundarySettings;

  if (settings.autoBlockGuilt) {
    const guiltPatterns = ENTITLEMENT_PATTERNS.filter(
      p => p.type === 'guilt_trip' || p.type === 'emotional_debt'
    );
    
    for (const pattern of guiltPatterns) {
      if (pattern.pattern.test(messageContent)) {
        await logEmotionalPressure(fanId, creatorId, 'guilt', true);
        return { 
          blocked: true, 
          reason: 'Message blocked by creator boundary settings (guilt/emotional debt detected)' 
        };
      }
    }
  }

  if (settings.autoDeclineRomance) {
    const romancePatterns = [
      /i love you|be my (girlfriend|boyfriend|partner)/i,
      /romantic|relationship|date|kiss/i
    ];
    
    for (const pattern of romancePatterns) {
      if (pattern.test(messageContent)) {
        await logEmotionalPressure(fanId, creatorId, 'exclusivity_request', true);
        return { 
          blocked: true, 
          reason: 'Message blocked by creator boundary settings (romance declined)' 
        };
      }
    }
  }

  if (settings.restrictedKeywords && settings.restrictedKeywords.length > 0) {
    const lowerMessage = messageContent.toLowerCase();
    for (const keyword of settings.restrictedKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return { 
          blocked: true, 
          reason: 'Message contains restricted keyword' 
        };
      }
    }
  }

  return { blocked: false };
}

async function logEmotionalPressure(
  fanId: string,
  creatorId: string,
  pressureType: PressureType,
  blocked: boolean
): Promise<void> {
  const logRef = db.collection('emotional_pressure_logs').doc();
  const logData: EmotionalPressureLog = {
    logId: logRef.id,
    fanId,
    creatorId,
    messageId: 'auto-detected',
    pressureType,
    detected: true,
    blocked,
    timestamp: Timestamp.now(),
    createdAt: Timestamp.now()
  };
  await logRef.set(logData);
}

export async function resolveCreatorIndependenceCase(
  caseId: string,
  resolution: {
    action: string;
    notes: string;
    resolvedBy: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const caseRef = db.collection('creator_independence_cases').doc(caseId);
    await caseRef.update({
      status: 'resolved',
      resolution: {
        ...resolution,
        resolvedAt: Timestamp.now()
      },
      updatedAt: Timestamp.now()
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function getCreatorIndependenceStats(
  creatorId: string,
  days: number = 30
): Promise<CreatorIndependenceStats> {
  const startDate = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const casesSnapshot = await db
    .collection('creator_independence_cases')
    .where('creatorId', '==', creatorId)
    .where('timestamp', '>=', startDate)
    .get();

  const eventsSnapshot = await db
    .collection('fan_entitlement_events')
    .where('creatorId', '==', creatorId)
    .where('timestamp', '>=', startDate)
    .get();

  const logsSnapshot = await db
    .collection('emotional_pressure_logs')
    .where('creatorId', '==', creatorId)
    .where('timestamp', '>=', startDate)
    .get();

  const restrictionsSnapshot = await db
    .collection('fan_restriction_records')
    .where('creatorId', '==', creatorId)
    .where('status', '==', 'active')
    .get();

  const settingsDoc = await db
    .collection('creator_boundary_settings')
    .doc(creatorId)
    .get();

  const casesBySeverity: Record<SeverityLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
  };

  const casesByType: Record<ViolationType, number> = {
    emotional_debt: 0,
    ownership_claim: 0,
    access_demand: 0,
    control_attempt: 0,
    time_demand: 0,
    financial_leverage: 0,
    guilt_pressure: 0,
    jealousy_war: 0,
    harassment: 0
  };

  casesSnapshot.docs.forEach(doc => {
    const data = doc.data() as CreatorIndependenceCase;
    casesBySeverity[data.severity]++;
    casesByType[data.violationType]++;
  });

  const totalBlocked = logsSnapshot.docs.filter(
    doc => (doc.data() as EmotionalPressureLog).blocked
  ).length;

  const activeBoundaries = settingsDoc.exists 
    ? Object.values(settingsDoc.data() as CreatorBoundarySettings).filter(
        v => typeof v === 'boolean' && v
      ).length
    : 0;

  return {
    creatorId,
    totalCases: casesSnapshot.size,
    casesBySeverity,
    casesByType,
    totalEventsDetected: eventsSnapshot.size,
    totalBlocked,
    activeBoundaries,
    restrictedFans: restrictionsSnapshot.size,
    periodStart: startDate,
    periodEnd: Timestamp.now()
  };
}

export async function getFanBehaviorProfile(fanId: string): Promise<FanBehaviorProfile> {
  const casesSnapshot = await db
    .collection('creator_independence_cases')
    .where('fanId', '==', fanId)
    .get();

  const restrictionsSnapshot = await db
    .collection('fan_restriction_records')
    .where('fanId', '==', fanId)
    .where('status', '==', 'active')
    .get();

  const violationsByType: Record<ViolationType, number> = {
    emotional_debt: 0,
    ownership_claim: 0,
    access_demand: 0,
    control_attempt: 0,
    time_demand: 0,
    financial_leverage: 0,
    guilt_pressure: 0,
    jealousy_war: 0,
    harassment: 0
  };

  let lastViolation: Timestamp | undefined;
  const creatorsAffected = new Set<string>();

  casesSnapshot.docs.forEach(doc => {
    const data = doc.data() as CreatorIndependenceCase;
    violationsByType[data.violationType]++;
    creatorsAffected.add(data.creatorId);
    
    if (!lastViolation || data.timestamp.toMillis() > lastViolation.toMillis()) {
      lastViolation = data.timestamp;
    }
  });

  const isPermanentlyBanned = restrictionsSnapshot.docs.some(
    doc => (doc.data() as FanRestrictionRecord).restrictionType === 'permanent_ban'
  );

  const riskScore = calculateRiskScore(
    casesSnapshot.size,
    violationsByType,
    isPermanentlyBanned
  );

  return {
    fanId,
    totalViolations: casesSnapshot.size,
    violationsByType,
    lastViolation,
    activeRestrictions: restrictionsSnapshot.size,
    riskScore,
    isPermanentlyBanned,
    creatorsAffected: Array.from(creatorsAffected)
  };
}

function calculateRiskScore(
  totalViolations: number,
  violationsByType: Record<ViolationType, number>,
  isPermanentlyBanned: boolean
): number {
  if (isPermanentlyBanned) return 100;

  let score = Math.min(totalViolations * 10, 50);

  if (violationsByType.ownership_claim > 0) score += 20;
  if (violationsByType.financial_leverage > 0) score += 15;
  if (violationsByType.harassment > 0) score += 25;

  return Math.min(score, 100);
}

export async function checkActiveRestriction(
  fanId: string,
  creatorId: string
): Promise<{ restricted: boolean; restriction?: FanRestrictionRecord }> {
  const snapshot = await db
    .collection('fan_restriction_records')
    .where('fanId', '==', fanId)
    .where('creatorId', '==', creatorId)
    .where('status', '==', 'active')
    .get();

  if (snapshot.empty) {
    return { restricted: false };
  }

  const restriction = snapshot.docs[0].data() as FanRestrictionRecord;
  
  if (restriction.endTime && restriction.endTime.toMillis() < Date.now()) {
    await db.collection('fan_restriction_records').doc(snapshot.docs[0].id).update({
      status: 'expired',
      updatedAt: Timestamp.now()
    });
    return { restricted: false };
  }

  return { restricted: true, restriction };
}