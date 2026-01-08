import * as functions from 'firebase-functions';
import { db, FieldValue, timestamp as Timestamp } from '../init';

interface UserKPIMetrics {
  dau: number;
  wau: number;
  mau: number;
  registrations: number;
  profileCompletionRate: number;
  verificationSuccessRate: number;
  swipeToMatchConversion: number;
  discoveryToProfileOpenRate: number;
}

// Track user activity event
export const trackUserActivity = functions.firestore
  .document('users/{userId}/activity/{activityId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const activity = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Update user behavior tracking
      await db.collection('user_behavior').doc(userId).set({
        lastActivity: timestamp,
        lastActivityType: activity.type,
        updatedAt: timestamp
      }, { merge: true });

      // Increment DAU counter
      const dauRef = db.collection('analytics_daily').doc(`dau_${today}`);
      await dauRef.set({
        metric_type: 'dau',
        date: today,
        timestamp: timestamp,
        userIds: FieldValue.arrayUnion(userId)
      }, { merge: true });

      // Track activity event
      await db.collection('user_kpis').doc(userId).collection('events').add({
        type: activity.type,
        timestamp: timestamp,
        metadata: activity.metadata || {}
      });

    } catch (error) {
      console.error('Error tracking user activity:', error);
    }
  });

// Track registration funnel
export const trackRegistration = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const userData = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Initialize user KPIs
      await db.collection('user_kpis').doc(userId).set({
        user_id: userId,
        registered_at: timestamp,
        registration_complete: false,
        profile_complete: false,
        verification_status: 'pending',
        total_swipes: 0,
        total_matches: 0,
        profile_opens: 0,
        discovery_views: 0
      });

      // Update daily registration counter
      await db.collection('analytics_daily').doc(`registrations_${today}`).set({
        metric_type: 'registrations',
        date: today,
        timestamp: timestamp,
        count: FieldValue.increment(1)
      }, { merge: true });

      // Track funnel step
      await db.collection('user_kpis').doc(userId).collection('events').add({
        type: 'registration_started',
        timestamp: timestamp,
        step: 'account_created'
      });

    } catch (error) {
      console.error('Error tracking registration:', error);
    }
  });

// Track profile completion
export const trackProfileUpdate = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const before = change.before.data();
    const after = change.after.data();
    const timestamp = Timestamp.now();

    try {
      // Calculate profile completion percentage
      const requiredFields = ['name', 'bio', 'photos', 'age', 'location'];
      let completedFields = 0;
      
      requiredFields.forEach(field => {
        if (after[field]) {
          if (Array.isArray(after[field]) && after[field].length > 0) {
            completedFields++;
          } else if (typeof after[field] === 'string' && after[field].trim()) {
            completedFields++;
          } else if (typeof after[field] === 'number') {
            completedFields++;
          } else if (typeof after[field] === 'object' && Object.keys(after[field]).length > 0) {
            completedFields++;
          }
        }
      });

      const completionPercentage = (completedFields / requiredFields.length) * 100;
      const isComplete = completionPercentage === 100;

      // Update user KPIs
      await db.collection('user_kpis').doc(userId).update({
        profile_completion_percentage: completionPercentage,
        profile_complete: isComplete,
        profile_updated_at: timestamp
      });

      // If profile just became complete, track event
      if (isComplete && (!before.photos || before.photos.length === 0)) {
        await db.collection('user_kpis').doc(userId).collection('events').add({
          type: 'profile_completed',
          timestamp: timestamp,
          completion_percentage: 100
        });

        const today = new Date().toISOString().split('T')[0];
        await db.collection('analytics_daily').doc(`profile_completion_${today}`).set({
          metric_type: 'profile_completion',
          date: today,
          timestamp: timestamp,
          completed_count: FieldValue.increment(1)
        }, { merge: true });
      }

    } catch (error) {
      console.error('Error tracking profile update:', error);
    }
  });

// Track verification status
export const trackVerification = functions.firestore
  .document('users/{userId}/verification/{verificationId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const verification = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Update user KPIs
      await db.collection('user_kpis').doc(userId).update({
        verification_status: verification.status,
        verification_updated_at: timestamp
      });

      // Track verification event
      await db.collection('user_kpis').doc(userId).collection('events').add({
        type: `verification_${verification.status}`,
        timestamp: timestamp,
        verification_type: verification.type
      });

      // Update daily metrics
      if (verification.status === 'approved') {
        await db.collection('analytics_daily').doc(`verification_success_${today}`).set({
          metric_type: 'verification_success',
          date: today,
          timestamp: timestamp,
          success_count: FieldValue.increment(1)
        }, { merge: true });
      } else if (verification.status === 'rejected') {
        await db.collection('analytics_daily').doc(`verification_failure_${today}`).set({
          metric_type: 'verification_failure',
          date: today,
          timestamp: timestamp,
          failure_count: FieldValue.increment(1)
        }, { merge: true });
      }

    } catch (error) {
      console.error('Error tracking verification:', error);
    }
  });

// Track swipe to match conversion
export const trackSwipe = functions.firestore
  .document('swipes/{swipeId}')
  .onCreate(async (snap, context) => {
    const swipe = snap.data();
    const timestamp = Timestamp.now();

    try {
      // Update user KPIs
      await db.collection('user_kpis').doc(swipe.from_user_id).update({
        total_swipes: FieldValue.increment(1),
        last_swipe_at: timestamp
      });

      // Track swipe event
      await db.collection('user_kpis').doc(swipe.from_user_id).collection('events').add({
        type: 'swipe',
        timestamp: timestamp,
        direction: swipe.direction,
        target_user_id: swipe.to_user_id
      });

    } catch (error) {
      console.error('Error tracking swipe:', error);
    }
  });

// Track match creation
export const trackMatch = functions.firestore
  .document('matches/{matchId}')
  .onCreate(async (snap, context) => {
    const match = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Update both users' KPIs
      for (const userId of match.user_ids) {
        await db.collection('user_kpis').doc(userId).update({
          total_matches: FieldValue.increment(1),
          last_match_at: timestamp
        });

        await db.collection('user_kpis').doc(userId).collection('events').add({
          type: 'match_created',
          timestamp: timestamp,
          match_id: context.params.matchId
        });
      }

      // Update daily match metrics
      await db.collection('analytics_daily').doc(`matches_${today}`).set({
        metric_type: 'matches',
        date: today,
        timestamp: timestamp,
        count: FieldValue.increment(1)
      }, { merge: true });

    } catch (error) {
      console.error('Error tracking match:', error);
    }
  });

// Track profile views
export const trackProfileView = functions.firestore
  .document('profile_views/{viewId}')
  .onCreate(async (snap, context) => {
    const view = snap.data();
    const timestamp = Timestamp.now();

    try {
      // Update viewer's KPIs
      await db.collection('user_kpis').doc(view.viewer_id).update({
        profile_opens: FieldValue.increment(1)
      });

      // Update viewed user's KPIs
      await db.collection('user_kpis').doc(view.profile_user_id).update({
        profile_views_received: FieldValue.increment(1)
      });

      // Track event
      await db.collection('user_kpis').doc(view.viewer_id).collection('events').add({
        type: 'profile_viewed',
        timestamp: timestamp,
        profile_user_id: view.profile_user_id,
        source: view.source || 'discovery'
      });

    } catch (error) {
      console.error('Error tracking profile view:', error);
    }
  });

// Daily aggregation job - runs at midnight
export const aggregateDailyUserKPIs = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      // Calculate DAU (unique active users)
      const dauDoc = await db.collection('analytics_daily').doc(`dau_${dateStr}`).get();
      const dau = dauDoc.exists ? (dauDoc.data()?.userIds?.length || 0) : 0;

      // Calculate registrations
      const regDoc = await db.collection('analytics_daily').doc(`registrations_${dateStr}`).get();
      const registrations = regDoc.exists ? (regDoc.data()?.count || 0) : 0;

      // Calculate profile completions
      const profileDoc = await db.collection('analytics_daily').doc(`profile_completion_${dateStr}`).get();
      const profileCompletions = profileDoc.exists ? (profileDoc.data()?.completed_count || 0) : 0;

      // Calculate verification success rate
      const verifySuccessDoc = await db.collection('analytics_daily').doc(`verification_success_${dateStr}`).get();
      const verifyFailDoc = await db.collection('analytics_daily').doc(`verification_failure_${dateStr}`).get();
      const verifySuccess = verifySuccessDoc.exists ? (verifySuccessDoc.data()?.success_count || 0) : 0;
      const verifyFail = verifyFailDoc.exists ? (verifyFailDoc.data()?.failure_count || 0) : 0;
      const verificationSuccessRate = (verifySuccess + verifyFail) > 0 
        ? (verifySuccess / (verifySuccess + verifyFail)) * 100 
        : 0;

      // Calculate swipe to match conversion
      const matchDoc = await db.collection('analytics_daily').doc(`matches_${dateStr}`).get();
      const matches = matchDoc.exists ? (matchDoc.data()?.count || 0) : 0;

      // Get total swipes for the day
      const swipesSnapshot = await db.collection('swipes')
        .where('created_at', '>=', Timestamp.fromDate(yesterday))
        .where('created_at', '<', Timestamp.fromDate(new Date(yesterday.getTime() + 86400000)))
        .count()
        .get();
      const totalSwipes = swipesSnapshot.data().count;

      const swipeToMatchConversion = totalSwipes > 0 ? (matches / totalSwipes) * 100 : 0;

      // Store aggregated metrics
      await db.collection('analytics_daily').doc(`user_kpis_${dateStr}`).set({
        metric_type: 'user_kpis_summary',
        date: dateStr,
        timestamp: Timestamp.now(),
        metrics: {
          dau,
          registrations,
          profileCompletions,
          profileCompletionRate: registrations > 0 ? (profileCompletions / registrations) * 100 : 0,
          verificationSuccessRate,
          swipeToMatchConversion,
          totalSwipes,
          totalMatches: matches
        }
      });

      console.log(`Aggregated user KPIs for ${dateStr}`);

    } catch (error) {
      console.error('Error aggregating daily user KPIs:', error);
      throw error;
    }
  });