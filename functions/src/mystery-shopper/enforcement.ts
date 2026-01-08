/**
 * PACK 156: Enforcement & Penalty System
 * Feature freezes, account bans, and penalty management
 */

import { db, serverTimestamp } from '../init';
import {
  AuditAction,
  ComplianceAction,
  ViolationSeverity,
  FeatureAccessType,
  SEVERITY_DEFINITIONS
} from '../types/mystery-shopper.types';
import { updateCaseStatus } from './compliance-cases';

const COLLECTIONS = {
  AUDIT_ACTIONS: 'audit_actions',
  USERS: 'users',
  DEVICE_BANS: 'device_bans',
  IP_BANS: 'ip_bans'
};

const EDUCATION_MODULES = {
  ROM_001: 'Appropriate Communication Guidelines',
  ROM_002: 'Platform Monetization Rules',
  ROM_003: 'Healthy Relationships vs Exploitation',
  EXT_001: 'Privacy and Security Best Practices',
  SEX_001: 'Community Standards and NSFW Policy',
  FRD_001: 'Payment and Refund Policies',
  VIS_001: 'Authentic Growth Guidelines'
};

export async function applyCompliancePenalty(params: {
  caseId: string;
  targetUserId: string;
  severity: ViolationSeverity;
  reason: string;
  reasonCode: string;
  appliedBy: string;
  frozenFeatures?: FeatureAccessType[];
  metadata?: {
    deviceIds?: string[];
    ipAddresses?: string[];
    relatedCases?: string[];
  };
}): Promise<string> {
  const {
    caseId,
    targetUserId,
    severity,
    reason,
    reasonCode,
    appliedBy,
    frozenFeatures,
    metadata
  } = params;

  const severityDef = SEVERITY_DEFINITIONS[severity];
  const actionType = severityDef.action;

  const appealDeadline = new Date();
  appealDeadline.setDate(appealDeadline.getDate() + 14);

  let expiresAt: Date | undefined;
  if (actionType === 'feature_freeze') {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
  } else if (actionType === 'warning') {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
  }

  const educationRequirements = getEducationRequirements(reasonCode);

  const action: Omit<AuditAction, 'id'> = {
    caseId,
    targetUserId,
    actionType,
    reason,
    reasonCode,
    severity,
    frozenFeatures: frozenFeatures || [],
    educationRequirements,
    appealDeadline,
    appliedBy,
    appliedAt: new Date(),
    expiresAt,
    metadata
  };

  const actionRef = await db.collection(COLLECTIONS.AUDIT_ACTIONS).add({
    ...action,
    appliedAt: serverTimestamp()
  });

  await enforceAction(targetUserId, actionType, {
    frozenFeatures,
    deviceIds: metadata?.deviceIds,
    ipAddresses: metadata?.ipAddresses
  });

  await updateCaseStatus(caseId, 'resolved', `Action applied: ${actionType}`);

  return actionRef.id;
}

export async function freezeFeatureAccess(
  userId: string,
  features: FeatureAccessType[],
  expiresAt?: Date
): Promise<void> {
  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);

  const frozenFeatures: Record<string, any> = {};
  features.forEach(feature => {
    frozenFeatures[`featureAccess.${feature}`] = {
      frozen: true,
      frozenAt: serverTimestamp(),
      expiresAt: expiresAt || null
    };
  });

  await userRef.update(frozenFeatures);
}

export async function unfreezeFeatureAccess(
  userId: string,
  features: FeatureAccessType[]
): Promise<void> {
  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);

  const unfrozenFeatures: Record<string, any> = {};
  features.forEach(feature => {
    unfrozenFeatures[`featureAccess.${feature}`] = {
      frozen: false,
      unfrozenAt: serverTimestamp()
    };
  });

  await userRef.update(unfrozenFeatures);
}

export async function banAccountAndDevices(params: {
  userId: string;
  reason: string;
  deviceIds?: string[];
  ipAddresses?: string[];
  permanent?: boolean;
}): Promise<void> {
  const { userId, reason, deviceIds, ipAddresses, permanent } = params;

  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
  
  const banExpiry = permanent ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await userRef.update({
    'accountStatus.banned': true,
    'accountStatus.banReason': reason,
    'accountStatus.bannedAt': serverTimestamp(),
    'accountStatus.banExpiry': banExpiry,
    'accountStatus.permanent': permanent || false
  });

  if (deviceIds && deviceIds.length > 0) {
    const batch = db.batch();
    deviceIds.forEach(deviceId => {
      const deviceBanRef = db.collection(COLLECTIONS.DEVICE_BANS).doc(deviceId);
      batch.set(deviceBanRef, {
        deviceId,
        userId,
        reason,
        bannedAt: serverTimestamp(),
        expiresAt: banExpiry
      });
    });
    await batch.commit();
  }

  if (ipAddresses && ipAddresses.length > 0) {
    const batch = db.batch();
    ipAddresses.forEach(ip => {
      const ipBanRef = db.collection(COLLECTIONS.IP_BANS).doc(ip);
      batch.set(ipBanRef, {
        ipAddress: ip,
        userId,
        reason,
        bannedAt: serverTimestamp(),
        expiresAt: banExpiry
      });
    });
    await batch.commit();
  }
}

export async function unbanAccount(userId: string, unbannedBy: string): Promise<void> {
  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);

  await userRef.update({
    'accountStatus.banned': false,
    'accountStatus.unbannedAt': serverTimestamp(),
    'accountStatus.unbannedBy': unbannedBy
  });
}

export async function issueWarning(params: {
  userId: string;
  reason: string;
  reasonCode: string;
  severity: ViolationSeverity;
}): Promise<void> {
  const { userId, reason, reasonCode, severity } = params;

  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
  const userDoc = await userRef.get();
  const userData = userDoc.data();

  const warnings = userData?.complianceWarnings || [];
  warnings.push({
    reason,
    reasonCode,
    severity,
    issuedAt: new Date(),
    acknowledged: false
  });

  await userRef.update({
    complianceWarnings: warnings,
    'complianceStatus.totalWarnings': warnings.length,
    'complianceStatus.lastWarningAt': serverTimestamp()
  });
}

export async function requireEducation(
  userId: string,
  educationModules: string[]
): Promise<void> {
  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);

  await userRef.update({
    'complianceEducation.required': educationModules,
    'complianceEducation.requiredAt': serverTimestamp(),
    'complianceEducation.completed': []
  });
}

export async function markEducationComplete(
  userId: string,
  moduleId: string
): Promise<boolean> {
  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
  const userDoc = await userRef.get();
  const userData = userDoc.data();

  const required = userData?.complianceEducation?.required || [];
  const completed = userData?.complianceEducation?.completed || [];

  if (!required.includes(moduleId)) {
    throw new Error('Module not required');
  }

  if (completed.includes(moduleId)) {
    return true;
  }

  completed.push(moduleId);

  await userRef.update({
    'complianceEducation.completed': completed,
    [`complianceEducation.completedAt.${moduleId}`]: serverTimestamp()
  });

  const allComplete = required.every((mod: string) => completed.includes(mod));

  if (allComplete) {
    await userRef.update({
      'complianceEducation.allComplete': true,
      'complianceEducation.allCompletedAt': serverTimestamp()
    });

    await checkAndUnfreezeAccount(userId);
  }

  return allComplete;
}

export async function getActiveActions(userId: string): Promise<AuditAction[]> {
  const now = new Date();
  
  const snapshot = await db
    .collection(COLLECTIONS.AUDIT_ACTIONS)
    .where('targetUserId', '==', userId)
    .where('expiresAt', '>', now)
    .orderBy('expiresAt', 'asc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      appliedAt: data.appliedAt?.toDate(),
      expiresAt: data?.expiresAt?.toDate(),
      appealDeadline: data?.appealDeadline?.toDate()
    } as AuditAction;
  });
}

export async function getPermanentActions(userId: string): Promise<AuditAction[]> {
  const snapshot = await db
    .collection(COLLECTIONS.AUDIT_ACTIONS)
    .where('targetUserId', '==', userId)
    .where('actionType', '==', 'account_ban')
    .orderBy('appliedAt', 'desc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      appliedAt: data.appliedAt?.toDate(),
      expiresAt: data?.expiresAt?.toDate(),
      appealDeadline: data?.appealDeadline?.toDate()
    } as AuditAction;
  });
}

export async function isFeatureAccessible(
  userId: string,
  feature: FeatureAccessType
): Promise<{ accessible: boolean; reason?: string }> {
  const userDoc = await db.collection(COLLECTIONS.USERS).doc(userId).get();
  
  if (!userDoc.exists) {
    return { accessible: false, reason: 'User not found' };
  }

  const userData = userDoc.data();

  if (userData?.accountStatus?.banned) {
    return { accessible: false, reason: 'Account banned' };
  }

  const featureAccess = userData?.featureAccess?.[feature];
  
  if (featureAccess?.frozen) {
    const expiresAt = featureAccess.expiresAt?.toDate();
    if (!expiresAt || expiresAt > new Date()) {
      return { accessible: false, reason: 'Feature access frozen' };
    }
  }

  return { accessible: true };
}

export async function checkAndUnfreezeAccount(userId: string): Promise<void> {
  const userDoc = await db.collection(COLLECTIONS.USERS).doc(userId).get();
  const userData = userDoc.data();

  const educationComplete = userData?.complianceEducation?.allComplete || false;

  if (!educationComplete) {
    return;
  }

  const frozenFeatures = userData?.featureAccess || {};
  const featuresToUnfreeze: FeatureAccessType[] = [];

  Object.entries(frozenFeatures).forEach(([feature, access]: [string, any]) => {
    if (access?.frozen) {
      featuresToUnfreeze.push(feature as FeatureAccessType);
    }
  });

  if (featuresToUnfreeze.length > 0) {
    await unfreezeFeatureAccess(userId, featuresToUnfreeze);
  }
}

export async function cleanupExpiredActions(): Promise<number> {
  const now = new Date();
  
  const snapshot = await db
    .collection(COLLECTIONS.AUDIT_ACTIONS)
    .where('expiresAt', '<', now)
    .get();

  const batch = db.batch();
  const userUpdates: Map<string, FeatureAccessType[]> = new Map();

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    
    if (data.actionType === 'feature_freeze' && data.frozenFeatures) {
      const features = userUpdates.get(data.targetUserId) || [];
      features.push(...data.frozenFeatures);
      userUpdates.set(data.targetUserId, features);
    }
    
    batch.update(doc.ref, {
      expired: true,
      expiredAt: serverTimestamp()
    });
  });

  await batch.commit();

  await Promise.all(
    Array.from(userUpdates.entries()).map(([userId, features]) =>
      unfreezeFeatureAccess(userId, features)
    )
  );

  return snapshot.size;
}

function getEducationRequirements(reasonCode: string): string[] {
  const modules: string[] = [];

  if (reasonCode.startsWith('ROM_')) {
    modules.push('Appropriate Communication Guidelines');
    modules.push('Platform Monetization Rules');
  }

  if (reasonCode.startsWith('SEX_')) {
    modules.push('Community Standards and NSFW Policy');
  }

  if (reasonCode.startsWith('EXT_')) {
    modules.push('Privacy and Security Best Practices');
  }

  if (reasonCode.startsWith('FRD_')) {
    modules.push('Payment and Refund Policies');
  }

  if (reasonCode.startsWith('VIS_')) {
    modules.push('Authentic Growth Guidelines');
  }

  return modules;
}

async function enforceAction(
  userId: string,
  actionType: ComplianceAction,
  options: {
    frozenFeatures?: FeatureAccessType[];
    deviceIds?: string[];
    ipAddresses?: string[];
  }
): Promise<void> {
  switch (actionType) {
    case 'account_ban':
      await banAccountAndDevices({
        userId,
        reason: 'Critical policy violation',
        deviceIds: options.deviceIds,
        ipAddresses: options.ipAddresses,
        permanent: false
      });
      break;

    case 'feature_freeze':
      if (options.frozenFeatures && options.frozenFeatures.length > 0) {
        await freezeFeatureAccess(userId, options.frozenFeatures);
      }
      break;

    case 'warning':
      break;

    case 'education_required':
      break;

    case 'no_violation':
      break;

    default:
      console.warn(`Unknown action type: ${actionType}`);
  }
}