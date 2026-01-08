/**
 * PACK 139: Avalo Social Clubs & Private Communities
 * Backend Firebase Functions for topic-driven social clubs
 * 
 * SAFETY GUARANTEES:
 * - No dating/romance/NSFW groups
 * - No visibility/ranking advantages
 * - No token bonuses or giveaways
 * - 65/35 split for token-gated clubs
 * - No external payment links
 * - No emotional labor/companionship loops
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  Club,
  ClubMember,
  ClubPost,
  ClubThread,
  ClubEvent,
  ClubAnalytics,
  ClubCategory,
  ClubAccessType,
  ClubRole,
  ClubStatus,
  ClubPostType,
  CreateClubRequest,
  UpdateClubRequest,
  JoinClubRequest,
  LeaveClubRequest,
  CreateClubPostRequest,
  BanClubUserRequest,
  AssignModeratorRequest,
  HostClubEventRequest,
  ClubResponse,
  validateClubContent,
  validateClubPostContent,
  calculateRetentionRate,
} from './types/clubs.types';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================
// CLUB MANAGEMENT FUNCTIONS
// ============================================

/**
 * Create a new club
 * Verified creators only
 */
export const createClub = functions.https.onCall(
  async (data: CreateClubRequest, context): Promise<ClubResponse<{ clubId: string }>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;

      // Get user profile
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
      }

      const userData = userDoc.data()!;

      // Verify creator status
      if (!userData.isCreator || !userData.earnFromChat) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only verified creators can create clubs'
        );
      }

      // Validate input
      if (!data.name || data.name.length < 5 || data.name.length > 100) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Club name must be 5-100 characters'
        );
      }

      if (!data.description || data.description.length < 20 || data.description.length > 1000) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Description must be 20-1000 characters'
        );
      }

      // Validate pricing for token-gated clubs
      if (data.accessType === ClubAccessType.TOKEN_GATED) {
        if (data.entryTokens < 1 || data.entryTokens > 5000) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            'Entry tokens must be 1-5000 for token-gated clubs'
          );
        }
      } else {
        data.entryTokens = 0;
      }

      // Validate max members
      if (data.maxMembers && (data.maxMembers < 2 || data.maxMembers > 10000)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Max members must be 2-10000'
        );
      }

      // SAFETY: Validate content for NSFW/forbidden content
      const validation = validateClubContent(
        data.name,
        data.description,
        data.category,
        data.rules
      );

      if (!validation.isValid) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Club blocked: ${validation.violations.join(', ')}`
        );
      }

      // Generate club ID
      const clubId = generateId();

      // Create club document
      const club: Club = {
        clubId,
        ownerId: userId,
        ownerName: userData.displayName || userData.username || 'Creator',
        ownerAvatar: userData.profileImage || undefined,
        name: data.name.trim(),
        description: data.description.trim(),
        category: data.category,
        accessType: data.accessType,
        entryTokens: data.entryTokens,
        memberCount: 1, // Owner is first member
        maxMembers: data.maxMembers,
        status: ClubStatus.ACTIVE,
        isActive: true,
        containsNSFW: validation.containsNSFW,
        containsForbiddenContent: validation.containsForbiddenContent,
        totalRevenue: 0,
        platformFee: 0,
        ownerEarnings: 0,
        isPublic: data.isPublic,
        tags: data.tags || [],
        rules: data.rules?.trim(),
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };

      await db.collection('clubs').doc(clubId).set(club);

      // Add owner as first member
      const ownerMemberId = `${userId}_${clubId}`;
      const ownerMember: ClubMember = {
        memberId: ownerMemberId,
        clubId,
        clubName: club.name,
        userId,
        userName: club.ownerName,
        userAvatar: club.ownerAvatar,
        role: ClubRole.OWNER,
        paidTokens: 0,
        platformFee: 0,
        ownerEarnings: 0,
        joinedAt: serverTimestamp() as Timestamp,
        lastActiveAt: serverTimestamp() as Timestamp,
        isActive: true,
        isBanned: false,
      };

      await db.collection('club_members').doc(ownerMemberId).set(ownerMember);

      return {
        success: true,
        data: { clubId },
        message: 'Club created successfully',
      };
    } catch (error: any) {
      console.error('Error creating club:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to create club');
    }
  }
);

/**
 * Update club details
 * Owner only
 */
export const updateClubDetails = functions.https.onCall(
  async (data: UpdateClubRequest, context): Promise<ClubResponse> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { clubId } = data;

      // Get club
      const clubDoc = await db.collection('clubs').doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
      }

      const club = clubDoc.data() as Club;

      // Verify owner
      if (club.ownerId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Only club owner can update details');
      }

      // Build update object
      const updates: Partial<Club> = {
        updatedAt: serverTimestamp() as Timestamp,
      };

      if (data.description) {
        if (data.description.length < 20 || data.description.length > 1000) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            'Description must be 20-1000 characters'
          );
        }

        // Validate new description
        const validation = validateClubContent(
          club.name,
          data.description,
          club.category,
          data.rules
        );

        if (!validation.isValid) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            `Update blocked: ${validation.violations.join(', ')}`
          );
        }

        updates.description = data.description.trim();
      }

      if (data.rules) {
        updates.rules = data.rules.trim();
      }

      if (data.maxMembers !== undefined) {
        if (data.maxMembers < club.memberCount) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            'Cannot set max members below current member count'
          );
        }
        updates.maxMembers = data.maxMembers;
      }

      if (data.status) {
        updates.status = data.status;
        updates.isActive = data.status === ClubStatus.ACTIVE;
      }

      await db.collection('clubs').doc(clubId).update(updates);

      return {
        success: true,
        message: 'Club updated successfully',
      };
    } catch (error: any) {
      console.error('Error updating club:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to update club');
    }
  }
);

/**
 * Join a club
 * Handles payment for token-gated clubs
 */
export const joinClub = functions.https.onCall(
  async (data: JoinClubRequest, context): Promise<ClubResponse<{ memberId: string }>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { clubId } = data;

      // Get club
      const clubDoc = await db.collection('clubs').doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
      }

      const club = clubDoc.data() as Club;

      // Validate club status
      if (club.status !== ClubStatus.ACTIVE || !club.isActive) {
        throw new functions.https.HttpsError('failed-precondition', 'Club is not active');
      }

      // Check capacity
      if (club.maxMembers && club.memberCount >= club.maxMembers) {
        throw new functions.https.HttpsError('failed-precondition', 'Club is full');
      }

      // Cannot join own club (owner is already a member)
      const memberId = `${userId}_${clubId}`;
      const existingMember = await db.collection('club_members').doc(memberId).get();
      
      if (existingMember.exists) {
        throw new functions.https.HttpsError('already-exists', 'Already a member of this club');
      }

      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;

      // Handle payment for token-gated clubs
      let transactionId: string | undefined;
      let platformFee = 0;
      let ownerEarnings = 0;

      if (club.accessType === ClubAccessType.TOKEN_GATED && club.entryTokens > 0) {
        const userTokens = userData.tokenBalance || 0;

        if (userTokens < club.entryTokens) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Insufficient tokens. Need ${club.entryTokens}, have ${userTokens}`
          );
        }

        // Calculate split (65/35)
        platformFee = Math.floor(club.entryTokens * 0.35);
        ownerEarnings = club.entryTokens - platformFee;

        // Process payment in transaction
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          const ownerRef = db.collection('users').doc(club.ownerId);
          const clubRef = db.collection('clubs').doc(clubId);

          const userSnapshot = await transaction.get(userRef);
          const currentBalance = userSnapshot.data()?.tokenBalance || 0;

          if (currentBalance < club.entryTokens) {
            throw new Error('Insufficient tokens');
          }

          // Deduct from user
          transaction.update(userRef, {
            tokenBalance: increment(-club.entryTokens),
          });

          // Add to owner
          transaction.update(ownerRef, {
            tokenBalance: increment(ownerEarnings),
            lifetimeEarnings: increment(ownerEarnings),
          });

          // Update club revenue
          transaction.update(clubRef, {
            totalRevenue: increment(club.entryTokens),
            platformFee: increment(platformFee),
            ownerEarnings: increment(ownerEarnings),
            memberCount: increment(1),
          });

          // Create transaction record
          transactionId = generateId();
          const transactionRecord = {
            transactionId,
            type: 'CLUB_ENTRY',
            fromUserId: userId,
            toUserId: club.ownerId,
            amount: club.entryTokens,
            platformFee,
            ownerEarnings,
            clubId,
            createdAt: serverTimestamp(),
          };
          transaction.set(db.collection('transactions').doc(transactionId), transactionRecord);
        });
      } else {
        // Free club - just increment members
        await db.collection('clubs').doc(clubId).update({
          memberCount: increment(1),
        });
      }

      // Create member record
      const member: ClubMember = {
        memberId,
        clubId,
        clubName: club.name,
        userId,
        userName: userData.displayName || userData.username || 'User',
        userAvatar: userData.profileImage,
        role: ClubRole.MEMBER,
        paidTokens: club.accessType === ClubAccessType.TOKEN_GATED ? club.entryTokens : 0,
        platformFee,
        ownerEarnings,
        transactionId,
        joinedAt: serverTimestamp() as Timestamp,
        lastActiveAt: serverTimestamp() as Timestamp,
        isActive: true,
        isBanned: false,
      };

      await db.collection('club_members').doc(memberId).set(member);

      return {
        success: true,
        data: { memberId },
        message: 'Successfully joined club',
      };
    } catch (error: any) {
      console.error('Error joining club:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to join club');
    }
  }
);

/**
 * Leave a club
 * No refund policy
 */
export const leaveClub = functions.https.onCall(
  async (data: LeaveClubRequest, context): Promise<ClubResponse> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { clubId } = data;

      const memberId = `${userId}_${clubId}`;
      const memberDoc = await db.collection('club_members').doc(memberId).get();

      if (!memberDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Not a member of this club');
      }

      const member = memberDoc.data() as ClubMember;

      // Owner cannot leave (must delete club instead)
      if (member.role === ClubRole.OWNER) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Club owner cannot leave. Delete the club instead.'
        );
      }

      // Remove member
      await db.collection('club_members').doc(memberId).delete();

      // Decrement member count
      await db.collection('clubs').doc(clubId).update({
        memberCount: increment(-1),
      });

      return {
        success: true,
        message: 'Left club successfully. Note: No refund for paid clubs.',
      };
    } catch (error: any) {
      console.error('Error leaving club:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to leave club');
    }
  }
);

/**
 * Post to club
 * Members only, with NSFW validation
 */
export const postToClub = functions.https.onCall(
  async (data: CreateClubPostRequest, context): Promise<ClubResponse<{ postId: string }>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { clubId, type, content, mediaUrl, resourceUrl, pollQuestion, pollOptions } = data;

      // Verify membership
      const memberId = `${userId}_${clubId}`;
      const memberDoc = await db.collection('club_members').doc(memberId).get();

      if (!memberDoc.exists) {
        throw new functions.https.HttpsError('permission-denied', 'Must be a club member to post');
      }

      const member = memberDoc.data() as ClubMember;

      if (!member.isActive || member.isBanned) {
        throw new functions.https.HttpsError('permission-denied', 'Cannot post to this club');
      }

      // Validate content
      if (content) {
        const contentValidation = validateClubPostContent(content, type);
        if (!contentValidation.isValid) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            `Post blocked: ${contentValidation.violations.join(', ')}`
          );
        }
      }

      // Validate poll if applicable
      if (type === ClubPostType.POLL) {
        if (!pollQuestion || !pollOptions || pollOptions.length < 2 || pollOptions.length > 10) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            'Polls must have a question and 2-10 options'
          );
        }
      }

      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data()!;

      // Create post
      const postId = generateId();
      const post: ClubPost = {
        postId,
        clubId,
        userId,
        userName: userData.displayName || userData.username || 'User',
        userAvatar: userData.profileImage,
        type,
        content: content?.trim(),
        mediaUrl,
        resourceUrl,
        pollQuestion,
        pollOptions,
        pollVotes: type === ClubPostType.POLL ? {} : undefined,
        likesCount: 0,
        commentsCount: 0,
        isVisible: true,
        containsNSFW: false,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };

      await db.collection('club_posts').doc(postId).set(post);

      // Update member last active
      await db.collection('club_members').doc(memberId).update({
        lastActiveAt: serverTimestamp(),
      });

      return {
        success: true,
        data: { postId },
        message: 'Post created successfully',
      };
    } catch (error: any) {
      console.error('Error creating club post:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to create post');
    }
  }
);

/**
 * Host a club event
 * Integration with PACK 117
 */
export const hostClubEvent = functions.https.onCall(
  async (data: HostClubEventRequest, context): Promise<ClubResponse<{ eventId: string }>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { clubId, title, description, startTime, endTime, maxAttendees } = data;

      // Verify membership and moderator/owner status
      const memberId = `${userId}_${clubId}`;
      const memberDoc = await db.collection('club_members').doc(memberId).get();

      if (!memberDoc.exists) {
        throw new functions.https.HttpsError('permission-denied', 'Must be a club member');
      }

      const member = memberDoc.data() as ClubMember;

      if (member.role !== ClubRole.OWNER && member.role !== ClubRole.MODERATOR) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only owners and moderators can host events'
        );
      }

      // Validate input
      if (!title || title.length < 5 || title.length > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'Title must be 5-100 characters');
      }

      if (!description || description.length < 20 || description.length > 500) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Description must be 20-500 characters'
        );
      }

      const startTimestamp = Timestamp.fromDate(new Date(startTime));
      const endTimestamp = Timestamp.fromDate(new Date(endTime));

      if (startTimestamp.toMillis() >= endTimestamp.toMillis()) {
        throw new functions.https.HttpsError('invalid-argument', 'End time must be after start time');
      }

      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data()!;

      // Create event
      const eventId = generateId();
      const event: ClubEvent = {
        eventId,
        clubId,
        hostUserId: userId,
        hostName: userData.displayName || userData.username || 'Host',
        title: title.trim(),
        description: description.trim(),
        startTime: startTimestamp,
        endTime: endTimestamp,
        attendeesCount: 0,
        maxAttendees,
        createdAt: serverTimestamp() as Timestamp,
      };

      await db.collection('club_events').doc(eventId).set(event);

      return {
        success: true,
        data: { eventId },
        message: 'Event created successfully',
      };
    } catch (error: any) {
      console.error('Error hosting club event:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to host event');
    }
  }
);

/**
 * Ban user from club
 * Owner and moderators only
 */
export const banClubUser = functions.https.onCall(
  async (data: BanClubUserRequest, context): Promise<ClubResponse> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const requesterId = context.auth.uid;
      const { clubId, userId, reason } = data;

      // Verify requester is owner or moderator
      const requesterMemberId = `${requesterId}_${clubId}`;
      const requesterDoc = await db.collection('club_members').doc(requesterMemberId).get();

      if (!requesterDoc.exists) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized');
      }

      const requester = requesterDoc.data() as ClubMember;

      if (requester.role !== ClubRole.OWNER && requester.role !== ClubRole.MODERATOR) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only owners and moderators can ban users'
        );
      }

      // Cannot ban owner
      const targetMemberId = `${userId}_${clubId}`;
      const targetDoc = await db.collection('club_members').doc(targetMemberId).get();

      if (!targetDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User is not a member');
      }

      const target = targetDoc.data() as ClubMember;

      if (target.role === ClubRole.OWNER) {
        throw new functions.https.HttpsError('permission-denied', 'Cannot ban club owner');
      }

      // Ban user
      await db.collection('club_members').doc(targetMemberId).update({
        isBanned: true,
        isActive: false,
        banReason: reason,
      });

      return {
        success: true,
        message: 'User banned from club',
      };
    } catch (error: any) {
      console.error('Error banning user:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to ban user');
    }
  }
);

/**
 * Assign moderator role
 * Owner only
 */
export const assignClubModerator = functions.https.onCall(
  async (data: AssignModeratorRequest, context): Promise<ClubResponse> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const ownerId = context.auth.uid;
      const { clubId, userId } = data;

      // Verify requester is owner
      const clubDoc = await db.collection('clubs').doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
      }

      const club = clubDoc.data() as Club;

      if (club.ownerId !== ownerId) {
        throw new functions.https.HttpsError('permission-denied', 'Only club owner can assign moderators');
      }

      // Verify target is a member
      const targetMemberId = `${userId}_${clubId}`;
      const targetDoc = await db.collection('club_members').doc(targetMemberId).get();

      if (!targetDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User is not a club member');
      }

      // Update role
      await db.collection('club_members').doc(targetMemberId).update({
        role: ClubRole.MODERATOR,
      });

      // Create moderator record
      const moderatorId = `${userId}_${clubId}`;
      await db.collection('club_moderators').doc(moderatorId).set({
        moderatorId,
        clubId,
        userId,
        assignedAt: serverTimestamp(),
        isActive: true,
      });

      return {
        success: true,
        message: 'Moderator assigned successfully',
      };
    } catch (error: any) {
      console.error('Error assigning moderator:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to assign moderator');
    }
  }
);

// ============================================
// QUERY FUNCTIONS
// ============================================

/**
 * Get club details
 */
export const getClubDetails = functions.https.onCall(
  async (data: { clubId: string }, context): Promise<ClubResponse<Club>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { clubId } = data;

      const clubDoc = await db.collection('clubs').doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
      }

      const club = clubDoc.data() as Club;

      return {
        success: true,
        data: club,
      };
    } catch (error: any) {
      console.error('Error getting club details:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get club details');
    }
  }
);

/**
 * List clubs by category
 */
export const listClubs = functions.https.onCall(
  async (
    data: { category?: ClubCategory; limit?: number },
    context
  ): Promise<ClubResponse<Club[]>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { category, limit = 50 } = data;
      const actualLimit = Math.min(Math.max(limit, 1), 100);

      let query = db
        .collection('clubs')
        .where('status', '==', ClubStatus.ACTIVE)
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(actualLimit);

      if (category) {
        query = query.where('category', '==', category) as any;
      }

      const snapshot = await query.get();
      const clubs = snapshot.docs.map((doc) => doc.data() as Club);

      return {
        success: true,
        data: clubs,
      };
    } catch (error: any) {
      console.error('Error listing clubs:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to list clubs');
    }
  }
);

/**
 * Get user's clubs
 */
export const getMyClubs = functions.https.onCall(
  async (data: {}, context): Promise<ClubResponse<ClubMember[]>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;

      const snapshot = await db
        .collection('club_members')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .orderBy('joinedAt', 'desc')
        .get();

      const memberships = snapshot.docs.map((doc) => doc.data() as ClubMember);

      return {
        success: true,
        data: memberships,
      };
    } catch (error: any) {
      console.error('Error getting my clubs:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get clubs');
    }
  }
);

/**
 * Get club posts (feed)
 */
export const getClubPosts = functions.https.onCall(
  async (
    data: { clubId: string; limit?: number },
    context
  ): Promise<ClubResponse<ClubPost[]>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { clubId, limit = 50 } = data;
      const actualLimit = Math.min(Math.max(limit, 1), 100);

      // Verify membership
      const memberId = `${context.auth.uid}_${clubId}`;
      const memberDoc = await db.collection('club_members').doc(memberId).get();

      if (!memberDoc.exists) {
        throw new functions.https.HttpsError('permission-denied', 'Must be a club member');
      }

      const snapshot = await db
        .collection('club_posts')
        .where('clubId', '==', clubId)
        .where('isVisible', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(actualLimit)
        .get();

      const posts = snapshot.docs.map((doc) => doc.data() as ClubPost);

      return {
        success: true,
        data: posts,
      };
    } catch (error: any) {
      console.error('Error getting club posts:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get posts');
    }
  }
);

/**
 * Get club analytics (owner only, non-competitive)
 */
export const getClubAnalytics = functions.https.onCall(
  async (data: { clubId: string }, context): Promise<ClubResponse<ClubAnalytics>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { clubId } = data;

      // Verify owner
      const clubDoc = await db.collection('clubs').doc(clubId).get();
      if (!clubDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
      }

      const club = clubDoc.data() as Club;

      if (club.ownerId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Only club owner can view analytics');
      }

      // Get member count
      const membersSnapshot = await db
        .collection('club_members')
        .where('clubId', '==', clubId)
        .where('isActive', '==', true)
        .get();

      const memberCount = membersSnapshot.size;

      // Get active members (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoTimestamp = Timestamp.fromDate(thirtyDaysAgo);

      const activeMembers = membersSnapshot.docs.filter((doc) => {
        const member = doc.data() as ClubMember;
        return member.lastActiveAt.toMillis() >= thirtyDaysAgoTimestamp.toMillis();
      });

      const retentionRate = calculateRetentionRate(memberCount, activeMembers.length);

      // Get post stats
      const allPostsSnapshot = await db
        .collection('club_posts')
        .where('clubId', '==', clubId)
        .get();

      const postsTotal = allPostsSnapshot.size;

      const recentPosts = allPostsSnapshot.docs.filter((doc) => {
        const post = doc.data() as ClubPost;
        return post.createdAt.toMillis() >= thirtyDaysAgoTimestamp.toMillis();
      });

      const postsLast30Days = recentPosts.length;

      // Get event attendance
      const eventsSnapshot = await db
        .collection('club_events')
        .where('clubId', '==', clubId)
        .get();

      const eventAttendanceTotal = eventsSnapshot.docs.reduce(
        (sum, doc) => sum + (doc.data() as ClubEvent).attendeesCount,
        0
      );

      // Calculate average revenue per member
      const averageRevenuePerMember =
        memberCount > 0 ? Math.round(club.totalRevenue / memberCount) : 0;

      const analytics: ClubAnalytics = {
        clubId,
        ownerId: userId,
        memberCount,
        retentionRate,
        postsTotal,
        postsLast30Days,
        eventAttendanceTotal,
        totalRevenue: club.totalRevenue,
        averageRevenuePerMember,
        lastUpdatedAt: serverTimestamp() as Timestamp,
      };

      return {
        success: true,
        data: analytics,
      };
    } catch (error: any) {
      console.error('Error getting club analytics:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get analytics');
    }
  }
);