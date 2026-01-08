import { admin, db, serverTimestamp } from '../init';
import * as functions from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';

interface BrandCollaboration {
  brand_id: string;
  creator_id: string;
  type: 'sponsored_merch_drop' | 'licensed_collection' | 'creator_owned' | 'collab_bundle';
  status: 'proposed' | 'approved' | 'active' | 'completed' | 'cancelled';
  terms?: {
    revenue_split?: { brand: number; creator: number };
    duration_days?: number;
    exclusivity?: boolean;
    minimum_sales?: number;
  };
  created_at: Timestamp;
  updated_at: Timestamp;
  approved_at?: Timestamp;
  metadata?: {
    total_products?: number;
    total_revenue?: number;
  };
}

const ROMANCE_KEYWORDS = [
  'romance', 'dating', 'girlfriend', 'boyfriend',
  'love package', 'attention', 'relationship reward',
  'exclusive intimacy', 'affection'
];

function hasRomanceContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return ROMANCE_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

export const proposeCollaboration = functions.https.onCall(
  async (data: {
    brand_id: string;
    creator_id: string;
    type: string;
    terms?: any;
    message?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { brand_id, creator_id, type, terms, message } = data;

    if (!brand_id || !creator_id || !type) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Brand ID, creator ID, and type are required'
      );
    }

    const validTypes = ['sponsored_merch_drop', 'licensed_collection', 'creator_owned', 'collab_bundle'];
    if (!validTypes.includes(type)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid collaboration type'
      );
    }

    const brandDoc = await db.collection('brand_profiles').doc(brand_id).get();
    if (!brandDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Brand profile not found'
      );
    }

    const brandData = brandDoc.data();
    if (brandData?.owner_id !== context.auth.uid && creator_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Not authorized to propose this collaboration'
      );
    }

    const contentToCheck = `${message || ''} ${JSON.stringify(terms || {})}`;
    if (hasRomanceContent(contentToCheck)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Collaboration contains prohibited romance-coded content'
      );
    }

    const now = Timestamp.now();
    const collaboration: BrandCollaboration = {
      brand_id,
      creator_id,
      type: type as any,
      status: 'proposed',
      created_at: now,
      updated_at: now,
      metadata: {
        total_products: 0,
        total_revenue: 0
      }
    };

    if (terms) {
      collaboration.terms = terms;
    }

    const collabRef = await db.collection('brand_collaborations').add(collaboration);

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'collaboration_proposed',
      collaboration_id: collabRef.id,
      timestamp: now,
      metadata: {
        brand_id,
        creator_id,
        type
      }
    });

    const notifyUserId = brandData?.owner_id === context.auth.uid ? creator_id : brand_id;
    await db.collection('notifications').add({
      user_id: notifyUserId,
      type: 'collaboration_proposal',
      title: 'New Collaboration Proposal',
      message: `You have a new collaboration proposal`,
      data: {
        collaboration_id: collabRef.id,
        proposer_id: context.auth.uid
      },
      read: false,
      created_at: now
    });

    return {
      success: true,
      collaboration_id: collabRef.id,
      message: 'Collaboration proposal sent successfully'
    };
  }
);

export const approveCollaboration = functions.https.onCall(
  async (data: {
    collaboration_id: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { collaboration_id } = data;

    if (!collaboration_id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Collaboration ID is required'
      );
    }

    const collabRef = db.collection('brand_collaborations').doc(collaboration_id);
    const collabDoc = await collabRef.get();

    if (!collabDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Collaboration not found'
      );
    }

    const collabData = collabDoc.data() as BrandCollaboration;

    if (collabData.status !== 'proposed') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Collaboration is not in proposed state'
      );
    }

    const brandDoc = await db.collection('brand_profiles').doc(collabData.brand_id).get();
    const brandData = brandDoc.data();

    if (brandData?.owner_id !== context.auth.uid && collabData.creator_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Not authorized to approve this collaboration'
      );
    }

    const now = Timestamp.now();
    await collabRef.update({
      status: 'approved',
      approved_at: now,
      updated_at: now
    });

    await db.collection('brand_profiles').doc(collabData.brand_id).update({
      'metadata.total_collaborations': admin.firestore.FieldValue.increment(1)
    });

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'collaboration_approved',
      collaboration_id,
      timestamp: now
    });

    const notifyUserId = brandData?.owner_id === context.auth.uid 
      ? collabData.creator_id 
      : collabData.brand_id;
      
    await db.collection('notifications').add({
      user_id: notifyUserId,
      type: 'collaboration_approved',
      title: 'Collaboration Approved',
      message: 'Your collaboration proposal has been approved',
      data: {
        collaboration_id
      },
      read: false,
      created_at: now
    });

    return {
      success: true,
      message: 'Collaboration approved successfully'
    };
  }
);

export const updateCollaborationStatus = functions.https.onCall(
  async (data: {
    collaboration_id: string;
    status: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { collaboration_id, status } = data;

    if (!collaboration_id || !status) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Collaboration ID and status are required'
      );
    }

    const validStatuses = ['active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid status'
      );
    }

    const collabRef = db.collection('brand_collaborations').doc(collaboration_id);
    const collabDoc = await collabRef.get();

    if (!collabDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Collaboration not found'
      );
    }

    const collabData = collabDoc.data() as BrandCollaboration;

    const brandDoc = await db.collection('brand_profiles').doc(collabData.brand_id).get();
    const brandData = brandDoc.data();

    if (brandData?.owner_id !== context.auth.uid && collabData.creator_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Not authorized to update this collaboration'
      );
    }

    await collabRef.update({
      status,
      updated_at: Timestamp.now()
    });

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'collaboration_status_updated',
      collaboration_id,
      timestamp: Timestamp.now(),
      metadata: { status }
    });

    return {
      success: true,
      message: `Collaboration status updated to ${status}`
    };
  }
);

export const getCollaboration = functions.https.onCall(
  async (data: { collaboration_id: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { collaboration_id } = data;

    if (!collaboration_id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Collaboration ID is required'
      );
    }

    const collabDoc = await db.collection('brand_collaborations').doc(collaboration_id).get();

    if (!collabDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Collaboration not found'
      );
    }

    const collabData = collabDoc.data() as BrandCollaboration;

    const brandDoc = await db.collection('brand_profiles').doc(collabData.brand_id).get();
    const brandData = brandDoc.data();

    if (brandData?.owner_id !== context.auth.uid && collabData.creator_id !== context.auth.uid) {
      const isAdmin = await db.collection('admin_users').doc(context.auth.uid).get()
        .then(doc => doc.exists);
      if (!isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Not authorized to view this collaboration'
        );
      }
    }

    return {
      success: true,
      collaboration: {
        id: collabDoc.id,
        ...collabData,
        created_at: collabData.created_at.toMillis(),
        updated_at: collabData.updated_at.toMillis(),
        approved_at: collabData.approved_at?.toMillis()
      }
    };
  }
);

export const listUserCollaborations = functions.https.onCall(
  async (data: {
    user_id?: string;
    status?: string;
    limit?: number;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { user_id = context.auth.uid, status, limit = 20 } = data;

    if (user_id !== context.auth.uid) {
      const isAdmin = await db.collection('admin_users').doc(context.auth.uid).get()
        .then(doc => doc.exists);
      if (!isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Not authorized to view collaborations for this user'
        );
      }
    }

    let query = db.collection('brand_collaborations')
      .where('creator_id', '==', user_id);

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query.orderBy('created_at', 'desc').limit(limit);

    const snapshot = await query.get();
    const collaborations = snapshot.docs.map(doc => {
      const data = doc.data() as BrandCollaboration;
      return {
        id: doc.id,
        ...data,
        created_at: data.created_at.toMillis(),
        updated_at: data.updated_at.toMillis(),
        approved_at: data.approved_at?.toMillis()
      };
    });

    return {
      success: true,
      collaborations,
      total: collaborations.length
    };
  }
);