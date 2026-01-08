import * as functions from 'firebase-functions';
import { db, FieldValue, timestamp as Timestamp } from '../init';

interface SafetyScore {
  userId: string;
  nsfwScore: number; // 0-100
  nsfwLevel: 'S1' | 'S2' | 'S3' | 'clean'; // S1=mild, S2=moderate, S3=severe
  catfishProbability: number; // 0-100
  blockReportFrequency: number;
  behaviorAnomalyScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  lastUpdated: FirebaseFirestore.Timestamp;
}

interface BehaviorAnomaly {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  description: string;
  timestamp: FirebaseFirestore.Timestamp;
}

// NSFW Detection Scoring
export const analyzeContentForNSFW = functions.firestore
  .document('users/{userId}/media/{mediaId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const media = snap.data();
    const timestamp = Timestamp.now();

    try {
      // Simulate NSFW detection (in production, use Vision AI or similar)
      let nsfwScore = 0;
      let nsfwLevel: 'S1' | 'S2' | 'S3' | 'clean' = 'clean';

      // Check for explicit content flags (would be from AI detection)
      if (media.nsfw_detected) {
        nsfwScore = media.nsfw_confidence || 50;
        
        if (nsfwScore < 30) {
          nsfwLevel = 'S1'; // Mild
        } else if (nsfwScore < 70) {
          nsfwLevel = 'S2'; // Moderate
        } else {
          nsfwLevel = 'S3'; // Severe
        }
      }

      // Log safety event
      await db.collection('safety_events').add({
        event_type: 'nsfw_detection',
        user_id: userId,
        media_id: context.params.mediaId,
        nsfw_score: nsfwScore,
        nsfw_level: nsfwLevel,
        severity: nsfwLevel === 'S3' ? 'high' : nsfwLevel === 'S2' ? 'medium' : 'low',
        timestamp: timestamp,
        metadata: {
          media_type: media.type,
          url: media.url
        }
      });

      // Update user safety score
      const userSafetyRef = db.collection('user_safety_scores').doc(userId);
      await userSafetyRef.set({
        nsfw_score: nsfwScore,
        nsfw_level: nsfwLevel,
        last_nsfw_check: timestamp
      }, { merge: true });

      // If severe, create alert
      if (nsfwLevel === 'S3' || nsfwScore > 80) {
        await db.collection('safety_alerts').add({
          alert_type: 'nsfw_severe',
          user_id: userId,
          severity: 'high',
          nsfw_score: nsfwScore,
          nsfw_level: nsfwLevel,
          requires_review: true,
          timestamp: timestamp
        });
      }

    } catch (error) {
      console.error('Error analyzing content for NSFW:', error);
    }
  });

// Catfish Probability Detection
export const analyzeCatfishProbability = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const before = change.before.data();
    const after = change.after.data();
    const timestamp = Timestamp.now();

    try {
      let catfishScore = 0;
      const signals: string[] = [];

      // Check for suspicious patterns
      // 1. Profile photo mismatch with verification
      if (after.verification_failed_count > 2) {
        catfishScore += 30;
        signals.push('multiple_verification_failures');
      }

      // 2. Stock photo detection (would use AI in production)
      if (after.stock_photo_detected) {
        catfishScore += 40;
        signals.push('stock_photo_detected');
      }

      // 3. Inconsistent profile information
      if (after.location_changes_count > 5) {
        catfishScore += 15;
        signals.push('frequent_location_changes');
      }

      // 4. Age discrepancy
      if (after.age_discrepancy_detected) {
        catfishScore += 25;
        signals.push('age_discrepancy');
      }

      // 5. No social media verification
      if (!after.social_verified && after.account_age_days > 30) {
        catfishScore += 10;
        signals.push('no_social_verification');
      }

      // 6. Suspicious messaging patterns
      const messageCount = after.total_messages_sent || 0;
      const accountAgeDays = after.account_age_days || 1;
      if (messageCount / accountAgeDays > 100) {
        catfishScore += 20;
        signals.push('excessive_messaging');
      }

      // Cap at 100
      catfishScore = Math.min(catfishScore, 100);

      // Update user safety score
      await db.collection('user_safety_scores').doc(userId).set({
        catfish_probability: catfishScore,
        catfish_signals: signals,
        last_catfish_check: timestamp
      }, { merge: true });

      // Log safety event
      await db.collection('safety_events').add({
        event_type: 'catfish_analysis',
        user_id: userId,
        catfish_score: catfishScore,
        signals: signals,
        severity: catfishScore > 70 ? 'high' : catfishScore > 40 ? 'medium' : 'low',
        timestamp: timestamp
      });

      // If high probability, create alert
      if (catfishScore > 60) {
        await db.collection('safety_alerts').add({
          alert_type: 'catfish_suspected',
          user_id: userId,
          severity: catfishScore > 80 ? 'critical' : 'high',
          catfish_score: catfishScore,
          signals: signals,
          requires_review: true,
          timestamp: timestamp
        });
      }

    } catch (error) {
      console.error('Error analyzing catfish probability:', error);
    }
  });

// Track Block/Report Events
export const trackBlockReport = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap, context) => {
    const report = snap.data();
    const timestamp = Timestamp.now();

    try {
      // Track event
      await db.collection('safety_events').add({
        event_type: report.type === 'block' ? 'user_blocked' : 'user_reported',
        user_id: report.reported_user_id,
        reporter_id: report.reporter_user_id,
        reason: report.reason,
        severity: report.severity || 'medium',
        timestamp: timestamp,
        metadata: {
          description: report.description,
          evidence: report.evidence_urls || []
        }
      });

      // Update user safety score
      const userSafetyRef = db.collection('user_safety_scores').doc(report.reported_user_id);
      const userSafetyDoc = await userSafetyRef.get();
      const currentData = userSafetyDoc.exists ? userSafetyDoc.data() : {};

      const blockCount = (currentData?.block_count || 0) + (report.type === 'block' ? 1 : 0);
      const reportCount = (currentData?.report_count || 0) + (report.type === 'report' ? 1 : 0);
      const totalIncidents = blockCount + reportCount;

      // Calculate block/report frequency per day
      const accountCreated = currentData?.account_created_at?.toMillis() || Date.now();
      const daysSinceCreation = (timestamp.toMillis() - accountCreated) / (1000 * 60 * 60 * 24);
      const frequency = daysSinceCreation > 0 ? totalIncidents / daysSinceCreation : totalIncidents;

      await userSafetyRef.set({
        block_count: blockCount,
        report_count: reportCount,
        block_report_frequency: frequency,
        last_incident_at: timestamp
      }, { merge: true });

      // Create alert if frequency is high
      if (frequency > 0.5 || totalIncidents > 10) {
        await db.collection('safety_alerts').add({
          alert_type: 'high_block_report_frequency',
          user_id: report.reported_user_id,
          severity: frequency > 1 ? 'critical' : 'high',
          block_count: blockCount,
          report_count: reportCount,
          frequency: frequency,
          requires_review: true,
          timestamp: timestamp
        });
      }

    } catch (error) {
      console.error('Error tracking block/report:', error);
    }
  });

// Behavior Anomaly Detection
export const detectBehaviorAnomalies = functions.firestore
  .document('user_behavior/{userId}')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const before = change.before.data();
    const after = change.after.data();
    const timestamp = Timestamp.now();

    try {
      const anomalies: BehaviorAnomaly[] = [];

      // 1. Rapid profile changes
      if (after.profile_changes_24h > 10) {
        anomalies.push({
          type: 'rapid_profile_changes',
          severity: 'high',
          score: Math.min(after.profile_changes_24h * 5, 100),
          description: `${after.profile_changes_24h} profile changes in 24 hours`,
          timestamp: timestamp
        });
      }

      // 2. Unusual activity hours
      const activityHour = new Date().getHours();
      if ((activityHour >= 2 && activityHour <= 5) && after.night_activity_count > 20) {
        anomalies.push({
          type: 'unusual_activity_hours',
          severity: 'medium',
          score: 40,
          description: 'High activity during unusual hours (2-5 AM)',
          timestamp: timestamp
        });
      }

      // 3. Mass messaging
      if (after.messages_sent_1h > 100) {
        anomalies.push({
          type: 'mass_messaging',
          severity: 'high',
          score: 80,
          description: `${after.messages_sent_1h} messages sent in 1 hour`,
          timestamp: timestamp
        });
      }

      // 4. Rapid swiping
      if (after.swipes_per_minute > 10) {
        anomalies.push({
          type: 'rapid_swiping',
          severity: 'medium',
          score: 50,
          description: `${after.swipes_per_minute} swipes per minute`,
          timestamp: timestamp
        });
      }

      // 5. Connection pattern anomaly (connecting with many users quickly)
      if (after.new_matches_1h > 50) {
        anomalies.push({
          type: 'connection_surge',
          severity: 'high',
          score: 70,
          description: `${after.new_matches_1h} new matches in 1 hour`,
          timestamp: timestamp
        });
      }

      // 6. Location jumping
      if (after.location_changes_1h > 3) {
        anomalies.push({
          type: 'location_jumping',
          severity: 'high',
          score: 60,
          description: `${after.location_changes_1h} location changes in 1 hour`,
          timestamp: timestamp
        });
      }

      // 7. Token transfer anomaly
      if (after.token_transactions_1h > 20) {
        anomalies.push({
          type: 'suspicious_token_activity',
          severity: 'critical',
          score: 90,
          description: `${after.token_transactions_1h} token transactions in 1 hour`,
          timestamp: timestamp
        });
      }

      // Calculate overall behavior anomaly score
      const behaviorAnomalyScore = anomalies.length > 0
        ? Math.min(anomalies.reduce((sum, a) => sum + a.score, 0) / anomalies.length, 100)
        : 0;

      // Update user safety score
      if (anomalies.length > 0) {
        await db.collection('user_safety_scores').doc(userId).set({
          behavior_anomaly_score: behaviorAnomalyScore,
          recent_anomalies: anomalies.map(a => a.type),
          last_anomaly_check: timestamp
        }, { merge: true });

        // Log safety events
        for (const anomaly of anomalies) {
          await db.collection('safety_events').add({
            event_type: 'behavior_anomaly',
            user_id: userId,
            anomaly_type: anomaly.type,
            severity: anomaly.severity,
            score: anomaly.score,
            description: anomaly.description,
            timestamp: timestamp
          });
        }

        // Create alerts for high-severity anomalies
        const highSeverityAnomalies = anomalies.filter(a => 
          a.severity === 'high' || a.severity === 'critical'
        );

        if (highSeverityAnomalies.length > 0) {
          await db.collection('safety_alerts').add({
            alert_type: 'behavior_anomaly_detected',
            user_id: userId,
            severity: highSeverityAnomalies.some(a => a.severity === 'critical') ? 'critical' : 'high',
            anomalies: highSeverityAnomalies.map(a => ({
              type: a.type,
              description: a.description,
              score: a.score
            })),
            requires_review: true,
            timestamp: timestamp
          });
        }
      }

    } catch (error) {
      console.error('Error detecting behavior anomalies:', error);
    }
  });

// Calculate overall safety risk level
export const calculateUserRiskLevel = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    console.log('Calculating user risk levels...');

    try {
      // Get all users with safety scores
      const safetyScoresSnapshot = await db.collection('user_safety_scores').get();

      const batch = db.batch();
      let count = 0;

      for (const doc of safetyScoresSnapshot.docs) {
        const userId = doc.id;
        const data = doc.data();

        // Calculate weighted risk score
        const nsfwWeight = 0.3;
        const catfishWeight = 0.3;
        const blockReportWeight = 0.2;
        const anomalyWeight = 0.2;

        const nsfwScore = data.nsfw_score || 0;
        const catfishScore = data.catfish_probability || 0;
        const blockReportScore = Math.min((data.block_report_frequency || 0) * 50, 100);
        const anomalyScore = data.behavior_anomaly_score || 0;

        const overallRiskScore = 
          (nsfwScore * nsfwWeight) +
          (catfishScore * catfishWeight) +
          (blockReportScore * blockReportWeight) +
          (anomalyScore * anomalyWeight);

        // Determine risk level
        let riskLevel: 'low' | 'medium' | 'high' | 'critical';
        if (overallRiskScore < 25) {
          riskLevel = 'low';
        } else if (overallRiskScore < 50) {
          riskLevel = 'medium';
        } else if (overallRiskScore < 75) {
          riskLevel = 'high';
        } else {
          riskLevel = 'critical';
        }

        // Update safety score
        batch.update(doc.ref, {
          overall_risk_score: overallRiskScore,
          risk_level: riskLevel,
          last_risk_calculation: Timestamp.now()
        });

        count++;
        if (count % 500 === 0) {
          await batch.commit();
          console.log(`Updated ${count} user risk levels`);
        }
      }

      if (count % 500 !== 0) {
        await batch.commit();
      }

      console.log(`Risk level calculation complete: ${count} users`);

    } catch (error) {
      console.error('Error calculating user risk levels:', error);
      throw error;
    }
  });

// Daily safety metrics aggregation
export const aggregateSafetyMetrics = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      console.log(`Aggregating safety metrics for ${dateStr}`);

      // Get safety events from yesterday
      const safetyEventsSnapshot = await db.collection('safety_events')
        .where('timestamp', '>=', Timestamp.fromDate(yesterday))
        .where('timestamp', '<', Timestamp.fromDate(new Date(yesterday.getTime() + 86400000)))
        .get();

      const metrics = {
        nsfw_detections: { S1: 0, S2: 0, S3: 0, clean: 0 },
        catfish_analyses: { low: 0, medium: 0, high: 0 },
        blocks: 0,
        reports: 0,
        behavior_anomalies: { low: 0, medium: 0, high: 0, critical: 0 },
        total_events: safetyEventsSnapshot.size
      };

      safetyEventsSnapshot.forEach(doc => {
        const event = doc.data();
        
        if (event.event_type === 'nsfw_detection') {
          const level = event.nsfw_level || 'clean';
          metrics.nsfw_detections[level as keyof typeof metrics.nsfw_detections]++;
        } else if (event.event_type === 'catfish_analysis') {
          const severity = event.severity || 'low';
          if (severity in metrics.catfish_analyses) {
            metrics.catfish_analyses[severity as keyof typeof metrics.catfish_analyses]++;
          }
        } else if (event.event_type === 'user_blocked') {
          metrics.blocks++;
        } else if (event.event_type === 'user_reported') {
          metrics.reports++;
        } else if (event.event_type === 'behavior_anomaly') {
          const severity = event.severity || 'low';
          if (severity in metrics.behavior_anomalies) {
            metrics.behavior_anomalies[severity as keyof typeof metrics.behavior_anomalies]++;
          }
        }
      });

      // Store aggregated metrics
      await db.collection('analytics_daily').doc(`safety_metrics_${dateStr}`).set({
        metric_type: 'safety_monitoring',
        date: dateStr,
        timestamp: Timestamp.now(),
        metrics
      });

      console.log(`Safety metrics aggregated for ${dateStr}:`, metrics);

    } catch (error) {
      console.error('Error aggregating safety metrics:', error);
      throw error;
    }
  });