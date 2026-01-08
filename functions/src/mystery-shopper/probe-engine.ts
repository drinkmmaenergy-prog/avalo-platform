/**
 * PACK 156: Mystery Shopper Probe Engine
 * Automated decoy account probing system
 */

import { db, serverTimestamp, increment } from '../init';
import {
  MysteryShopperProfile,
  ProbeScenario,
  ProbeResult,
  ComplianceCase,
  DecoyUserType,
  ProbeType,
  ViolationSeverity,
  PROBE_SCENARIOS
} from '../types/mystery-shopper.types';
import { logComplianceIncident } from './compliance-cases';

const COLLECTIONS = {
  MYSTERY_SHOPPERS: 'mystery_shopper_profiles',
  PROBE_RESULTS: 'probe_results',
  COMPLIANCE_CASES: 'compliance_cases'
};

export async function createMysteryShopperProfile(
  decoyType: DecoyUserType,
  metadata?: MysteryShopperProfile['metadata']
): Promise<MysteryShopperProfile> {
  const profile: MysteryShopperProfile = {
    id: db.collection(COLLECTIONS.MYSTERY_SHOPPERS).doc().id,
    decoyType,
    displayName: generateDecoyName(decoyType),
    avatarUrl: generateDecoyAvatar(decoyType),
    bio: generateDecoyBio(decoyType),
    metadata: metadata || {},
    isActive: true,
    totalProbesCompleted: 0,
    violationsDetected: 0,
    createdAt: new Date(),
    lastActiveAt: new Date()
  };

  await db.collection(COLLECTIONS.MYSTERY_SHOPPERS).doc(profile.id).set({
    ...profile,
    createdAt: serverTimestamp(),
    lastActiveAt: serverTimestamp()
  });

  return profile;
}

export async function getMysteryShopperProfile(
  shopperProfileId: string
): Promise<MysteryShopperProfile | null> {
  const doc = await db
    .collection(COLLECTIONS.MYSTERY_SHOPPERS)
    .doc(shopperProfileId)
    .get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  return {
    ...data,
    createdAt: data?.createdAt?.toDate(),
    lastActiveAt: data?.lastActiveAt?.toDate()
  } as MysteryShopperProfile;
}

export async function getActiveShoppers(
  decoyType?: DecoyUserType
): Promise<MysteryShopperProfile[]> {
  let query = db
    .collection(COLLECTIONS.MYSTERY_SHOPPERS)
    .where('isActive', '==', true);

  if (decoyType) {
    query = query.where('decoyType', '==', decoyType);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      ...data,
      createdAt: data.createdAt?.toDate(),
      lastActiveAt: data.lastActiveAt?.toDate()
    } as MysteryShopperProfile;
  });
}

export async function runMysteryShopperProbe(params: {
  shopperProfileId: string;
  targetUserId: string;
  probeType: ProbeType;
  customScenario?: Partial<ProbeScenario>;
}): Promise<ProbeResult> {
  const { shopperProfileId, targetUserId, probeType, customScenario } = params;

  const shopper = await getMysteryShopperProfile(shopperProfileId);
  if (!shopper) {
    throw new Error('Mystery shopper profile not found');
  }

  if (!shopper.isActive) {
    throw new Error('Mystery shopper profile is not active');
  }

  const scenario =
    customScenario ||
    PROBE_SCENARIOS.find(
      s => s.probeType === probeType && s.targetDecoyType === shopper.decoyType
    );

  if (!scenario) {
    throw new Error(
      `No probe scenario found for type ${probeType} and decoy ${shopper.decoyType}`
    );
  }

  const result: ProbeResult = {
    shopperProfileId,
    targetUserId,
    probeType,
    violationDetected: false,
    timestamp: new Date()
  };

  await db.collection(COLLECTIONS.PROBE_RESULTS).add({
    ...result,
    scenarioId: scenario.id,
    timestamp: serverTimestamp()
  });

  await db
    .collection(COLLECTIONS.MYSTERY_SHOPPERS)
    .doc(shopperProfileId)
    .update({
      totalProbesCompleted: increment(1),
      lastActiveAt: serverTimestamp()
    });

  return result;
}

export async function detectViolationInResponse(params: {
  probeResult: ProbeResult;
  userResponse: string;
  scenario: ProbeScenario;
  chatHistory?: Array<{ content: string; sender: string; timestamp: Date }>;
}): Promise<{ violated: boolean; severity?: ViolationSeverity; evidence?: any }> {
  const { probeResult, userResponse, scenario, chatHistory } = params;

  const lowerResponse = userResponse.toLowerCase();
  const detectedRedFlags = scenario.expectedRedFlags.filter(flag =>
    lowerResponse.includes(flag.toLowerCase())
  );

  if (detectedRedFlags.length === 0) {
    return { violated: false };
  }

  const contextualChecks = performContextualChecks(
    userResponse,
    scenario.probeType,
    chatHistory
  );

  if (!contextualChecks.isActualViolation) {
    return { violated: false };
  }

  const evidence = {
    chatSnapshots: chatHistory?.map(msg => ({
      messageId: `msg_${Date.now()}_${Math.random()}`,
      content: msg.content,
      timestamp: msg.timestamp,
      sender: msg.sender
    })),
    detectedRedFlags,
    contextNotes: contextualChecks.notes
  };

  await db
    .collection(COLLECTIONS.MYSTERY_SHOPPERS)
    .doc(probeResult.shopperProfileId)
    .update({
      violationsDetected: increment(1)
    });

  await logComplianceIncident({
    targetUserId: probeResult.targetUserId,
    shopperProfileId: probeResult.shopperProfileId,
    probeType: probeResult.probeType,
    severity: scenario.severity,
    evidence,
    reasonCode: generateReasonCode(scenario.probeType, detectedRedFlags)
  });

  return {
    violated: true,
    severity: scenario.severity,
    evidence
  };
}

export async function scheduleRandomProbe(params: {
  targetUserId: string;
  probeTypes?: ProbeType[];
}): Promise<void> {
  const { targetUserId, probeTypes } = params;

  const availableScenarios = probeTypes
    ? PROBE_SCENARIOS.filter(s => probeTypes.includes(s.probeType))
    : PROBE_SCENARIOS;

  if (availableScenarios.length === 0) {
    return;
  }

  const scenario =
    availableScenarios[Math.floor(Math.random() * availableScenarios.length)];

  const shoppers = await getActiveShoppers(scenario.targetDecoyType);
  if (shoppers.length === 0) {
    console.warn(
      `No active shoppers available for decoy type: ${scenario.targetDecoyType}`
    );
    return;
  }

  const randomShopper = shoppers[Math.floor(Math.random() * shoppers.length)];

  await runMysteryShopperProbe({
    shopperProfileId: randomShopper.id,
    targetUserId,
    probeType: scenario.probeType
  });
}

function performContextualChecks(
  response: string,
  probeType: ProbeType,
  chatHistory?: Array<{ content: string; sender: string; timestamp: Date }>
): { isActualViolation: boolean; notes: string } {
  const lower = response.toLowerCase();

  if (probeType === 'external_contact') {
    const hasExternalPlatform =
      lower.includes('whatsapp') ||
      lower.includes('telegram') ||
      lower.includes('snapchat') ||
      lower.includes('instagram dm');

    const hasPaymentImplication =
      lower.includes('pay') ||
      lower.includes('token') ||
      lower.includes('exclusive') ||
      lower.includes('private');

    if (hasExternalPlatform && hasPaymentImplication) {
      return {
        isActualViolation: true,
        notes: 'External contact solicitation with payment implication'
      };
    }

    if (hasExternalPlatform) {
      return {
        isActualViolation: true,
        notes: 'External contact solicitation detected'
      };
    }
  }

  if (probeType === 'romantic_monetization') {
    const hasRomanticLanguage =
      lower.includes('love') ||
      lower.includes('relationship') ||
      lower.includes('special') ||
      lower.includes('exclusive');

    const hasPaymentTie =
      lower.includes('pay') ||
      lower.includes('token') ||
      lower.includes('spend') ||
      lower.includes('more');

    if (hasRomanticLanguage && hasPaymentTie) {
      return {
        isActualViolation: true,
        notes: 'Romantic language directly tied to payment'
      };
    }
  }

  if (probeType === 'escort_dynamics') {
    const hasInPersonMeeting =
      lower.includes('meet') ||
      lower.includes('in person') ||
      lower.includes('offline');

    const hasPaymentForTime =
      lower.includes('rate') ||
      lower.includes('price') ||
      lower.includes('cost') ||
      lower.includes('pay for');

    if (hasInPersonMeeting && hasPaymentForTime) {
      return {
        isActualViolation: true,
        notes: 'In-person meeting with payment structure detected'
      };
    }
  }

  if (probeType === 'nsfw_solicitation') {
    const hasExplicitContent =
      lower.includes('photo') ||
      lower.includes('video') ||
      lower.includes('content') ||
      lower.includes('picture');

    const hasSexualImplication =
      lower.includes('private') ||
      lower.includes('exclusive') ||
      lower.includes('special') ||
      lower.includes('adult');

    const hasPaymentTie =
      lower.includes('token') || lower.includes('pay') || lower.includes('buy');

    if (hasExplicitContent && hasSexualImplication && hasPaymentTie) {
      return {
        isActualViolation: true,
        notes: 'NSFW content solicitation with payment detected'
      };
    }
  }

  return {
    isActualViolation: false,
    notes: 'No clear violation pattern detected'
  };
}

function generateReasonCode(
  probeType: ProbeType,
  detectedFlags: string[]
): string {
  const flagStr = detectedFlags.join('_').toUpperCase().substring(0, 3);

  const codeMapping: Record<ProbeType, string> = {
    external_contact: 'EXT_001',
    romantic_monetization: 'ROM_001',
    escort_dynamics: 'ESC_001',
    nsfw_solicitation: 'SEX_002',
    refund_fraud: 'FRD_001',
    visibility_bartering: 'VIS_001'
  };

  return codeMapping[probeType] || 'MIS_001';
}

function generateDecoyName(decoyType: DecoyUserType): string {
  const namePatterns: Record<DecoyUserType, string[]> = {
    new_user: ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey'],
    high_spender: ['Marcus', 'Victoria', 'Sebastian', 'Isabella', 'Alexander'],
    beginner_creator: ['Emma', 'Liam', 'Sophia', 'Noah', 'Olivia'],
    event_attendee: ['James', 'Emily', 'Michael', 'Sarah', 'David'],
    digital_product_customer: ['Chris', 'Sam', 'Pat', 'Jamie', 'Drew']
  };

  const names = namePatterns[decoyType];
  return names[Math.floor(Math.random() * names.length)];
}

function generateDecoyAvatar(decoyType: DecoyUserType): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${decoyType}_${Date.now()}`;
}

function generateDecoyBio(decoyType: DecoyUserType): string {
  const bioPatterns: Record<DecoyUserType, string> = {
    new_user: 'New to this platform! Excited to explore and connect.',
    high_spender: 'Looking for quality content and meaningful connections.',
    beginner_creator: 'Just starting my creator journey. Learning as I go!',
    event_attendee: 'Love attending events and meeting new people.',
    digital_product_customer: 'Always interested in learning new skills.'
  };

  return bioPatterns[decoyType];
}

export async function deactivateShopperProfile(
  shopperProfileId: string
): Promise<void> {
  await db.collection(COLLECTIONS.MYSTERY_SHOPPERS).doc(shopperProfileId).update({
    isActive: false
  });
}

export async function getProbeStatistics(
  shopperProfileId: string
): Promise<{
  totalProbes: number;
  violationsDetected: number;
  detectionRate: number;
}> {
  const shopper = await getMysteryShopperProfile(shopperProfileId);
  if (!shopper) {
    throw new Error('Shopper profile not found');
  }

  const detectionRate =
    shopper.totalProbesCompleted > 0
      ? shopper.violationsDetected / shopper.totalProbesCompleted
      : 0;

  return {
    totalProbes: shopper.totalProbesCompleted,
    violationsDetected: shopper.violationsDetected,
    detectionRate
  };
}