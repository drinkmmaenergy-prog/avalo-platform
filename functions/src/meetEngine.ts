import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { MeetProfile, MeetBooking, MeetDispute, MeetType, MeetStatus, DisputeStatus } from './types/meet';

const db = admin.firestore();

export async function createMeetProfile(params: {
  userId: string;
  realMeetEnabled: boolean;
  socialMeetEnabled: boolean;
  realMeetPrice: number;
  socialMeetPrice: number;
  bio: string;
  rules: string;
}): Promise<{ success: boolean; profileId?: string; error?: string }> {
  try {
    const { userId, realMeetEnabled, socialMeetEnabled, realMeetPrice, socialMeetPrice, bio, rules } = params;

    // Phase 30A: TrustShield 2.0 - Content Moderation for bio and rules
    try {
      const { moderateText, logModerationIncident } = await import('./contentModerationEngine');
      
      // Check bio
      const bioModeration = await moderateText({
        userId,
        text: bio,
        source: 'meet_bio',
      });
      
      if (bioModeration.actions.includes('BLOCK_CONTENT')) {
        await logModerationIncident({ userId, text: bio, source: 'meet_bio' }, bioModeration);
        return { success: false, error: 'CONTENT_BLOCKED_POLICY_VIOLATION' };
      }
      
      if (bioModeration.actions.includes('ALLOW_AND_LOG') || bioModeration.actions.includes('FLAG_FOR_REVIEW')) {
        logModerationIncident({ userId, text: bio, source: 'meet_bio' }, bioModeration).catch(() => {});
      }
      
      // Check rules
      const rulesModeration = await moderateText({
        userId,
        text: rules,
        source: 'meet_rules',
      });
      
      if (rulesModeration.actions.includes('BLOCK_CONTENT')) {
        await logModerationIncident({ userId, text: rules, source: 'meet_rules' }, rulesModeration);
        return { success: false, error: 'CONTENT_BLOCKED_POLICY_VIOLATION' };
      }
      
      if (rulesModeration.actions.includes('ALLOW_AND_LOG') || rulesModeration.actions.includes('FLAG_FOR_REVIEW')) {
        logModerationIncident({ userId, text: rules, source: 'meet_rules' }, rulesModeration).catch(() => {});
      }
    } catch (error) {
      console.error('Content moderation check failed:', error);
      // Non-blocking - continue if moderation fails
    }

    if (!realMeetEnabled && !socialMeetEnabled) {
      return { success: false, error: 'At least one meet type must be enabled' };
    }

    if (realMeetEnabled && (realMeetPrice < 1000 || realMeetPrice > 25000)) {
      return { success: false, error: 'Real Meet price must be between 1000-25000 tokens' };
    }

    if (socialMeetEnabled && (socialMeetPrice < 600 || socialMeetPrice > 8000)) {
      return { success: false, error: 'Social Meet price must be between 600-8000 tokens' };
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    if (!userData?.profileComplete || !userData?.verified || !userData?.age || userData.age < 18) {
      return { success: false, error: 'Profile must be completed, verified, and user must be 18+' };
    }

    if (userData?.accountStatus !== 'active') {
      return { success: false, error: 'Account must be active' };
    }

    const profileData: Omit<MeetProfile, 'availability'> & { availability: string[] } = {
      userId,
      enabled: true,
      realMeetEnabled,
      socialMeetEnabled,
      realMeetPrice,
      socialMeetPrice,
      bio,
      rules,
      availability: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const profileRef = db.collection('meetProfiles').doc(userId);
    await profileRef.set(profileData);

    return { success: true, profileId: userId };
  } catch (error: any) {
    console.error('Error creating meet profile:', error);
    return { success: false, error: error.message };
  }
}

export async function updateMeetProfile(params: {
  userId: string;
  realMeetEnabled?: boolean;
  socialMeetEnabled?: boolean;
  realMeetPrice?: number;
  socialMeetPrice?: number;
  bio?: string;
  rules?: string;
  enabled?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId, ...updates } = params;

    // Phase 30A: TrustShield 2.0 - Content Moderation for bio and rules updates
    try {
      const { moderateText, logModerationIncident } = await import('./contentModerationEngine');
      
      // Check bio if provided
      if (updates.bio) {
        const bioModeration = await moderateText({
          userId,
          text: updates.bio,
          source: 'meet_bio',
        });
        
        if (bioModeration.actions.includes('BLOCK_CONTENT')) {
          await logModerationIncident({ userId, text: updates.bio, source: 'meet_bio' }, bioModeration);
          return { success: false, error: 'CONTENT_BLOCKED_POLICY_VIOLATION' };
        }
        
        if (bioModeration.actions.includes('ALLOW_AND_LOG') || bioModeration.actions.includes('FLAG_FOR_REVIEW')) {
          logModerationIncident({ userId, text: updates.bio, source: 'meet_bio' }, bioModeration).catch(() => {});
        }
      }
      
      // Check rules if provided
      if (updates.rules) {
        const rulesModeration = await moderateText({
          userId,
          text: updates.rules,
          source: 'meet_rules',
        });
        
        if (rulesModeration.actions.includes('BLOCK_CONTENT')) {
          await logModerationIncident({ userId, text: updates.rules, source: 'meet_rules' }, rulesModeration);
          return { success: false, error: 'CONTENT_BLOCKED_POLICY_VIOLATION' };
        }
        
        if (rulesModeration.actions.includes('ALLOW_AND_LOG') || rulesModeration.actions.includes('FLAG_FOR_REVIEW')) {
          logModerationIncident({ userId, text: updates.rules, source: 'meet_rules' }, rulesModeration).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Content moderation check failed:', error);
      // Non-blocking - continue if moderation fails
    }

    const profileRef = db.collection('meetProfiles').doc(userId);
    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
      return { success: false, error: 'Meet profile not found' };
    }

    if (updates.realMeetPrice !== undefined && (updates.realMeetPrice < 1000 || updates.realMeetPrice > 25000)) {
      return { success: false, error: 'Real Meet price must be between 1000-25000 tokens' };
    }

    if (updates.socialMeetPrice !== undefined && (updates.socialMeetPrice < 600 || updates.socialMeetPrice > 8000)) {
      return { success: false, error: 'Social Meet price must be between 600-8000 tokens' };
    }

    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.now(),
    };

    await profileRef.update(updateData);

    return { success: true };
  } catch (error: any) {
    console.error('Error updating meet profile:', error);
    return { success: false, error: error.message };
  }
}

export async function listMeetHosts(params: {
  meetType?: MeetType;
  limit?: number;
  offset?: number;
}): Promise<{ success: boolean; hosts?: any[]; error?: string }> {
  try {
    const { meetType, limit = 20, offset = 0 } = params;

    let query = db.collection('meetProfiles').where('enabled', '==', true);

    if (meetType === 'real_meet') {
      query = query.where('realMeetEnabled', '==', true);
    } else if (meetType === 'social_meet') {
      query = query.where('socialMeetEnabled', '==', true);
    }

    const snapshot = await query.limit(limit).offset(offset).get();

    const hosts = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const profile = doc.data();
        const userDoc = await db.collection('users').doc(profile.userId).get();
        const userData = userDoc.data();

        return {
          userId: profile.userId,
          displayName: userData?.displayName || 'Użytkownik',
          photoURL: userData?.photoURL || null,
          realMeetEnabled: profile.realMeetEnabled,
          socialMeetEnabled: profile.socialMeetEnabled,
          realMeetPrice: profile.realMeetPrice,
          socialMeetPrice: profile.socialMeetPrice,
          bio: profile.bio,
        };
      })
    );

    return { success: true, hosts };
  } catch (error: any) {
    console.error('Error listing meet hosts:', error);
    return { success: false, error: error.message };
  }
}

export async function bookMeet(params: {
  guestId: string;
  hostId: string;
  meetType: MeetType;
  scheduledDate: Date;
  location?: string;
  notes?: string;
  deviceId?: string;
  ipHash?: string;
}): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  try {
    const { guestId, hostId, meetType, scheduledDate, location, notes } = params;

    if (guestId === hostId) {
      return { success: false, error: 'Cannot book meeting with yourself' };
    }

    const guestDoc = await db.collection('users').doc(guestId).get();
    if (!guestDoc.exists) {
      return { success: false, error: 'Guest user not found' };
    }

    const guestData = guestDoc.data();
    if (!guestData?.profileComplete || !guestData?.verified || !guestData?.age || guestData.age < 18) {
      return { success: false, error: 'Guest profile must be completed, verified, and user must be 18+' };
    }

    if (guestData?.accountStatus !== 'active') {
      return { success: false, error: 'Guest account must be active' };
    }

    const hostProfileDoc = await db.collection('meetProfiles').doc(hostId).get();
    if (!hostProfileDoc.exists) {
      return { success: false, error: 'Host profile not found' };
    }

    const hostProfile = hostProfileDoc.data() as MeetProfile;
    if (!hostProfile.enabled) {
      return { success: false, error: 'Host has disabled bookings' };
    }

    if (meetType === 'real_meet' && !hostProfile.realMeetEnabled) {
      return { success: false, error: 'Host does not offer Real Meet' };
    }

    if (meetType === 'social_meet' && !hostProfile.socialMeetEnabled) {
      return { success: false, error: 'Host does not offer Social Meet' };
    }

    const price = meetType === 'real_meet' ? hostProfile.realMeetPrice : hostProfile.socialMeetPrice;
    const avaloFee = Math.floor(price * 0.2);
    const escrowAmount = Math.floor(price * 0.8);

    const guestWalletRef = db.collection('balances').doc(guestId).collection('wallet').doc('wallet');
    const guestWalletDoc = await guestWalletRef.get();

    if (!guestWalletDoc.exists) {
      return { success: false, error: 'Guest wallet not found' };
    }

    const guestBalance = guestWalletDoc.data()?.tokens || 0;
    if (guestBalance < price) {
      return { success: false, error: 'Insufficient balance' };
    }

    const bookingRef = db.collection('meetBookings').doc();
    const bookingId = bookingRef.id;

    const bookingData: MeetBooking = {
      bookingId,
      meetType,
      hostId,
      guestId,
      price,
      escrowAmount,
      avaloFee,
      status: 'booked',
      scheduledDate: Timestamp.fromDate(scheduledDate),
      location: meetType === 'real_meet' ? location : undefined,
      notes,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(guestWalletRef);
      const currentBalance = walletDoc.data()?.tokens || 0;

      if (currentBalance < price) {
        throw new Error('Insufficient balance');
      }

      transaction.update(guestWalletRef, {
        tokens: admin.firestore.FieldValue.increment(-price),
        wallet_locked: admin.firestore.FieldValue.increment(escrowAmount),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.set(bookingRef, bookingData);

      const transactionRef = db.collection('transactions').doc();
      transaction.set(transactionRef, {
        senderUid: guestId,
        receiverUid: hostId,
        tokensAmount: price,
        avaloFee,
        escrowAmount,
        bookingId,
        transactionType: 'meet_booking',
        meetType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const avaloTransactionRef = db.collection('transactions').doc();
      transaction.set(avaloTransactionRef, {
        senderUid: guestId,
        receiverUid: 'avalo_platform',
        tokensAmount: avaloFee,
        bookingId,
        transactionType: 'meet_avalo_fee',
        meetType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, bookingId };
  } catch (error: any) {
    console.error('Error booking meet:', error);
    return { success: false, error: error.message };
  }
}

export async function cancelMeet(params: {
  userId: string;
  bookingId: string;
  reason?: string;
}): Promise<{ success: boolean; refundAmount?: number; error?: string }> {
  try {
    const { userId, bookingId, reason } = params;

    const bookingRef = db.collection('meetBookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingDoc.data() as MeetBooking;

    if (booking.status !== 'booked') {
      return { success: false, error: 'Booking cannot be cancelled' };
    }

    const isHost = userId === booking.hostId;
    const isGuest = userId === booking.guestId;

    if (!isHost && !isGuest) {
      return { success: false, error: 'Unauthorized' };
    }

    let refundAmount = 0;

    await db.runTransaction(async (transaction) => {
      if (isGuest) {
        refundAmount = 0;
        const avaloWalletRef = db.collection('balances').doc('avalo_platform').collection('wallet').doc('wallet');
        transaction.update(avaloWalletRef, {
          tokens: admin.firestore.FieldValue.increment(booking.escrowAmount),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        refundAmount = booking.price;
        const guestWalletRef = db.collection('balances').doc(booking.guestId).collection('wallet').doc('wallet');
        transaction.update(guestWalletRef, {
          tokens: admin.firestore.FieldValue.increment(booking.price),
          wallet_locked: admin.firestore.FieldValue.increment(-booking.escrowAmount),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      transaction.update(bookingRef, {
        status: 'cancelled',
        cancelledAt: Timestamp.now(),
        cancelledBy: userId,
        updatedAt: Timestamp.now(),
      });

      const cancelTransactionRef = db.collection('transactions').doc();
      transaction.set(cancelTransactionRef, {
        senderUid: userId,
        receiverUid: isHost ? booking.guestId : 'avalo_platform',
        tokensAmount: refundAmount,
        bookingId,
        transactionType: 'meet_cancellation',
        reason,
        cancelledBy: isHost ? 'host' : 'guest',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, refundAmount };
  } catch (error: any) {
    console.error('Error cancelling meet:', error);
    return { success: false, error: error.message };
  }
}

export async function confirmMeetComplete(params: {
  hostId: string;
  bookingId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { hostId, bookingId } = params;

    const bookingRef = db.collection('meetBookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingDoc.data() as MeetBooking;

    if (booking.hostId !== hostId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (booking.status !== 'booked') {
      return { success: false, error: 'Booking cannot be completed' };
    }

    await db.runTransaction(async (transaction) => {
      transaction.update(bookingRef, {
        status: 'waiting',
        updatedAt: Timestamp.now(),
      });
    });

    setTimeout(async () => {
      await autoSettleBooking(bookingId);
    }, 12 * 60 * 60 * 1000);

    return { success: true };
  } catch (error: any) {
    console.error('Error confirming meet complete:', error);
    return { success: false, error: error.message };
  }
}

export async function disputeMeet(params: {
  guestId: string;
  bookingId: string;
  reason: string;
  evidence?: string;
}): Promise<{ success: boolean; disputeId?: string; error?: string }> {
  try {
    const { guestId, bookingId, reason, evidence } = params;

    const bookingRef = db.collection('meetBookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingDoc.data() as MeetBooking;

    if (booking.guestId !== guestId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (booking.status !== 'waiting') {
      return { success: false, error: 'Disputes can only be filed during waiting period' };
    }

    const disputeRef = db.collection('meetDisputes').doc();
    const disputeId = disputeRef.id;

    const disputeData: MeetDispute = {
      disputeId,
      bookingId,
      reportedBy: guestId,
      reason,
      evidence,
      status: 'open',
      createdAt: Timestamp.now(),
    };

    await db.runTransaction(async (transaction) => {
      transaction.set(disputeRef, disputeData);
      transaction.update(bookingRef, {
        status: 'dispute',
        disputeId,
        updatedAt: Timestamp.now(),
      });
    });

    return { success: true, disputeId };
  } catch (error: any) {
    console.error('Error creating dispute:', error);
    return { success: false, error: error.message };
  }
}

export async function getBooking(bookingId: string): Promise<{ success: boolean; booking?: any; error?: string }> {
  try {
    const bookingDoc = await db.collection('meetBookings').doc(bookingId).get();

    if (!bookingDoc.exists) {
      return { success: false, error: 'Booking not found' };
    }

    const booking = bookingDoc.data();
    return { success: true, booking };
  } catch (error: any) {
    console.error('Error getting booking:', error);
    return { success: false, error: error.message };
  }
}

export async function getUserMeetings(params: {
  userId: string;
  role: 'host' | 'guest';
  limit?: number;
}): Promise<{ success: boolean; meetings?: any[]; error?: string }> {
  try {
    const { userId, role, limit = 20 } = params;

    const field = role === 'host' ? 'hostId' : 'guestId';
    const snapshot = await db.collection('meetBookings').where(field, '==', userId).orderBy('createdAt', 'desc').limit(limit).get();

    const meetings = snapshot.docs.map((doc) => ({
      bookingId: doc.id,
      ...doc.data(),
    }));

    return { success: true, meetings };
  } catch (error: any) {
    console.error('Error getting user meetings:', error);
    return { success: false, error: error.message };
  }
}

async function autoSettleBooking(bookingId: string): Promise<void> {
  try {
    const bookingRef = db.collection('meetBookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return;
    }

    const booking = bookingDoc.data() as MeetBooking;

    if (booking.status !== 'waiting') {
      return;
    }

    await db.runTransaction(async (transaction) => {
      const hostWalletRef = db.collection('balances').doc(booking.hostId).collection('wallet').doc('wallet');
      const guestWalletRef = db.collection('balances').doc(booking.guestId).collection('wallet').doc('wallet');

      transaction.update(hostWalletRef, {
        tokens: admin.firestore.FieldValue.increment(booking.escrowAmount),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(guestWalletRef, {
        wallet_locked: admin.firestore.FieldValue.increment(-booking.escrowAmount),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(bookingRef, {
        status: 'completed',
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const settlementTransactionRef = db.collection('transactions').doc();
      transaction.set(settlementTransactionRef, {
        senderUid: booking.guestId,
        receiverUid: booking.hostId,
        tokensAmount: booking.escrowAmount,
        bookingId,
        transactionType: 'meet_settlement',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    console.error('Error auto-settling booking:', error);
  }
}