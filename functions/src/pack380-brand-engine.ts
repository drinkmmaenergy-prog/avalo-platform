/**
 * PACK 380 — Global Brand Consistency Engine
 * 
 * Features:
 * - Brand asset management
 * - Brand compliance scanning
 * - Brand guidelines enforcement
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface BrandAsset {
  id: string;
  name: string;
  type: 'logo' | 'video' | 'template' | 'typography' | 'color' | 'legal_disclaimer' | 'other';
  category: string;
  fileUrl: string;
  thumbnail?: string;
  fileSize: number;
  mimeType: string;
  dimensions?: {
    width: number;
    height: number;
  };
  usage: string[];
  regions: string[];
  languages: string[];
  tags: string[];
  version: string;
  status: 'active' | 'deprecated' | 'archived';
  uploadedBy: string;
  approvedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface BrandGuideline {
  id: string;
  category: 'visual' | 'messaging' | 'legal' | 'safety' | 'localization';
  title: string;
  description: string;
  rules: {
    id: string;
    rule: string;
    severity: 'critical' | 'warning' | 'info';
    examples: string[];
  }[];
  applicableRegions: string[];
  applicableAssetTypes: string[];
  version: string;
  status: 'active' | 'draft' | 'archived';
  createdBy: string;
  approvedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface BrandAuditLog {
  id: string;
  sourceType: 'press_release' | 'influencer_content' | 'store_asset' | 'marketing_material';
  sourceId: string;
  scanDate: Timestamp;
  status: 'pass' | 'warning' | 'fail';
  violations: {
    guidelineId: string;
    ruleId: string;
    severity: 'critical' | 'warning' | 'info';
    description: string;
    location?: string;
  }[];
  autoFixed: boolean;
  reviewedBy?: string;
  resolvedAt?: Timestamp;
  createdAt: Timestamp;
}

interface ColorPalette {
  primary: string[];
  secondary: string[];
  accent: string[];
  neutral: string[];
  semantic: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
}

interface TypographySystem {
  primary: {
    family: string;
    weights: number[];
    styles: string[];
  };
  secondary: {
    family: string;
    weights: number[];
    styles: string[];
  };
  sizes: {
    h1: string;
    h2: string;
    h3: string;
    body: string;
    small: string;
  };
}

// ============================================================================
// BRAND ASSET MANAGEMENT
// ============================================================================

/**
 * Upload brand asset
 */
export const uploadBrandAsset = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'brand_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const {
    name,
    type,
    category,
    fileUrl,
    fileSize,
    mimeType,
    usage,
    regions,
    languages,
    tags,
    version
  } = data;

  if (!name || !type || !fileUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const assetRef = db.collection('brandAssets').doc();
    const asset: BrandAsset = {
      id: assetRef.id,
      name,
      type,
      category: category || 'general',
      fileUrl,
      thumbnail: data.thumbnail,
      fileSize: fileSize || 0,
      mimeType: mimeType || 'application/octet-stream',
      dimensions: data.dimensions,
      usage: usage || [],
      regions: regions || ['global'],
      languages: languages || ['en'],
      tags: tags || [],
      version: version || '1.0',
      status: 'active',
      uploadedBy: userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await assetRef.set(asset);

    // Log activity
    await db.collection('auditLogs').add({
      userId,
      action: 'brand_asset_uploaded',
      resource: 'brandAsset',
      resourceId: assetRef.id,
      metadata: { name, type },
      timestamp: Timestamp.now()
    });

    return {
      success: true,
      assetId: assetRef.id,
      asset
    };
  } catch (error: any) {
    console.error('Error uploading brand asset:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get brand assets
 */
export const getBrandAssets = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { type, category, region, language, status } = data;

  try {
    let query = db.collection('brandAssets') as any;

    if (type) {
      query = query.where('type', '==', type);
    }
    if (category) {
      query = query.where('category', '==', category);
    }
    if (status) {
      query = query.where('status', '==', status);
    } else {
      query = query.where('status', '==', 'active');
    }

    const snapshot = await query.get();
    let assets = snapshot.docs.map((doc: any) => doc.data());

    // Filter by region
    if (region) {
      assets = assets.filter((a: BrandAsset) => 
        a.regions.includes('global') || a.regions.includes(region)
      );
    }

    // Filter by language
    if (language) {
      assets = assets.filter((a: BrandAsset) => 
        a.languages.includes('all') || a.languages.includes(language)
      );
    }

    return {
      success: true,
      assets
    };
  } catch (error: any) {
    console.error('Error getting brand assets:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get brand style guide
 */
export const getBrandStyleGuide = functions.https.onCall(async (data, context) => {
  try {
    // Get or create style guide
    const styleGuideDoc = await db.collection('brandConfig').doc('styleGuide').get();
    
    if (!styleGuideDoc.exists) {
      // Create default style guide
      const defaultStyleGuide = createDefaultStyleGuide();
      await db.collection('brandConfig').doc('styleGuide').set(defaultStyleGuide);
      return {
        success: true,
        styleGuide: defaultStyleGuide
      };
    }

    return {
      success: true,
      styleGuide: styleGuideDoc.data()
    };
  } catch (error: any) {
    console.error('Error getting brand style guide:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Create default style guide
 */
function createDefaultStyleGuide() {
  const colors: ColorPalette = {
    primary: ['#6C5CE7', '#5F3DC4', '#4C3A9E'],
    secondary: ['#A29BFE', '#6C5CE7', '#5F3DC4'],
    accent: ['#FF6B9D', '#FD79A8', '#FF7675'],
    neutral: ['#2D3436', '#636E72', '#B2BEC3', '#DFE6E9', '#F5F6FA'],
    semantic: {
      success: '#00B894',
      warning: '#FDCB6E',
      error: '#D63031',
      info: '#0984E3'
    }
  };

  const typography: TypographySystem = {
    primary: {
      family: 'Inter',
      weights: [400, 500, 600, 700, 800],
      styles: ['normal', 'italic']
    },
    secondary: {
      family: 'Poppins',
      weights: [300, 400, 500, 600, 700],
      styles: ['normal']
    },
    sizes: {
      h1: '32px',
      h2: '24px',
      h3: '20px',
      body: '16px',
      small: '14px'
    }
  };

  return {
    name: 'Avalo Brand Style Guide',
    version: '1.0',
    colors,
    typography,
    spacing: {
      base: 8,
      scale: [4, 8, 12, 16, 24, 32, 48, 64, 96]
    },
    borderRadius: {
      small: '4px',
      medium: '8px',
      large: '16px',
      full: '9999px'
    },
    logo: {
      primaryUrl: '',
      variations: [],
      clearSpace: '20px',
      minSize: '32px'
    },
    messaging: {
      tone: ['premium', 'safe', 'empowering', 'global', 'innovative'],
      voice: 'confident yet approachable',
      keywords: ['dating', 'connections', 'safety', 'premium', 'creator economy']
    },
    updatedAt: Timestamp.now()
  };
}

// ============================================================================
// BRAND COMPLIANCE SCANNING
// ============================================================================

/**
 * Scan content for brand compliance
 */
export const scanBrandCompliance = functions.https.onCall(async (data, context) => {
  const { sourceType, sourceId, content } = data;

  if (!sourceType || !sourceId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Get active brand guidelines
    const guidelinesSnapshot = await db.collection('brandGuidelines')
      .where('status', '==', 'active')
      .get();

    const guidelines = guidelinesSnapshot.docs.map(doc => doc.data() as BrandGuideline);

    // Perform compliance scan
    const violations: any[] = [];
    let autoFixed = false;

    for (const guideline of guidelines) {
      // Check if guideline applies to this source type
      if (guideline.applicableAssetTypes.length > 0 &&
          !guideline.applicableAssetTypes.includes(sourceType)) {
        continue;
      }

      // Check each rule
      for (const rule of guideline.rules) {
        const ruleViolation = checkRule(content, rule);
        if (ruleViolation) {
          violations.push({
            guidelineId: guideline.id,
            ruleId: rule.id,
            severity: rule.severity,
            description: ruleViolation.description,
            location: ruleViolation.location
          });
        }
      }
    }

    // Determine overall status
    const hasCritical = violations.some(v => v.severity === 'critical');
    const hasWarning = violations.some(v => v.severity === 'warning');
    const status = hasCritical ? 'fail' : hasWarning ? 'warning' : 'pass';

    // Create audit log
    const auditRef = db.collection('brandAuditLogs').doc();
    const audit: BrandAuditLog = {
      id: auditRef.id,
      sourceType,
      sourceId,
      scanDate: Timestamp.now(),
      status,
      violations,
      autoFixed,
      createdAt: Timestamp.now()
    };

    await auditRef.set(audit);

    return {
      success: true,
      auditId: auditRef.id,
      status,
      violations,
      passed: status === 'pass'
    };
  } catch (error: any) {
    console.error('Error scanning brand compliance:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Check if content violates a specific rule
 */
function checkRule(content: any, rule: any): any {
  // Simple keyword-based checking
  // In production, this should use NLP and image analysis

  const violations: any = {
    description: '',
    location: ''
  };

  // Example rules checking
  if (rule.id === 'no_competitor_mentions') {
    const competitors = ['tinder', 'bumble', 'hinge', 'match'];
    const contentStr = JSON.stringify(content).toLowerCase();
    
    for (const competitor of competitors) {
      if (contentStr.includes(competitor)) {
        violations.description = `Competitor mention detected: ${competitor}`;
        return violations;
      }
    }
  }

  if (rule.id === 'safety_first_language') {
    const contentStr = JSON.stringify(content).toLowerCase();
    const unsafeTerms = ['hookup', 'casual sex', 'one night'];
    
    for (const term of unsafeTerms) {
      if (contentStr.includes(term)) {
        violations.description = `Non-safety-first language detected: ${term}`;
        return violations;
      }
    }
  }

  // No violations found
  return null;
}

/**
 * Create brand guideline
 */
export const createBrandGuideline = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'brand_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const {
    category,
    title,
    description,
    rules,
    applicableRegions,
    applicableAssetTypes,
    version
  } = data;

  if (!category || !title || !rules) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const guidelineRef = db.collection('brandGuidelines').doc();
    const guideline: BrandGuideline = {
      id: guidelineRef.id,
      category,
      title,
      description: description || '',
      rules: Array.isArray(rules) ? rules : [],
      applicableRegions: applicableRegions || ['global'],
      applicableAssetTypes: applicableAssetTypes || [],
      version: version || '1.0',
      status: 'draft',
      createdBy: userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await guidelineRef.set(guideline);

    return {
      success: true,
      guidelineId: guidelineRef.id
    };
  } catch (error: any) {
    console.error('Error creating brand guideline:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Initialize default brand guidelines
 */
export const initializeDefaultGuidelines = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  try {
    const defaultGuidelines = [
      {
        category: 'visual',
        title: 'Logo Usage',
        description: 'Rules for proper logo usage across all materials',
        rules: [
          {
            id: 'logo_clearspace',
            rule: 'Maintain minimum clearspace of 20px around logo',
            severity: 'warning',
            examples: ['✓ Logo with adequate space', '✗ Logo cramped with text']
          },
          {
            id: 'logo_colors',
            rule: 'Use only approved logo color variations',
            severity: 'critical',
            examples: ['✓ Primary purple logo', '✗ Custom colored logo']
          }
        ],
        applicableRegions: ['global'],
        applicableAssetTypes: ['press_release', 'marketing_material', 'store_asset'],
        version: '1.0',
        status: 'active',
        createdBy: userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      {
        category: 'messaging',
        title: 'Safety-First Language',
        description: 'All messaging must prioritize safety and user wellbeing',
        rules: [
          {
            id: 'safety_first_language',
            rule: 'Avoid casual hookup or unsafe dating language',
            severity: 'critical',
            examples: ['✓ "meaningful connections"', '✗ "hookups"']
          },
          {
            id: 'premium_language',
            rule: 'Use premium, empowering language',
            severity: 'warning',
            examples: ['✓ "exclusive", "premium"', '✗ "cheap", "basic"']
          }
        ],
        applicableRegions: ['global'],
        applicableAssetTypes: ['press_release', 'marketing_material', 'influencer_content'],
        version: '1.0',
        status: 'active',
        createdBy: userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      {
        category: 'legal',
        title: 'Required Disclaimers',
        description: 'Legal disclaimers required for different content types',
        rules: [
          {
            id: 'earnings_disclaimer',
            rule: 'Earnings claims must include standard disclaimer',
            severity: 'critical',
            examples: ['✓ "Results may vary..."', '✗ "guaranteed earnings"']
          },
          {
            id: 'age_restriction',
            rule: 'Always mention 18+ age requirement',
            severity: 'critical',
            examples: ['✓ "18+ only"', '✗ No age mention']
          }
        ],
        applicableRegions: ['global'],
        applicableAssetTypes: ['press_release', 'marketing_material', 'influencer_content'],
        version: '1.0',
        status: 'active',
        createdBy: userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      }
    ];

    // Create each guideline
    const promises = defaultGuidelines.map(guideline => {
      const ref = db.collection('brandGuidelines').doc();
      return ref.set({ ...guideline, id: ref.id });
    });

    await Promise.all(promises);

    return {
      success: true,
      count: defaultGuidelines.length
    };
  } catch (error: any) {
    console.error('Error initializing guidelines:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get brand audit history
 */
export const getBrandAuditHistory = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { sourceType, sourceId, limit } = data;

  try {
    let query = db.collection('brandAuditLogs') as any;

    if (sourceType) {
      query = query.where('sourceType', '==', sourceType);
    }
    if (sourceId) {
      query = query.where('sourceId', '==', sourceId);
    }

    query = query.orderBy('scanDate', 'desc').limit(limit || 50);

    const snapshot = await query.get();
    const audits = snapshot.docs.map((doc: any) => doc.data());

    // Calculate statistics
    const stats = {
      total: audits.length,
      passed: audits.filter((a: any) => a.status === 'pass').length,
      warnings: audits.filter((a: any) => a.status === 'warning').length,
      failed: audits.filter((a: any) => a.status === 'fail').length
    };

    return {
      success: true,
      audits,
      stats
    };
  } catch (error: any) {
    console.error('Error getting brand audit history:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
