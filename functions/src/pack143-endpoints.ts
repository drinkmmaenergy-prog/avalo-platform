/**
 * PACK 143 - CRM API Endpoints
 * HTTP callable functions for CRM Business Suite
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CRMEngine } from './pack143-crm-engine';
import { db, serverTimestamp } from './init';

export const createCRMContact = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { targetUserId, userData } = request.data;

  if (!targetUserId || !userData) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const contact = await CRMEngine.createOrUpdateContact(
      uid,
      targetUserId,
      userData
    );
    return { success: true, contact };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const assignContactLabel = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, labelName } = request.data;

  if (!userId || !labelName) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    await CRMEngine.assignLabel(uid, userId, labelName);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const removeContactLabel = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, labelName } = request.data;

  if (!userId || !labelName) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    await CRMEngine.removeLabel(uid, userId, labelName);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const recordContactPurchase = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, purchase } = request.data;

  if (!userId || !purchase) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    await CRMEngine.recordPurchase(uid, userId, purchase);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const createSegment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { name, description, filters } = request.data;

  if (!name || !filters) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const segment = await CRMEngine.createSegment(
      uid,
      name,
      description || '',
      filters
    );
    return { success: true, segment };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const updateSegment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { segmentId, name, description, filters } = request.data;

  if (!segmentId) {
    throw new HttpsError('invalid-argument', 'Missing segment ID');
  }

  try {
    const segmentRef = db.collection('crm_segments').doc(segmentId);
    const segment = await segmentRef.get();

    if (!segment.exists || segment.data()?.creatorId !== uid) {
      throw new HttpsError('permission-denied', 'Access denied');
    }

    const updates: any = {};
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (filters) {
      updates.filters = filters;
      updates.contactCount = await CRMEngine.calculateSegmentSize(uid, filters);
    }
    updates.updatedAt = serverTimestamp();

    await segmentRef.update(updates);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getSegmentContacts = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { segmentId, limit = 100, offset = 0 } = request.data;

  if (!segmentId) {
    throw new HttpsError('invalid-argument', 'Missing segment ID');
  }

  try {
    const segment = await db.collection('crm_segments').doc(segmentId).get();

    if (!segment.exists || segment.data()?.creatorId !== uid) {
      throw new HttpsError('permission-denied', 'Access denied');
    }

    const filters = segment.data()?.filters || {};
    let query: any = db
      .collection('crm_contacts')
      .where('creatorId', '==', uid)
      .limit(limit)
      .offset(offset);

    if (filters.labels && filters.labels.length > 0) {
      query = query.where('labels', 'array-contains-any', filters.labels);
    }

    const snapshot = await query.get();
    const contacts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, contacts, total: segment.data()?.contactCount || 0 };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const createFunnel = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { name, description, trigger, steps } = request.data;

  if (!name || !trigger || !steps) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const funnel = await CRMEngine.createFunnel(uid, {
      name,
      description: description || '',
      trigger,
      steps,
    });
    return { success: true, funnel };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const updateFunnel = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { funnelId, name, description, status, steps } = request.data;

  if (!funnelId) {
    throw new HttpsError('invalid-argument', 'Missing funnel ID');
  }

  try {
    const funnelRef = db.collection('crm_funnels').doc(funnelId);
    const funnel = await funnelRef.get();

    if (!funnel.exists || funnel.data()?.creatorId !== uid) {
      throw new HttpsError('permission-denied', 'Access denied');
    }

    const updates: any = { updatedAt: serverTimestamp() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (status) updates.status = status;
    if (steps) updates.steps = steps;

    await funnelRef.update(updates);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const triggerFunnelForUser = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { funnelId, userId } = request.data;

  if (!funnelId || !userId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const funnel = await db.collection('crm_funnels').doc(funnelId).get();

    if (!funnel.exists || funnel.data()?.creatorId !== uid) {
      throw new HttpsError('permission-denied', 'Access denied');
    }

    await CRMEngine.triggerFunnel(funnelId, userId);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const createBroadcast = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { segmentId, subject, content, contentType, scheduledAt } = request.data;

  if (!segmentId || !subject || !content || !contentType) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const broadcast = await CRMEngine.createBroadcast(uid, {
      segmentId,
      subject,
      content,
      contentType,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });
    return { success: true, broadcast };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const sendBroadcast = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { broadcastId } = request.data;

  if (!broadcastId) {
    throw new HttpsError('invalid-argument', 'Missing broadcast ID');
  }

  try {
    const broadcast = await db.collection('crm_broadcasts').doc(broadcastId).get();

    if (!broadcast.exists || broadcast.data()?.creatorId !== uid) {
      throw new HttpsError('permission-denied', 'Access denied');
    }

    await CRMEngine.sendBroadcast(broadcastId);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const optOutFromBroadcasts = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { creatorId } = request.data;

  if (!creatorId) {
    throw new HttpsError('invalid-argument', 'Missing creator ID');
  }

  try {
    await CRMEngine.optOutBroadcasts(creatorId, uid);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getCRMAnalytics = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { period = 'month' } = request.data;

  try {
    const analytics = await CRMEngine.getAnalytics(uid, period);
    return { success: true, analytics };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getMyContacts = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { limit = 100, offset = 0, labels } = request.data;

  try {
    let query: any = db
      .collection('crm_contacts')
      .where('creatorId', '==', uid)
      .orderBy('lastInteractionAt', 'desc')
      .limit(limit)
      .offset(offset);

    if (labels && labels.length > 0) {
      query = query.where('labels', 'array-contains-any', labels);
    }

    const snapshot = await query.get();
    const contacts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, contacts };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getMySegments = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const snapshot = await db
      .collection('crm_segments')
      .where('creatorId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    const segments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, segments };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getMyFunnels = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const snapshot = await db
      .collection('crm_funnels')
      .where('creatorId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    const funnels = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, funnels };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});

export const getMyBroadcasts = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const snapshot = await db
      .collection('crm_broadcasts')
      .where('creatorId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const broadcasts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, broadcasts };
  } catch (error: any) {
    throw new HttpsError('internal', error.message);
  }
});