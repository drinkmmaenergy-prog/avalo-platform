/**
 * PACK 436 — App Store Metadata Safeguard
 * 
 * Monitors and protects App Store metadata from policy violations
 * - Keywords monitoring
 * - Screenshots validation
 * - Description compliance
 * - Policy violation detection
 * - Trademark conflicts
 * - Content safety
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface MetadataSnapshot {
  platform: 'ios' | 'android';
  keywords: string[];
  title: string;
  subtitle?: string;
  description: string;
  screenshots: string[];
  promotional: {
    text?: string;
    video?: string;
  };
  categoryId: string;
  version: string;
  timestamp: number;
}

interface PolicyViolation {
  type: 'keyword' | 'screenshot' | 'description' | 'trademark' | 'sexual_content' | 'advertising';
  severity: 'low' | 'medium' | 'high' | 'critical';
  platform: 'ios' | 'android' | 'both';
  field: string;
  violationText: string;
  reason: string;
  recommendation: string;
  detectedAt: number;
}

interface TrademarkConflict {
  term: string;
  owner: string;
  platform: 'ios' | 'android' | 'both';
  riskLevel: 'low' | 'medium' | 'high';
  detectedIn: string[];
  recommendation: string;
}

interface ContentSafetyFlag {
  type: 'sexual' | 'violence' | 'drugs' | 'gambling' | 'profanity';
  content: string;
  location: string; // description, screenshot, etc
  severity: 'low' | 'medium' | 'high';
  autoReject: boolean;
}

interface MetadataHealthReport {
  overallScore: number; // 0-100
  violations: PolicyViolation[];
  trademarkRisks: TrademarkConflict[];
  safetyFlags: ContentSafetyFlag[];
  readyForSubmission: boolean;
  blockers: string[];
  warnings: string[];
  recommendations: string[];
  generatedAt: number;
}

// ============================================================================
// METADATA MONITORING
// ============================================================================

/**
 * Monitor metadata changes and validate before submission
 */
export const validateMetadataChange = functions.firestore
  .document('appMetadata/{platform}')
  .onWrite(async (change, context) => {
    const platform = context.params.platform as 'ios' | 'android';
    
    if (!change.after.exists) return null;
    
    const metadata = change.after.data() as MetadataSnapshot;
    const violations: PolicyViolation[] = [];
    const trademarkRisks: TrademarkConflict[] = [];
    const safetyFlags: ContentSafetyFlag[] = [];
    
    // 1. Validate Keywords
    const keywordViolations = validateKeywords(metadata.keywords, platform);
    violations.push(...keywordViolations);
    
    // 2. Validate Description
    const descriptionViolations = validateDescription(metadata.description, platform);
    violations.push(...descriptionViolations);
    
    // 3. Validate Title/Subtitle
    const titleViolations = validateTitle(metadata.title, metadata.subtitle, platform);
    violations.push(...titleViolations);
    
    // 4. Check Trademark Conflicts
    const trademarks = await checkTrademarkConflicts(metadata, platform);
    trademarkRisks.push(...trademarks);
    
    // 5. Content Safety Check
    const safety = await checkContentSafety(metadata);
    safetyFlags.push(...safety);
    
    // 6. Advertising Violations
    const adViolations = checkAdvertisingViolations(metadata);
    violations.push(...adViolations);
    
    // Store results
    const db = admin.firestore();
    await db.collection('metadataValidation').doc(platform).set({
      violations,
      trademarkRisks,
      safetyFlags,
      timestamp: Date.now(),
      readyForSubmission: violations.length === 0 && safetyFlags.filter(f => f.autoReject).length === 0,
    });
    
    // Alert admins if critical issues found
    const critical = violations.filter(v => v.severity === 'critical');
    if (critical.length > 0 || safetyFlags.some(f => f.autoReject)) {
      await alertAdmins({
        type: 'metadata_violation',
        platform,
        criticalCount: critical.length,
        autoRejectCount: safetyFlags.filter(f => f.autoReject).length,
      });
    }
    
    return {
      violations: violations.length,
      trademarks: trademarkRisks.length,
      safetyFlags: safetyFlags.length,
    };
  });

// ============================================================================
// KEYWORD VALIDATION
// ============================================================================

function validateKeywords(keywords: string[], platform: 'ios' | 'android'): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  
  // Prohibited keywords list
  const prohibited = {
    ios: [
      'best', 'free', '#1', 'top', 'cheap',
      'tinder', 'bumble', 'hinge', 'match', // Competitor names
      'xxx', 'porn', 'sex', 'adult', // Sexual content
      'hack', 'cheat', 'crack', // Illegal activity
    ],
    android: [
      'free', 'top rated', 'best app',
      'tinder', 'bumble', 'hinge', 'match',
      'xxx', 'porn', 'sex', 'adult',
      'hack', 'cheat', 'crack',
    ],
  };
  
  const platformProhibited = platform === 'ios' ? prohibited.ios : prohibited.android;
  
  keywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase();
    
    // Check prohibited terms
    platformProhibited.forEach(term => {
      if (lowerKeyword.includes(term)) {
        violations.push({
          type: 'keyword',
          severity: term.includes('xxx') || term.includes('porn') ? 'critical' : 'high',
          platform,
          field: 'keywords',
          violationText: keyword,
          reason: `Prohibited term: "${term}"`,
          recommendation: `Remove "${term}" from keywords`,
          detectedAt: Date.now(),
        });
      }
    });
    
    // Check keyword length (iOS: 100 chars total)
    if (platform === 'ios') {
      const totalLength = keywords.join(',').length;
      if (totalLength > 100) {
        violations.push({
          type: 'keyword',
          severity: 'high',
          platform,
          field: 'keywords',
          violationText: keywords.join(','),
          reason: `Keywords exceed 100 character limit (${totalLength})`,
          recommendation: 'Reduce keyword length or remove less important keywords',
          detectedAt: Date.now(),
        });
      }
    }
  });
  
  return violations;
}

// ============================================================================
// DESCRIPTION VALIDATION
// ============================================================================

function validateDescription(description: string, platform: 'ios' | 'android'): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const lower = description.toLowerCase();
  
  // Check for superlative claims without proof
  const superlatives = ['best', 'top', '#1', 'leading', 'most popular'];
  superlatives.forEach(term => {
    if (lower.includes(term)) {
      violations.push({
        type: 'description',
        severity: 'medium',
        platform,
        field: 'description',
        violationText: term,
        reason: 'Superlative claims require substantiation',
        recommendation: `Remove or substantiate "${term}" claim`,
        detectedAt: Date.now(),
      });
    }
  });
  
  // Check for competitor mentions
  const competitors = ['tinder', 'bumble', 'hinge', 'match', 'okcupid', 'pof'];
  competitors.forEach(comp => {
    if (lower.includes(comp)) {
      violations.push({
        type: 'description',
        severity: 'high',
        platform,
        field: 'description',
        violationText: comp,
        reason: 'Competitor name mentioned',
        recommendation: `Remove "${comp}" from description`,
        detectedAt: Date.now(),
      });
    }
  });
  
  // Check for explicit content keywords
  const explicitTerms = ['sex', 'xxx', 'porn', 'adult', 'nude', 'nsfw'];
  explicitTerms.forEach(term => {
    if (lower.includes(term)) {
      violations.push({
        type: 'description',
        severity: 'critical',
        platform,
        field: 'description',
        violationText: term,
        reason: 'Explicit content reference',
        recommendation: `Remove "${term}" - violates app store policies`,
        detectedAt: Date.now(),
      });
    }
  });
  
  // Check for price/promotion mentions (iOS violation)
  if (platform === 'ios') {
    const priceTerms = ['free trial', 'discount', '$', '50% off', 'limited time'];
    priceTerms.forEach(term => {
      if (lower.includes(term)) {
        violations.push({
          type: 'description',
          severity: 'high',
          platform,
          field: 'description',
          violationText: term,
          reason: 'Promotional language not allowed in iOS description',
          recommendation: `Remove "${term}" from description`,
          detectedAt: Date.now(),
        });
      }
    });
  }
  
  return violations;
}

// ============================================================================
// TITLE/SUBTITLE VALIDATION
// ============================================================================

function validateTitle(
  title: string,
  subtitle: string | undefined,
  platform: 'ios' | 'android'
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  
  // iOS title length limit: 30 chars
  if (platform === 'ios' && title.length > 30) {
    violations.push({
      type: 'keyword',
      severity: 'critical',
      platform,
      field: 'title',
      violationText: title,
      reason: `Title exceeds 30 character limit (${title.length})`,
      recommendation: 'Shorten app title',
      detectedAt: Date.now(),
    });
  }
  
  // Android title length limit: 30 chars (50 for full title)
  if (platform === 'android' && title.length > 50) {
    violations.push({
      type: 'keyword',
      severity: 'high',
      platform,
      field: 'title',
      violationText: title,
      reason: `Title exceeds 50 character limit (${title.length})`,
      recommendation: 'Shorten app title',
      detectedAt: Date.now(),
    });
  }
  
  // Check for keyword stuffing in title
  const titleLower = title.toLowerCase();
  const keywordStuffingTerms = ['dating app', 'match', 'chat', 'meet'];
  let stuffingCount = 0;
  
  keywordStuffingTerms.forEach(term => {
    if (titleLower.includes(term)) stuffingCount++;
  });
  
  if (stuffingCount > 2) {
    violations.push({
      type: 'keyword',
      severity: 'medium',
      platform,
      field: 'title',
      violationText: title,
      reason: 'Possible keyword stuffing in title',
      recommendation: 'Simplify title - focus on brand name',
      detectedAt: Date.now(),
    });
  }
  
  // iOS subtitle length: 30 chars
  if (platform === 'ios' && subtitle && subtitle.length > 30) {
    violations.push({
      type: 'keyword',
      severity: 'high',
      platform,
      field: 'subtitle',
      violationText: subtitle,
      reason: `Subtitle exceeds 30 character limit (${subtitle.length})`,
      recommendation: 'Shorten subtitle',
      detectedAt: Date.now(),
    });
  }
  
  return violations;
}

// ============================================================================
// TRADEMARK CONFLICT DETECTION
// ============================================================================

async function checkTrademarkConflicts(
  metadata: MetadataSnapshot,
  platform: 'ios' | 'android'
): Promise<TrademarkConflict[]> {
  const conflicts: TrademarkConflict[] = [];
  
  // Known trademarked terms in dating space
  const trademarks = [
    { term: 'tinder', owner: 'Match Group' },
    { term: 'bumble', owner: 'Bumble Inc.' },
    { term: 'hinge', owner: 'Match Group' },
    { term: 'match', owner: 'Match Group' },
    { term: 'okcupid', owner: 'Match Group' },
    { term: 'coffee meets bagel', owner: 'Coffee Meets Bagel' },
  ];
  
  const textToCheck = [
    metadata.title,
    metadata.subtitle || '',
    metadata.description,
    ...metadata.keywords,
  ].join(' ').toLowerCase();
  
  trademarks.forEach(({ term, owner }) => {
    if (textToCheck.includes(term)) {
      const detectedIn: string[] = [];
      
      if (metadata.title.toLowerCase().includes(term)) detectedIn.push('title');
      if (metadata.subtitle?.toLowerCase().includes(term)) detectedIn.push('subtitle');
      if (metadata.description.toLowerCase().includes(term)) detectedIn.push('description');
      if (metadata.keywords.some(k => k.toLowerCase().includes(term))) detectedIn.push('keywords');
      
      conflicts.push({
        term,
        owner,
        platform,
        riskLevel: detectedIn.includes('title') ? 'high' : 'medium',
        detectedIn,
        recommendation: `Remove "${term}" - trademarked by ${owner}`,
      });
    }
  });
  
  return conflicts;
}

// ============================================================================
// CONTENT SAFETY CHECK
// ============================================================================

async function checkContentSafety(metadata: MetadataSnapshot): Promise<ContentSafetyFlag[]> {
  const flags: ContentSafetyFlag[] = [];
  
  const allText = [
    metadata.title,
    metadata.subtitle || '',
    metadata.description,
  ].join(' ').toLowerCase();
  
  // Sexual content
  const sexualTerms = ['sex', 'xxx', 'porn', 'adult', 'nude', 'nsfw', 'erotic', 'explicit'];
  sexualTerms.forEach(term => {
    if (allText.includes(term)) {
      flags.push({
        type: 'sexual',
        content: term,
        location: 'description',
        severity: 'high',
        autoReject: true,
      });
    }
  });
  
  // Violence
  const violenceTerms = ['kill', 'murder', 'blood', 'gore', 'violent'];
  violenceTerms.forEach(term => {
    if (allText.includes(term)) {
      flags.push({
        type: 'violence',
        content: term,
        location: 'description',
        severity: 'medium',
        autoReject: false,
      });
    }
  });
  
  // Drugs
  const drugTerms = ['cocaine', 'marijuana', 'weed', 'drugs', 'meth'];
  drugTerms.forEach(term => {
    if (allText.includes(term)) {
      flags.push({
        type: 'drugs',
        content: term,
        location: 'description',
        severity: 'high',
        autoReject: true,
      });
    }
  });
  
  // Gambling
  const gamblingTerms = ['casino', 'gambling', 'poker', 'slots', 'bet'];
  gamblingTerms.forEach(term => {
    if (allText.includes(term)) {
      flags.push({
        type: 'gambling',
        content: term,
        location: 'description',
        severity: 'low',
        autoReject: false,
      });
    }
  });
  
  // Profanity
  const profanityTerms = ['fuck', 'shit', 'damn', 'hell', 'ass'];
  profanityTerms.forEach(term => {
    if (allText.includes(term)) {
      flags.push({
        type: 'profanity',
        content: term,
        location: 'description',
        severity: 'medium',
        autoReject: false,
      });
    }
  });
  
  return flags;
}

// ============================================================================
// ADVERTISING VIOLATIONS
// ============================================================================

function checkAdvertisingViolations(metadata: MetadataSnapshot): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const description = metadata.description.toLowerCase();
  
  // Check for fake urgency
  const urgencyTerms = ['limited time', 'hurry', 'act now', 'don\'t miss', 'last chance'];
  urgencyTerms.forEach(term => {
    if (description.includes(term)) {
      violations.push({
        type: 'advertising',
        severity: 'medium',
        platform: metadata.platform,
        field: 'description',
        violationText: term,
        reason: 'Fake urgency language',
        recommendation: `Remove "${term}" - not allowed in app store`,
        detectedAt: Date.now(),
      });
    }
  });
  
  // Check for misleading claims
  const misleadingTerms = ['guaranteed', '100% success', 'proven', 'certified'];
  misleadingTerms.forEach(term => {
    if (description.includes(term)) {
      violations.push({
        type: 'advertising',
        severity: 'high',
        platform: metadata.platform,
        field: 'description',
        violationText: term,
        reason: 'Unsubstantiated claim',
        recommendation: `Remove or substantiate "${term}"`,
        detectedAt: Date.now(),
      });
    }
  });
  
  return violations;
}

// ============================================================================
// METADATA HEALTH REPORT
// ============================================================================

/**
 * Generate comprehensive metadata health report
 */
export const generateMetadataHealthReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { platform } = data;
  const db = admin.firestore();
  
  // Fetch current metadata
  const metadataDoc = await db.collection('appMetadata').doc(platform).get();
  const metadata = metadataDoc.data() as MetadataSnapshot;
  
  if (!metadata) {
    throw new functions.https.HttpsError('not-found', 'Metadata not found');
  }
  
  // Fetch validation results
  const validationDoc = await db.collection('metadataValidation').doc(platform).get();
  const validation = validationDoc.data();
  
  const violations = validation?.violations || [];
  const trademarkRisks = validation?.trademarkRisks || [];
  const safetyFlags = validation?.safetyFlags || [];
  
  // Calculate overall score
  let score = 100;
  violations.forEach(v => {
    if (v.severity === 'critical') score -= 25;
    else if (v.severity === 'high') score -= 15;
    else if (v.severity === 'medium') score -= 5;
    else score -= 2;
  });
  safetyFlags.forEach(f => {
    if (f.autoReject) score -= 30;
    else if (f.severity === 'high') score -= 15;
    else score -= 5;
  });
  score = Math.max(0, score);
  
  // Determine blockers
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  violations.forEach(v => {
    if (v.severity === 'critical') {
      blockers.push(v.reason);
    } else if (v.severity === 'high') {
      warnings.push(v.reason);
    }
    recommendations.push(v.recommendation);
  });
  
  safetyFlags.forEach(f => {
    if (f.autoReject) {
      blockers.push(`Content safety: ${f.type} - ${f.content}`);
    } else {
      warnings.push(`Potential ${f.type} content: ${f.content}`);
    }
  });
  
  trademarkRisks.forEach(t => {
    if (t.riskLevel === 'high') {
      blockers.push(`Trademark conflict: ${t.term} (${t.owner})`);
    } else {
      warnings.push(`Potential trademark issue: ${t.term}`);
    }
    recommendations.push(t.recommendation);
  });
  
  const report: MetadataHealthReport = {
    overallScore: score,
    violations,
    trademarkRisks,
    safetyFlags,
    readyForSubmission: blockers.length === 0 && score >= 70,
    blockers,
    warnings,
    recommendations: [...new Set(recommendations)], // Remove duplicates
    generatedAt: Date.now(),
  };
  
  // Store report
  await db.collection('metadataHealthReports').doc(platform).set(report);
  
  return report;
});

// ============================================================================
// ADMIN ALERTS
// ============================================================================

async function alertAdmins(data: any) {
  const db = admin.firestore();
  await db.collection('adminAlerts').add({
    ...data,
    timestamp: Date.now(),
    read: false,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  MetadataSnapshot,
  PolicyViolation,
  TrademarkConflict,
  ContentSafetyFlag,
  MetadataHealthReport,
};
