import * as functions from 'firebase-functions';
import { db, FieldValue, timestamp as Timestamp } from '../init';

interface CalendarEventMetrics {
  date: string;
  bookingsPerDay: number;
  cancellationRatio: number;
  top20CreatorsRevenue: number;
  totalRevenue: number;
  top20Percentage: number;
  qrVerificationRate: number;
  mismatchClaimsRate: number;
  totalBookings: number;
  totalCancellations: number;
  totalCompletedEvents: number;
  totalMismatchClaims: number;
}

// Track calendar booking
export const trackCalendarBooking = functions.firestore
  .document('calendar_events/{eventId}')
  .onCreate(async (snap, context) => {
    const eventId = context.params.eventId;
    const event = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Track booking event
      await db.collection('calendar_analytics').add({
        event_type: 'booking_created',
        event_id: eventId,
        user_id: event.user_id,
        creator_id: event.creator_id,
        tokens: event.tokens || 0,
        event_date: event.event_date,
        timestamp: timestamp
      });

      // Update daily booking counter
      await db.collection('analytics_daily').doc(`bookings_${today}`).set({
        metric_type: 'calendar_bookings',
        date: today,
        timestamp: timestamp,
        booking_count: FieldValue.increment(1),
        total_tokens: FieldValue.increment(event.tokens || 0)
      }, { merge: true });

      // Track creator revenue
      await db.collection('analytics_daily').doc(`creator_calendar_revenue_${today}`).set({
        metric_type: 'creator_calendar_revenue',
        date: today,
        timestamp: timestamp,
        [`creator_${event.creator_id}`]: FieldValue.increment(event.tokens || 0)
      }, { merge: true });

    } catch (error) {
      console.error('Error tracking calendar booking:', error);
    }
  });

// Track booking cancellation
export const trackBookingCancellation = functions.firestore
  .document('calendar_events/{eventId}')
  .onUpdate(async (change, context) => {
    const eventId = context.params.eventId;
    const before = change.before.data();
    const after = change.after.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Check if event was cancelled
      if (before.status !== 'cancelled' && after.status === 'cancelled') {
        // Track cancellation event
        await db.collection('calendar_analytics').add({
          event_type: 'booking_cancelled',
          event_id: eventId,
          user_id: after.user_id,
          creator_id: after.creator_id,
          tokens: after.tokens || 0,
          cancelled_by: after.cancelled_by,
          cancellation_reason: after.cancellation_reason,
          timestamp: timestamp
        });

        // Update daily cancellation counter
        await db.collection('analytics_daily').doc(`cancellations_${today}`).set({
          metric_type: 'calendar_cancellations',
          date: today,
          timestamp: timestamp,
          cancellation_count: FieldValue.increment(1),
          refunded_tokens: FieldValue.increment(after.tokens || 0)
        }, { merge: true });
      }

    } catch (error) {
      console.error('Error tracking booking cancellation:', error);
    }
  });

// Track QR code verification
export const trackQRVerification = functions.firestore
  .document('calendar_events/{eventId}/verifications/{verificationId}')
  .onCreate(async (snap, context) => {
    const eventId = context.params.eventId;
    const verification = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Get event details
      const eventDoc = await db.collection('calendar_events').doc(eventId).get();
      if (!eventDoc.exists) return;

      const event = eventDoc.data()!;

      // Track verification event
      await db.collection('calendar_analytics').add({
        event_type: 'qr_verification',
        event_id: eventId,
        user_id: event.user_id,
        creator_id: event.creator_id,
        verification_status: verification.status,
        verified_by: verification.verified_by,
        timestamp: timestamp
      });

      // Update daily verification counter
      if (verification.status === 'verified') {
        await db.collection('analytics_daily').doc(`qr_verifications_${today}`).set({
          metric_type: 'qr_verifications',
          date: today,
          timestamp: timestamp,
          verification_count: FieldValue.increment(1)
        }, { merge: true });

        // Update event as verified
        await db.collection('calendar_events').doc(eventId).update({
          qr_verified: true,
          qr_verified_at: timestamp
        });
      }

    } catch (error) {
      console.error('Error tracking QR verification:', error);
    }
  });

// Track mismatch claims
export const trackMismatchClaim = functions.firestore
  .document('mismatch_claims/{claimId}')
  .onCreate(async (snap, context) => {
    const claimId = context.params.claimId;
    const claim = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Track mismatch claim event
      await db.collection('calendar_analytics').add({
        event_type: 'mismatch_claim',
        claim_id: claimId,
        event_id: claim.event_id,
        user_id: claim.user_id,
        creator_id: claim.creator_id,
        claim_type: claim.type,
        severity: claim.severity,
        timestamp: timestamp
      });

      // Update daily mismatch counter
      await db.collection('analytics_daily').doc(`mismatch_claims_${today}`).set({
        metric_type: 'mismatch_claims',
        date: today,
        timestamp: timestamp,
        claim_count: FieldValue.increment(1)
      }, { merge: true });

      // Track in safety events
      await db.collection('safety_events').add({
        event_type: 'mismatch_claim',
        user_id: claim.user_id,
        creator_id: claim.creator_id,
        event_id: claim.event_id,
        severity: claim.severity || 'medium',
        timestamp: timestamp,
        metadata: {
          claim_type: claim.type,
          description: claim.description
        }
      });

    } catch (error) {
      console.error('Error tracking mismatch claim:', error);
    }
  });

// Track event completion
export const trackEventCompletion = functions.firestore
  .document('calendar_events/{eventId}')
  .onUpdate(async (change, context) => {
    const eventId = context.params.eventId;
    const before = change.before.data();
    const after = change.after.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Check if event was completed
      if (before.status !== 'completed' && after.status === 'completed') {
        // Track completion event
        await db.collection('calendar_analytics').add({
          event_type: 'booking_completed',
          event_id: eventId,
          user_id: after.user_id,
          creator_id: after.creator_id,
          tokens: after.tokens || 0,
          qr_verified: after.qr_verified || false,
          timestamp: timestamp
        });

        // Update daily completion counter
        await db.collection('analytics_daily').doc(`completions_${today}`).set({
          metric_type: 'calendar_completions',
          date: today,
          timestamp: timestamp,
          completion_count: FieldValue.increment(1)
        }, { merge: true });
      }

    } catch (error) {
      console.error('Error tracking event completion:', error);
    }
  });

// Daily aggregation for calendar KPIs
export const aggregateCalendarEventKPIs = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      console.log(`Aggregating calendar event KPIs for ${dateStr}`);

      // Get booking metrics
      const bookingsDoc = await db.collection('analytics_daily').doc(`bookings_${dateStr}`).get();
      const bookingsPerDay = bookingsDoc.exists ? (bookingsDoc.data()?.booking_count || 0) : 0;
      const totalTokens = bookingsDoc.exists ? (bookingsDoc.data()?.total_tokens || 0) : 0;

      // Get cancellation metrics
      const cancellationsDoc = await db.collection('analytics_daily').doc(`cancellations_${dateStr}`).get();
      const totalCancellations = cancellationsDoc.exists ? (cancellationsDoc.data()?.cancellation_count || 0) : 0;
      const cancellationRatio = bookingsPerDay > 0 ? (totalCancellations / bookingsPerDay) * 100 : 0;

      // Get completion metrics
      const completionsDoc = await db.collection('analytics_daily').doc(`completions_${dateStr}`).get();
      const totalCompletedEvents = completionsDoc.exists ? (completionsDoc.data()?.completion_count || 0) : 0;

      // Get QR verification metrics
      const qrVerificationsDoc = await db.collection('analytics_daily').doc(`qr_verifications_${dateStr}`).get();
      const qrVerifications = qrVerificationsDoc.exists ? (qrVerificationsDoc.data()?.verification_count || 0) : 0;
      const qrVerificationRate = totalCompletedEvents > 0 ? (qrVerifications / totalCompletedEvents) * 100 : 0;

      // Get mismatch claims
      const mismatchClaimsDoc = await db.collection('analytics_daily').doc(`mismatch_claims_${dateStr}`).get();
      const totalMismatchClaims = mismatchClaimsDoc.exists ? (mismatchClaimsDoc.data()?.claim_count || 0) : 0;
      const mismatchClaimsRate = totalCompletedEvents > 0 ? (totalMismatchClaims / totalCompletedEvents) * 100 : 0;

      // Calculate 80/20 revenue distribution
      const creatorRevenueDoc = await db.collection('analytics_daily').doc(`creator_calendar_revenue_${dateStr}`).get();
      let creatorRevenues: { creatorId: string; revenue: number }[] = [];
      
      if (creatorRevenueDoc.exists) {
        const data = creatorRevenueDoc.data();
        Object.keys(data || {}).forEach(key => {
          if (key.startsWith('creator_')) {
            const creatorId = key.replace('creator_', '');
            creatorRevenues.push({
              creatorId,
              revenue: data![key]
            });
          }
        });
      }

      // Sort by revenue descending
      creatorRevenues.sort((a, b) => b.revenue - a.revenue);

      // Calculate top 20% creators' revenue
      const top20Count = Math.ceil(creatorRevenues.length * 0.2);
      const top20Revenue = creatorRevenues.slice(0, top20Count).reduce((sum, c) => sum + c.revenue, 0);
      const totalRevenue = creatorRevenues.reduce((sum, c) => sum + c.revenue, 0);
      const top20Percentage = totalRevenue > 0 ? (top20Revenue / totalRevenue) * 100 : 0;

      // Store aggregated metrics
      const metrics: CalendarEventMetrics = {
        date: dateStr,
        bookingsPerDay,
        cancellationRatio,
        top20CreatorsRevenue: top20Revenue,
        totalRevenue,
        top20Percentage,
        qrVerificationRate,
        mismatchClaimsRate,
        totalBookings: bookingsPerDay,
        totalCancellations,
        totalCompletedEvents,
        totalMismatchClaims
      };

      await db.collection('analytics_daily').doc(`calendar_kpis_${dateStr}`).set({
        metric_type: 'calendar_event_kpis',
        date: dateStr,
        timestamp: Timestamp.now(),
        metrics
      });

      console.log(`Calendar event KPIs aggregated for ${dateStr}:`, metrics);

    } catch (error) {
      console.error('Error aggregating calendar event KPIs:', error);
      throw error;
    }
  });