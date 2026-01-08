import { admin, db } from '../init';
import * as functions from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';

const NSFW_KEYWORDS = [
  'lingerie', 'erotic', 'sexy', 'sensual', 'seductive',
  'intimate', 'adult', 'nsfw', 'xxx', 'porn', 'escort',
  'nude', 'naked', 'explicit', 'sexual'
];

const ROMANCE_KEYWORDS = [
  'romance', 'dating', 'girlfriend', 'boyfriend',
  'love package', 'attention', 'buy my love', 'exclusive intimacy',
  'relationship reward', 'affection bundle', 'emotional connection',
  'parasocial', 'girlfriend experience', 'boyfriend experience'
];

const EXTERNAL_FUNNEL_KEYWORDS = [
  'onlyfans', 'patreon', 'fansly', 'telegram', 'whatsapp',
  'contact me at', 'dm me', 'message me privately', 'external link'
];

interface ModerationReport {
  reporter_id: string;
  target_type: 'brand_profile' | 'brand_product' | 'brand_collaboration';
  target_id: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: Timestamp;
  resolved_at?: Timestamp;
  resolved_by?: string;
  action_taken?: string;
}

function scanForNSFWContent(text: string): { flagged: boolean; matches: string[] } {
  const lowerText = text.toLowerCase();
  const matches: string[] = [];
  
  NSFW_KEYWORDS.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      matches.push(keyword);
    }
  });

  return {
    flagged: matches.length > 0,
    matches
  };
}

function scanForRomanceContent(text: string): { flagged: boolean; matches: string[] } {
  const lowerText = text.toLowerCase();
  const matches: string[] = [];
  
  ROMANCE_KEYWORDS.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      matches.push(keyword);
    }
  });

  return {
    flagged: matches.length > 0,
    matches
  };
}

function scanForExternalFunnels(text: string): { flagged: boolean; matches: string[] } {
  const lowerText = text.toLowerCase();
  const matches: string[] = [];
  
  EXTERNAL_FUNNEL_KEYWORDS.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      matches.push(keyword);
    }
  });

  const urlPattern = /(https?:\/\/[^\s]+)/gi;
  const urls = text.match(urlPattern) || [];
  
  if (urls.length > 0) {
    matches.push(...urls);
  }

  return {
    flagged: matches.length > 0,
    matches
  };
}

export const scanBrandContent = functions.https.onCall(
  async (data: {
    target_type: 'brand_profile' | 'brand_product';
    target_id: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const isAdmin = await db.collection('admin_users').doc(context.auth.uid).get()
      .then(doc => doc.exists);

    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { target_type, target_id } = data;

    if (!target_type || !target_id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Target type and ID are required'
      );
    }

    let collection = '';
    if (target_type === 'brand_profile') {
      collection = 'brand_profiles';
    } else if (target_type === 'brand_product') {
      collection = 'brand_products';
    } else {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid target type'
      );
    }

    const doc = await db.collection(collection).doc(target_id).get();

    if (!doc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Target not found'
      );
    }

    const docData = doc.data();
    const textToScan = `${docData?.name || ''} ${docData?.description || ''}`;

    const nsfwScan = scanForNSFWContent(textToScan);
    const romanceScan = scanForRomanceContent(textToScan);
    const externalScan = scanForExternalFunnels(textToScan);

    const violations: any = {};
    if (nsfwScan.flagged) violations.nsfw = nsfwScan.matches;
    if (romanceScan.flagged) violations.romance = romanceScan.matches;
    if (externalScan.flagged) violations.external_funnels = externalScan.matches;

    const flagged = nsfwScan.flagged || romanceScan.flagged || externalScan.flagged;

    if (flagged) {
      await db.collection('moderation_flags').add({
        target_type,
        target_id,
        violations,
        scanned_by: context.auth.uid,
        scanned_at: Timestamp.now(),
        status: 'flagged'
      });
    }

    return {
      success: true,
      flagged,
      violations: flagged ? violations : null
    };
  }
);

export const reportBrandContent = functions.https.onCall(
  async (data: {
    target_type: 'brand_profile' | 'brand_product' | 'brand_collaboration';
    target_id: string;
    reason: string;
    description?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { target_type, target_id, reason, description } = data;

    if (!target_type || !target_id || !reason) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Target type, ID, and reason are required'
      );
    }

    const validReasons = [
      'nsfw_content',
      'romance_coded',
      'external_funnel',
      'counterfeit',
      'misleading',
      'inappropriate',
      'spam'
    ];

    if (!validReasons.includes(reason)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid reason'
      );
    }

    const existingReport = await db.collection('brand_moderation_reports')
      .where('reporter_id', '==', context.auth.uid)
      .where('target_type', '==', target_type)
      .where('target_id', '==', target_id)
      .where('status', 'in', ['pending', 'reviewing'])
      .limit(1)
      .get();

    if (!existingReport.empty) {
      throw new functions.https.HttpsError(
        'already-exists',
        'You have already reported this content'
      );
    }

    const now = Timestamp.now();
    const report: ModerationReport = {
      reporter_id: context.auth.uid,
      target_type,
      target_id,
      reason,
      status: 'pending',
      created_at: now
    };

    if (description) {
      report.description = description;
    }

    const reportRef = await db.collection('brand_moderation_reports').add(report);

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'content_reported',
      report_id: reportRef.id,
      timestamp: now,
      metadata: {
        target_type,
        target_id,
        reason
      }
    });

    return {
      success: true,
      report_id: reportRef.id,
      message: 'Report submitted successfully'
    };
  }
);

export const banBrandProfile = functions.https.onCall(
  async (data: {
    brand_id: string;
    reason: string;
    permanent?: boolean;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const isAdmin = await db.collection('admin_users').doc(context.auth.uid).get()
      .then(doc => doc.exists);

    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { brand_id, reason, permanent = false } = data;

    if (!brand_id || !reason) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Brand ID and reason are required'
      );
    }

    const brandRef = db.collection('brand_profiles').doc(brand_id);
    const brandDoc = await brandRef.get();

    if (!brandDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Brand profile not found'
      );
    }

    const now = Timestamp.now();
    const batch = db.batch();

    batch.update(brandRef, {
      status: 'banned',
      updated_at: now,
      ban_info: {
        banned_at: now,
        banned_by: context.auth.uid,
        reason,
        permanent
      }
    });

    const productsSnapshot = await db.collection('brand_products')
      .where('brand_id', '==', brand_id)
      .where('status', '==', 'active')
      .get();

    productsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'banned',
        updated_at: now
      });
    });

    const brandData = brandDoc.data();
    if (brandData?.owner_id) {
      batch.set(db.collection('notifications').doc(), {
        user_id: brandData.owner_id,
        type: 'brand_banned',
        title: 'Brand Banned',
        message: `Your brand has been banned. Reason: ${reason}`,
        data: {
          brand_id,
          reason,
          permanent
        },
        read: false,
        created_at: now
      });
    }

    await batch.commit();

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'brand_banned',
      brand_id,
      timestamp: now,
      metadata: { reason, permanent }
    });

    return {
      success: true,
      message: 'Brand banned successfully'
    };
  }
);

export const banProduct = functions.https.onCall(
  async (data: {
    product_id: string;
    reason: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const isAdmin = await db.collection('admin_users').doc(context.auth.uid).get()
      .then(doc => doc.exists);

    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { product_id, reason } = data;

    if (!product_id || !reason) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Product ID and reason are required'
      );
    }

    const productRef = db.collection('brand_products').doc(product_id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Product not found'
      );
    }

    const now = Timestamp.now();
    await productRef.update({
      status: 'banned',
      updated_at: now,
      ban_info: {
        banned_at: now,
        banned_by: context.auth.uid,
        reason
      }
    });

    const productData = productDoc.data();
    const brandDoc = await db.collection('brand_profiles').doc(productData?.brand_id).get();
    const brandData = brandDoc.data();

    if (brandData?.owner_id) {
      await db.collection('notifications').add({
        user_id: brandData.owner_id,
        type: 'product_banned',
        title: 'Product Banned',
        message: `Your product has been banned. Reason: ${reason}`,
        data: {
          product_id,
          reason
        },
        read: false,
        created_at: now
      });
    }

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'product_banned',
      product_id,
      timestamp: now,
      metadata: { reason }
    });

    return {
      success: true,
      message: 'Product banned successfully'
    };
  }
);

export const resolveReport = functions.https.onCall(
  async (data: {
    report_id: string;
    action: 'ban' | 'suspend' | 'warn' | 'dismiss';
    notes?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const isAdmin = await db.collection('admin_users').doc(context.auth.uid).get()
      .then(doc => doc.exists);

    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { report_id, action, notes } = data;

    if (!report_id || !action) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Report ID and action are required'
      );
    }

    const reportRef = db.collection('brand_moderation_reports').doc(report_id);
    const reportDoc = await reportRef.get();

    if (!reportDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Report not found'
      );
    }

    const reportData = reportDoc.data() as ModerationReport;

    if (reportData.status === 'resolved' || reportData.status === 'dismissed') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Report already resolved'
      );
    }

    const now = Timestamp.now();

    if (action === 'ban') {
      if (reportData.target_type === 'brand_profile') {
        await banBrandProfile.run({ brand_id: reportData.target_id, reason: reportData.reason }, context);
      } else if (reportData.target_type === 'brand_product') {
        await banProduct.run({ product_id: reportData.target_id, reason: reportData.reason }, context);
      }
    } else if (action === 'suspend') {
      const collection = reportData.target_type === 'brand_profile' ? 'brand_profiles' : 'brand_products';
      await db.collection(collection).doc(reportData.target_id).update({
        status: 'suspended',
        updated_at: now
      });
    }

    await reportRef.update({
      status: action === 'dismiss' ? 'dismissed' : 'resolved',
      resolved_at: now,
      resolved_by: context.auth.uid,
      action_taken: action
    });

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'report_resolved',
      report_id,
      timestamp: now,
      metadata: { action, notes }
    });

    return {
      success: true,
      message: `Report ${action === 'dismiss' ? 'dismissed' : 'resolved'} successfully`
    };
  }
);

export const listPendingReports = functions.https.onCall(
  async (data: {
    limit?: number;
    offset?: number;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const isAdmin = await db.collection('admin_users').doc(context.auth.uid).get()
      .then(doc => doc.exists);

    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { limit = 20, offset = 0 } = data;

    const snapshot = await db.collection('brand_moderation_reports')
      .where('status', 'in', ['pending', 'reviewing'])
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .get();

    const reports = snapshot.docs.map(doc => {
      const data = doc.data() as ModerationReport;
      return {
        id: doc.id,
        ...data,
        created_at: data.created_at.toMillis(),
        resolved_at: data.resolved_at?.toMillis()
      };
    });

    return {
      success: true,
      reports,
      total: reports.length,
      has_more: snapshot.size === limit
    };
  }
);