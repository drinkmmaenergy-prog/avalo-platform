/**
 * PACK 199: Regional Safety Protocols and Enforcement
 * Safety rule enforcement and escalation based on regional requirements
 */

import { db } from '../init';
import {
  RegionCode,
  RegionalRule,
  RegionalSafetyFlag,
  SafetyRule,
} from './types';
import { REGIONAL_RULES } from './regional-rules';
import { Timestamp } from 'firebase-admin/firestore';

export class SafetyProtocolEnforcer {
  async enforceRegionalSafetyProtocols(
    userId: string,
    regionCode: RegionCode,
    content: string,
    contentType: 'message' | 'post' | 'stream' | 'comment'
  ): Promise<{ allowed: boolean; reason?: string; flagged?: boolean }> {
    const rules = REGIONAL_RULES[regionCode];
    
    if (!rules) {
      return { allowed: true };
    }

    for (const safetyRule of rules.safetyRules) {
      const violation = await this.checkSafetyViolation(
        content,
        safetyRule,
        contentType
      );

      if (violation.detected) {
        await this.createSafetyFlag(
          userId,
          regionCode,
          safetyRule,
          violation.severity,
          content,
          contentType
        );

        if (safetyRule.autoEscalate) {
          await this.escalateToAuthorities(
            userId,
            regionCode,
            safetyRule,
            violation
          );
        }

        return {
          allowed: false,
          reason: `Content violates ${safetyRule.category} safety rules for ${regionCode}`,
          flagged: true,
        };
      }
    }

    return { allowed: true };
  }

  private async checkSafetyViolation(
    content: string,
    safetyRule: SafetyRule,
    contentType: string
  ): Promise<{ detected: boolean; severity: 'low' | 'medium' | 'high' | 'critical' }> {
    const contentLower = content.toLowerCase();

    const hasProhibited = safetyRule.terminology.prohibited.some(term =>
      contentLower.includes(term.toLowerCase())
    );

    if (hasProhibited) {
      return { detected: true, severity: 'critical' };
    }

    const hasSensitive = safetyRule.terminology.sensitive.some(term =>
      contentLower.includes(term.toLowerCase())
    );

    if (hasSensitive) {
      return { detected: true, severity: 'high' };
    }

    const hasOffensive = safetyRule.terminology.offensive.some(term =>
      contentLower.includes(term.toLowerCase())
    );

    if (hasOffensive) {
      return { detected: true, severity: 'medium' };
    }

    return { detected: false, severity: 'low' };
  }

  private async createSafetyFlag(
    userId: string,
    regionCode: RegionCode,
    safetyRule: SafetyRule,
    severity: 'low' | 'medium' | 'high' | 'critical',
    content: string,
    contentType: string
  ): Promise<void> {
    const flag: RegionalSafetyFlag = {
      id: db.collection('regional_safety_flags').doc().id,
      userId,
      regionCode,
      flagType: safetyRule.category,
      severity,
      autoResolved: false,
      escalated: safetyRule.autoEscalate,
      createdAt: Timestamp.now(),
      metadata: {
        safetyRuleId: safetyRule.id,
        contentType,
        contentPreview: content.substring(0, 100),
        threshold: safetyRule.threshold,
      },
    };

    await db.collection('regional_safety_flags').doc(flag.id).set(flag);

    await this.updateUserViolationCount(userId, regionCode, safetyRule.category);

    const violationCount = await this.getUserViolationCount(userId, regionCode);
    if (violationCount >= safetyRule.threshold) {
      await this.triggerAutomaticAction(userId, regionCode, safetyRule);
    }
  }

  private async updateUserViolationCount(
    userId: string,
    regionCode: RegionCode,
    category: string
  ): Promise<void> {
    const statsRef = db
      .collection('regional_user_safety_stats')
      .doc(`${userId}_${regionCode}`);

    const statsDoc = await statsRef.get();

    if (statsDoc.exists) {
      const stats = statsDoc.data();
      await statsRef.update({
        [`violations.${category}`]: (stats?.violations?.[category] || 0) + 1,
        lastViolation: Timestamp.now(),
        totalViolations: (stats?.totalViolations || 0) + 1,
      });
    } else {
      await statsRef.set({
        userId,
        regionCode,
        violations: { [category]: 1 },
        lastViolation: Timestamp.now(),
        totalViolations: 1,
        createdAt: Timestamp.now(),
      });
    }
  }

  private async getUserViolationCount(
    userId: string,
    regionCode: RegionCode
  ): Promise<number> {
    const statsRef = db
      .collection('regional_user_safety_stats')
      .doc(`${userId}_${regionCode}`);

    const statsDoc = await statsRef.get();
    
    if (!statsDoc.exists) {
      return 0;
    }

    return statsDoc.data()?.totalViolations || 0;
  }

  private async triggerAutomaticAction(
    userId: string,
    regionCode: RegionCode,
    safetyRule: SafetyRule
  ): Promise<void> {
    await db.collection('regional_automatic_actions').add({
      userId,
      regionCode,
      actionType: 'threshold-exceeded',
      safetyRuleId: safetyRule.id,
      category: safetyRule.category,
      threshold: safetyRule.threshold,
      actionTaken: 'account-review-required',
      timestamp: Timestamp.now(),
    });

    await db.collection('users').doc(userId).update({
      [`regionalFlags.${regionCode}.requiresReview`]: true,
      [`regionalFlags.${regionCode}.reviewReason`]: `Exceeded ${safetyRule.category} threshold`,
      [`regionalFlags.${regionCode}.flaggedAt`]: Timestamp.now(),
    });
  }

  private async escalateToAuthorities(
    userId: string,
    regionCode: RegionCode,
    safetyRule: SafetyRule,
    violation: any
  ): Promise<void> {
    await db.collection('regional_escalations').add({
      userId,
      regionCode,
      safetyRuleId: safetyRule.id,
      category: safetyRule.category,
      severity: violation.severity,
      localAuthorities: safetyRule.localAuthorities.map(auth => ({
        type: auth.type,
        name: auth.name,
        phone: auth.phone,
        notified: false,
      })),
      escalatedAt: Timestamp.now(),
      status: 'pending-review',
    });
  }

  async getRegionalSafetyResources(regionCode: RegionCode): Promise<any[]> {
    const rules = REGIONAL_RULES[regionCode];
    
    if (!rules) {
      return [];
    }

    const resources: any[] = [];

    for (const safetyRule of rules.safetyRules) {
      for (const authority of safetyRule.localAuthorities) {
        resources.push({
          id: `${regionCode}-${authority.type}-${authority.name}`,
          regionCode,
          type: authority.type,
          name: authority.name,
          phone: authority.phone,
          website: authority.website,
          available24x7: authority.available24x7,
          category: safetyRule.category,
        });
      }
    }

    return resources;
  }

  async checkContentModeration(
    userId: string,
    regionCode: RegionCode,
    content: {
      type: 'text' | 'image' | 'video' | 'audio';
      data: any;
      metadata?: Record<string, any>;
    }
  ): Promise<{ approved: boolean; reason?: string }> {
    const rules = REGIONAL_RULES[regionCode];
    
    if (!rules) {
      return { approved: true };
    }

    const contentRule = rules.legalFramework.contentModeration[0];

    if (contentRule.modestyRequired && content.metadata?.revealingContent) {
      return {
        approved: false,
        reason: 'Content does not meet regional modesty requirements',
      };
    }

    if (
      contentRule.defamationSensitivity === 'critical' &&
      content.metadata?.mentionsIndividuals
    ) {
      const hasDefamatory = await this.checkDefamatoryContent(content.data);
      if (hasDefamatory) {
        return {
          approved: false,
          reason: 'Content may contain defamatory statements',
        };
      }
    }

    for (const restriction of contentRule.streamingRestrictions) {
      if (content.metadata?.tags?.includes(restriction)) {
        return {
          approved: false,
          reason: `Content type '${restriction}' not allowed in this region`,
        };
      }
    }

    return { approved: true };
  }

  private async checkDefamatoryContent(content: any): Promise<boolean> {
    if (typeof content === 'string') {
      const defamatoryKeywords = [
        'fraud',
        'scam',
        'criminal',
        'liar',
        'cheat',
        'theft',
      ];
      
      const contentLower = content.toLowerCase();
      return defamatoryKeywords.some(keyword => contentLower.includes(keyword));
    }
    
    return false;
  }

  async monitorRegionalCompliance(
    regionCode: RegionCode
  ): Promise<{
    totalFlags: number;
    criticalFlags: number;
    escalations: number;
    avgResolutionTime: number;
  }> {
    const now = Timestamp.now();
    const oneDayAgo = Timestamp.fromMillis(now.toMillis() - 24 * 60 * 60 * 1000);

    const flagsSnapshot = await db
      .collection('regional_safety_flags')
      .where('regionCode', '==', regionCode)
      .where('createdAt', '>', oneDayAgo)
      .get();

    const criticalFlags = flagsSnapshot.docs.filter(
      doc => doc.data().severity === 'critical'
    ).length;

    const escalationsSnapshot = await db
      .collection('regional_escalations')
      .where('regionCode', '==', regionCode)
      .where('escalatedAt', '>', oneDayAgo)
      .get();

    const resolvedFlags = flagsSnapshot.docs.filter(
      doc => doc.data().resolvedAt !== undefined
    );

    let totalResolutionTime = 0;
    for (const flag of resolvedFlags) {
      const data = flag.data();
      if (data.resolvedAt && data.createdAt) {
        totalResolutionTime += data.resolvedAt.toMillis() - data.createdAt.toMillis();
      }
    }

    const avgResolutionTime = resolvedFlags.length > 0
      ? totalResolutionTime / resolvedFlags.length / 1000 / 60
      : 0;

    return {
      totalFlags: flagsSnapshot.size,
      criticalFlags,
      escalations: escalationsSnapshot.size,
      avgResolutionTime,
    };
  }
}

export async function enforceRegionalSafetyProtocols(
  userId: string,
  regionCode: RegionCode,
  content: string,
  contentType: 'message' | 'post' | 'stream' | 'comment'
): Promise<{ allowed: boolean; reason?: string; flagged?: boolean }> {
  const enforcer = new SafetyProtocolEnforcer();
  return enforcer.enforceRegionalSafetyProtocols(userId, regionCode, content, contentType);
}

export async function getRegionalSafetyResources(
  regionCode: RegionCode
): Promise<any[]> {
  const enforcer = new SafetyProtocolEnforcer();
  return enforcer.getRegionalSafetyResources(regionCode);
}

export async function checkContentModeration(
  userId: string,
  regionCode: RegionCode,
  content: {
    type: 'text' | 'image' | 'video' | 'audio';
    data: any;
    metadata?: Record<string, any>;
  }
): Promise<{ approved: boolean; reason?: string }> {
  const enforcer = new SafetyProtocolEnforcer();
  return enforcer.checkContentModeration(userId, regionCode, content);
}