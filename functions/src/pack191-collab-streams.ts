/**
 * PACK 191 — Collab Streams & Group Features
 * 
 * Allows up to 4 creators to stream together
 * Supports: fitness workout squad, DJ battle, group language challenge, business mastermind, gaming tournament
 * 
 * Forbidden: couple streams, kissing/erotic streams, speed-dating, couples roleplay
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

export interface CollabInvite {
  inviteId: string;
  streamId: string;
  inviterId: string;
  inviterName: string;
  inviteeId: string;
  inviteeName: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  message?: string;
  expiresAt: Timestamp | FieldValue;
  respondedAt?: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export type CollabRole = 'host' | 'co-host' | 'guest';

export interface CollabParticipant {
  userId: string;
  userName: string;
  userAvatar?: string;
  role: CollabRole;
  joinedAt: Timestamp | FieldValue;
  isActive: boolean;
}

// ============================================================================
// ALLOWED COLLAB TYPES
// ============================================================================

const ALLOWED_COLLAB_CATEGORIES = [
  'fitness',      // Workout squad
  'gaming',       // Tournament, multiplayer
  'education',    // Group teaching, panel
  'business',     // Mastermind, networking
  'music',        // DJ battle, band performance
  'art',          // Collaborative creation
  'cooking',      // Cooking challenge
  'dance',        // Dance crew
  'sports',       // Team sports
];

const MAX_COLLAB_PARTICIPANTS = 4;

// ============================================================================
// COLLAB INVITES
// ============================================================================

/**
 * Invite another creator to join stream
 */
export const inviteToCollabStream = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { streamId, inviteeId, message } = request.data;

    // Get stream
    const streamDoc = await db.collection('live_streams').doc(streamId).get();
    if (!streamDoc.exists) {
      throw new HttpsError('not-found', 'Stream not found');
    }

    const stream = streamDoc.data();
    if (!stream) {
      throw new HttpsError('not-found', 'Stream data not found');
    }

    // Only host can invite
    if (stream.hostId !== uid) {
      throw new HttpsError('permission-denied', 'Only host can invite collaborators');
    }

    // Check category allows collab
    if (!ALLOWED_COLLAB_CATEGORIES.includes(stream.category)) {
      throw new HttpsError(
        'failed-precondition',
        `Category ${stream.category} does not support collaborative streams`
      );
    }

    // Check participant limit
    if (stream.participantIds.length >= MAX_COLLAB_PARTICIPANTS) {
      throw new HttpsError('resource-exhausted', `Maximum ${MAX_COLLAB_PARTICIPANTS} participants allowed`);
    }

    // Cannot invite self
    if (inviteeId === uid) {
      throw new HttpsError('invalid-argument', 'Cannot invite yourself');
    }

    // Check invitee exists and is verified
    const inviteeDoc = await db.collection('users').doc(inviteeId).get();
    if (!inviteeDoc.exists) {
      throw new HttpsError('not-found', 'Invitee not found');
    }

    const inviteeData = inviteeDoc.data();
    if (!inviteeData?.verification?.age18) {
      throw new HttpsError('failed-precondition', 'Invitee must be 18+ verified');
    }

    // Check for existing pending invite
    const existingInvite = await db.collection('collab_invites')
      .where('streamId', '==', streamId)
      .where('inviteeId', '==', inviteeId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existingInvite.empty) {
      throw new HttpsError('already-exists', 'Invite already sent');
    }

    // Get inviter name
    const inviterDoc = await db.collection('users').doc(uid).get();
    const inviterName = inviterDoc.data()?.name || 'Unknown';

    // Create invite
    const inviteRef = db.collection('collab_invites').doc();
    const invite: Partial<CollabInvite> = {
      inviteId: inviteRef.id,
      streamId,
      inviterId: uid,
      inviterName,
      inviteeId,
      inviteeName: inviteeData.name || 'Unknown',
      status: 'pending',
      message,
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), // 5 minutes
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await inviteRef.set(invite);

    // Send notification
    await db.collection('notifications').doc().set({
      userId: inviteeId,
      type: 'collab_invite',
      title: 'Stream Collaboration Invite',
      message: `${inviterName} invited you to join their ${stream.category} stream: ${stream.title}`,
      metadata: { streamId, inviteId: inviteRef.id },
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      inviteId: inviteRef.id,
      invite,
    };
  }
);

/**
 * Respond to a collab invite
 */
export const respondToCollabInvite = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { inviteId, accept } = request.data;

    const inviteRef = db.collection('collab_invites').doc(inviteId);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      throw new HttpsError('not-found', 'Invite not found');
    }

    const invite = inviteDoc.data() as CollabInvite;

    // Only invitee can respond
    if (invite.inviteeId !== uid) {
      throw new HttpsError('permission-denied', 'Not authorized to respond to this invite');
    }

    // Check invite status
    if (invite.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Invite already responded to');
    }

    // Check expiration
    const expiresAt = invite.expiresAt as Timestamp;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      await inviteRef.update({
        status: 'expired',
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError('failed-precondition', 'Invite has expired');
    }

    if (accept) {
      // Accept invite - add to stream
      const streamRef = db.collection('live_streams').doc(invite.streamId);
      const streamDoc = await streamRef.get();

      if (!streamDoc.exists) {
        throw new HttpsError('not-found', 'Stream not found');
      }

      const stream = streamDoc.data();
      if (!stream) {
        throw new HttpsError('not-found', 'Stream data not found');
      }

      // Check stream is still live
      if (stream.status !== 'live' && stream.status !== 'scheduled') {
        throw new HttpsError('failed-precondition', 'Stream is no longer active');
      }

      // Check participant limit
      if (stream.participantIds.length >= MAX_COLLAB_PARTICIPANTS) {
        throw new HttpsError('resource-exhausted', 'Stream is full');
      }

      // Add participant
      await streamRef.update({
        participantIds: FieldValue.arrayUnion(uid),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Add to stream participants with co-host role
      await db.collection('stream_participants').doc(`${invite.streamId}_${uid}`).set({
        streamId: invite.streamId,
        userId: uid,
        role: 'co-host',
        status: 'active',
        joinedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update invite
      await inviteRef.update({
        status: 'accepted',
        respondedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Notify inviter
      await db.collection('notifications').doc().set({
        userId: invite.inviterId,
        type: 'collab_accepted',
        title: 'Collaboration Accepted',
        message: `${invite.inviteeName} accepted your collaboration invite!`,
        metadata: { streamId: invite.streamId },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        status: 'accepted',
        streamId: invite.streamId,
      };
    } else {
      // Decline invite
      await inviteRef.update({
        status: 'declined',
        respondedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Notify inviter
      await db.collection('notifications').doc().set({
        userId: invite.inviterId,
        type: 'collab_declined',
        title: 'Collaboration Declined',
        message: `${invite.inviteeName} declined your collaboration invite.`,
        metadata: { streamId: invite.streamId },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        status: 'declined',
      };
    }
  }
);

/**
 * Leave a collab stream
 */
export const leaveCollabStream = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { streamId } = request.data;

    const streamRef = db.collection('live_streams').doc(streamId);
    const streamDoc = await streamRef.get();

    if (!streamDoc.exists) {
      throw new HttpsError('not-found', 'Stream not found');
    }

    const stream = streamDoc.data();
    if (!stream) {
      throw new HttpsError('not-found', 'Stream data not found');
    }

    // Host cannot leave (must end stream instead)
    if (stream.hostId === uid) {
      throw new HttpsError('failed-precondition', 'Host must end stream instead of leaving');
    }

    // Remove from participants
    await streamRef.update({
      participantIds: FieldValue.arrayRemove(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update participant status
    await db.collection('stream_participants').doc(`${streamId}_${uid}`).update({
      status: 'left',
      leftAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

/**
 * Get collab stream participants
 */
export const getCollabParticipants = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { streamId } = request.data;

    const participantsSnap = await db.collection('stream_participants')
      .where('streamId', '==', streamId)
      .where('status', '==', 'active')
      .get();

    const participants: CollabParticipant[] = [];

    for (const doc of participantsSnap.docs) {
      const data = doc.data();
      const userDoc = await db.collection('users').doc(data.userId).get();
      const userData = userDoc.data();

      participants.push({
        userId: data.userId,
        userName: userData?.name || 'Unknown',
        userAvatar: userData?.photos?.[0],
        role: data.role || 'guest',
        joinedAt: data.joinedAt,
        isActive: true,
      });
    }

    return {
      success: true,
      participants,
    };
  }
);

/**
 * Validate collab stream before creation/update
 */
export async function validateCollabStream(
  category: string,
  title: string,
  description?: string
): Promise<{ isValid: boolean; reason?: string }> {
  // Check category is allowed
  if (!ALLOWED_COLLAB_CATEGORIES.includes(category)) {
    return {
      isValid: false,
      reason: `Category ${category} does not support collaborative streams`,
    };
  }

  // Check for forbidden terms (romantic/sexual content)
  const forbiddenTerms = [
    'couple', 'dating', 'romantic', 'boyfriend', 'girlfriend',
    'kiss', 'love', 'flirt', 'seduce', 'intimate', 'erotic',
    'sexy', 'hot', 'cute together', 'relationship goals'
  ];

  const combinedText = `${title} ${description || ''}`.toLowerCase();

  for (const term of forbiddenTerms) {
    if (combinedText.includes(term)) {
      return {
        isValid: false,
        reason: `Collaborative streams cannot contain romantic or intimate themes. Term: "${term}"`,
      };
    }
  }

  return { isValid: true };
}