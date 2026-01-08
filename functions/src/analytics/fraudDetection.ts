import * as functions from 'firebase-functions';
import { db, FieldValue, timestamp as Timestamp } from '../init';

interface FraudScore {
  userId: string;
  overallRiskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  multiAccountScore: number;
  deviceFingerprintScore: number;
  behaviorAnomalyScore: number;
  chargebackRiskScore: number;
  flags: string[];
  lastUpdated: FirebaseFirestore.Timestamp;
}

interface DeviceFingerprint {
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  platform: string;
  screenResolution: string;
  timezone: string;
  language: string;
  firstSeen: FirebaseFirestore.Timestamp;
  lastSeen: FirebaseFirestore.Timestamp;
  userIds: string[];
}

// Multi-Account Detection
export const detectMultipleAccounts = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const userData = snap.data();
    const timestamp = Timestamp.now();

    try {
      const signals: string[] = [];
      let multiAccountScore = 0;

      // Check for device fingerprint matches
      if (userData.device_fingerprint) {
        const matchingDevicesSnapshot = await db.collection('device_fingerprints')
          .where('device_id', '==', userData.device_fingerprint)
          .get();

        if (!matchingDevicesSnapshot.empty) {
          const existingDevice = matchingDevicesSnapshot.docs[0].data();
          const accountCount = existingDevice.user_ids?.length || 0;

          if (accountCount > 0) {
            multiAccountScore += Math.min(accountCount * 20, 80);
            signals.push(`device_shared_with_${accountCount}_accounts`);
          }

          // Update device fingerprint
          await matchingDevicesSnapshot.docs[0].ref.update({
            user_ids: FieldValue.arrayUnion(userId),
            last_seen: timestamp
          });
        } else {
          // Create new device fingerprint
          await db.collection('device_fingerprints').add({
            device_id: userData.device_fingerprint,
            ip_address: userData.ip_address,
            user_agent: userData.user_agent,
            platform: userData.platform,
            screen_resolution: userData.screen_resolution,
            timezone: userData.timezone,
            language: userData.language,
            first_seen: timestamp,
            last_seen: timestamp,
            user_ids: [userId]
          });
        }
      }

      // Check for IP address matches
      if (userData.ip_address) {
        const sameIpUsersSnapshot = await db.collection('users')
          .where('ip_address', '==', userData.ip_address)
          .where('created_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .get();

        const sameIpCount = sameIpUsersSnapshot.size - 1; // Exclude current user
        if (sameIpCount > 0) {
          multiAccountScore += Math.min(sameIpCount * 15, 60);
          signals.push(`same_ip_${sameIpCount}_accounts`);
        }
      }

      // Check for similar email patterns
      if (userData.email) {
        const emailBase = userData.email.split('@')[0].replace(/[0-9]/g, '');
        const similarEmailsSnapshot = await db.collection('users')
          .where('email_base', '==', emailBase)
          .get();

        const similarEmailCount = similarEmailsSnapshot.size - 1;
        if (similarEmailCount > 0) {
          multiAccountScore += Math.min(similarEmailCount * 10, 40);
          signals.push(`similar_email_${similarEmailCount}_accounts`);
        }
      }

      // Check for phone number matches
      if (userData.phone) {
        const samePhoneSnapshot = await db.collection('users')
          .where('phone', '==', userData.phone)
          .get();

        if (samePhoneSnapshot.size > 1) {
          multiAccountScore += 70;
          signals.push('phone_number_reused');
        }
      }

      multiAccountScore = Math.min(multiAccountScore, 100);

      // Store fraud score
      await db.collection('fraud_scores').doc(userId).set({
        multi_account_score: multiAccountScore,
        multi_account_signals: signals,
        last_multi_account_check: timestamp
      }, { merge: true });

      // Create fraud alert if high score
      if (multiAccountScore > 60) {
        await db.collection('fraud_alerts').add({
          alert_type: 'multi_account_suspected',
          user_id: userId,
          risk_score: multiAccountScore,
          signals: signals,
          severity: multiAccountScore > 80 ? 'critical' : 'high',
          requires_review: true,
          timestamp: timestamp
        });
      }

    } catch (error) {
      console.error('Error detecting multiple accounts:', error);
    }
  });

// Device Fingerprint Analysis
export const analyzeDeviceFingerprint = functions.firestore
  .document('user_sessions/{sessionId}')
  .onCreate(async (snap, context) => {
    const session = snap.data();
    const timestamp = Timestamp.now();

    try {
      let deviceFingerprintScore = 0;
      const signals: string[] = [];

      // Check for suspicious device characteristics
      
      // 1. Emulator detection
      if (session.is_emulator || session.is_rooted) {
        deviceFingerprintScore += 40;
        signals.push('emulator_or_rooted_device');
      }

      // 2. VPN/Proxy detection
      if (session.vpn_detected || session.proxy_detected) {
        deviceFingerprintScore += 30;
        signals.push('vpn_or_proxy_detected');
      }

      // 3. Location mismatch
      if (session.ip_location && session.gps_location) {
        const distance = calculateDistance(session.ip_location, session.gps_location);
        if (distance > 100) { // More than 100km apart
          deviceFingerprintScore += 25;
          signals.push('location_mismatch');
        }
      }

      // 4. Impossible travel
      const userPrevSession = await db.collection('user_sessions')
        .where('user_id', '==', session.user_id)
        .where('created_at', '<', session.created_at)
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

      if (!userPrevSession.empty) {
        const prevSession = userPrevSession.docs[0].data();
        const timeDiff = session.created_at.toMillis() - prevSession.created_at.toMillis();
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        if (prevSession.location && session.location) {
          const distance = calculateDistance(prevSession.location, session.location);
          const speed = distance / hoursDiff; // km/h
          
          if (speed > 1000) { // Impossible travel speed
            deviceFingerprintScore += 50;
            signals.push('impossible_travel');
          }
        }
      }

      // 5. Automated behavior patterns
      if (session.mouse_movements && session.mouse_movements.length < 10) {
        deviceFingerprintScore += 20;
        signals.push('suspicious_interaction_pattern');
      }

      // 6. Device switching frequency
      const recentDeviceChanges = await db.collection('user_sessions')
        .where('user_id', '==', session.user_id)
        .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .get();

      const uniqueDevices = new Set(recentDeviceChanges.docs.map(doc => doc.data().device_id));
      if (uniqueDevices.size > 5) {
        deviceFingerprintScore += 30;
        signals.push('frequent_device_switching');
      }

      deviceFingerprintScore = Math.min(deviceFingerprintScore, 100);

      // Update fraud score
      await db.collection('fraud_scores').doc(session.user_id).set({
        device_fingerprint_score: deviceFingerprintScore,
        device_fingerprint_signals: signals,
        last_device_check: timestamp
      }, { merge: true });

      // Create alert if high risk
      if (deviceFingerprintScore > 60) {
        await db.collection('fraud_alerts').add({
          alert_type: 'suspicious_device',
          user_id: session.user_id,
          session_id: context.params.sessionId,
          risk_score: deviceFingerprintScore,
          signals: signals,
          severity: deviceFingerprintScore > 80 ? 'critical' : 'high',
          requires_review: true,
          timestamp: timestamp
        });
      }

    } catch (error) {
      console.error('Error analyzing device fingerprint:', error);
    }
  });

// Chargeback Prediction
export const predictChargebackRisk = functions.firestore
  .document('purchases/{purchaseId}')
  .onCreate(async (snap, context) => {
    const purchase = snap.data();
    const timestamp = Timestamp.now();

    try {
      let chargebackRiskScore = 0;
      const signals: string[] = [];

      // Get user history
      const userId = purchase.user_id;
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.exists ? userDoc.data() : {};

      // 1. New user with large purchase
      const accountAgeDays = userData.created_at 
        ? (timestamp.toMillis() - userData.created_at.toMillis()) / (1000 * 60 * 60 * 24)
        : 0;

      if (accountAgeDays < 1 && purchase.amount > 100) {
        chargebackRiskScore += 40;
        signals.push('new_user_large_purchase');
      }

      // 2. Purchase velocity
      const recentPurchases = await db.collection('purchases')
        .where('user_id', '==', userId)
        .where('created_at', '>=', new Date(Date.now() - 60 * 60 * 1000))
        .get();

      if (recentPurchases.size > 5) {
        chargebackRiskScore += 35;
        signals.push('high_purchase_velocity');
      }

      // 3. Previous chargebacks
      const previousChargebacks = await db.collection('chargebacks')
        .where('user_id', '==', userId)
        .get();

      if (previousChargebacks.size > 0) {
        chargebackRiskScore += Math.min(previousChargebacks.size * 30, 70);
        signals.push(`previous_chargebacks_${previousChargebacks.size}`);
      }

      // 4. Mismatched billing info
      if (purchase.billing_country !== userData.country) {
        chargebackRiskScore += 25;
        signals.push('billing_country_mismatch');
      }

      // 5. Failed payment attempts
      const failedAttempts = await db.collection('payment_attempts')
        .where('user_id', '==', userId)
        .where('status', '==', 'failed')
        .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .get();

      if (failedAttempts.size > 3) {
        chargebackRiskScore += 20;
        signals.push('multiple_failed_payments');
      }

      // 6. High-risk payment method
      if (purchase.payment_method === 'prepaid_card') {
        chargebackRiskScore += 20;
        signals.push('high_risk_payment_method');
      }

      // 7. Unusual purchase pattern
      const userPurchaseHistory = await db.collection('purchases')
        .where('user_id', '==', userId)
        .orderBy('created_at', 'desc')
        .limit(10)
        .get();

      if (userPurchaseHistory.size > 0) {
        const avgAmount = userPurchaseHistory.docs.reduce((sum, doc) => 
          sum + (doc.data().amount || 0), 0) / userPurchaseHistory.size;
        
        if (purchase.amount > avgAmount * 3) {
          chargebackRiskScore += 30;
          signals.push('unusual_purchase_amount');
        }
      }

      chargebackRiskScore = Math.min(chargebackRiskScore, 100);

      // Update fraud score
      await db.collection('fraud_scores').doc(userId).set({
        chargeback_risk_score: chargebackRiskScore,
        chargeback_risk_signals: signals,
        last_chargeback_check: timestamp
      }, { merge: true });

      // Tag purchase with risk score
      await db.collection('purchases').doc(context.params.purchaseId).update({
        chargeback_risk_score: chargebackRiskScore,
        fraud_signals: signals
      });

      // Create alert if high risk
      if (chargebackRiskScore > 70) {
        await db.collection('fraud_alerts').add({
          alert_type: 'high_chargeback_risk',
          user_id: userId,
          purchase_id: context.params.purchaseId,
          risk_score: chargebackRiskScore,
          signals: signals,
          severity: chargebackRiskScore > 85 ? 'critical' : 'high',
          requires_review: true,
          recommended_action: 'require_additional_verification',
          timestamp: timestamp
        });
      }

    } catch (error) {
      console.error('Error predicting chargeback risk:', error);
    }
  });

// Calculate overall fraud risk
export const calculateOverallFraudRisk = functions.pubsub
  .schedule('every 12 hours')
  .onRun(async (context) => {
    console.log('Calculating overall fraud risk scores...');

    try {
      const fraudScoresSnapshot = await db.collection('fraud_scores').get();

      const batch = db.batch();
      let count = 0;

      for (const doc of fraudScoresSnapshot.docs) {
        const userId = doc.id;
        const data = doc.data();

        // Weight each component
        const weights = {
          multiAccount: 0.3,
          deviceFingerprint: 0.25,
          behaviorAnomaly: 0.25,
          chargebackRisk: 0.2
        };

        const multiAccountScore = data.multi_account_score || 0;
        const deviceScore = data.device_fingerprint_score || 0;
        const behaviorScore = data.behavior_anomaly_score || 0;
        const chargebackScore = data.chargeback_risk_score || 0;

        const overallRiskScore = 
          (multiAccountScore * weights.multiAccount) +
          (deviceScore * weights.deviceFingerprint) +
          (behaviorScore * weights.behaviorAnomaly) +
          (chargebackScore * weights.chargebackRisk);

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

        // Collect all flags
        const flags = [
          ...(data.multi_account_signals || []),
          ...(data.device_fingerprint_signals || []),
          ...(data.chargeback_risk_signals || [])
        ];

        batch.update(doc.ref, {
          overall_risk_score: overallRiskScore,
          risk_level: riskLevel,
          flags: flags,
          last_updated: Timestamp.now()
        });

        // Auto-action for critical risk
        if (riskLevel === 'critical' && !data.action_taken) {
          // Flag for review or temporary restriction
          await db.collection('users').doc(userId).update({
            flagged_for_fraud_review: true,
            fraud_review_reason: flags.join(', '),
            fraud_flagged_at: Timestamp.now()
          });

          batch.update(doc.ref, {
            action_taken: 'flagged_for_review',
            action_taken_at: Timestamp.now()
          });
        }

        count++;
        if (count % 500 === 0) {
          await batch.commit();
          console.log(`Updated ${count} fraud risk scores`);
        }
      }

      if (count % 500 !== 0) {
        await batch.commit();
      }

      console.log(`Fraud risk calculation complete: ${count} users`);

    } catch (error) {
      console.error('Error calculating overall fraud risk:', error);
      throw error;
    }
  });

// Daily fraud metrics aggregation
export const aggregateFraudMetrics = functions.pubsub
  .schedule('0 6 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      console.log(`Aggregating fraud metrics for ${dateStr}`);

      // Get fraud alerts from yesterday
      const alertsSnapshot = await db.collection('fraud_alerts')
        .where('timestamp', '>=', Timestamp.fromDate(yesterday))
        .where('timestamp', '<', Timestamp.fromDate(new Date(yesterday.getTime() + 86400000)))
        .get();

      const metrics = {
        multi_account_alerts: 0,
        suspicious_device_alerts: 0,
        chargeback_risk_alerts: 0,
        behavior_anomaly_alerts: 0,
        critical_alerts: 0,
        high_alerts: 0,
        medium_alerts: 0,
        total_alerts: alertsSnapshot.size
      };

      alertsSnapshot.forEach(doc => {
        const alert = doc.data();
        
        if (alert.alert_type === 'multi_account_suspected') metrics.multi_account_alerts++;
        if (alert.alert_type === 'suspicious_device') metrics.suspicious_device_alerts++;
        if (alert.alert_type === 'high_chargeback_risk') metrics.chargeback_risk_alerts++;
        if (alert.alert_type === 'behavior_anomaly_detected') metrics.behavior_anomaly_alerts++;
        
        if (alert.severity === 'critical') metrics.critical_alerts++;
        if (alert.severity === 'high') metrics.high_alerts++;
        if (alert.severity === 'medium') metrics.medium_alerts++;
      });

      // Get users by risk level
      const fraudScoresSnapshot = await db.collection('fraud_scores').get();
      const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };

      fraudScoresSnapshot.forEach(doc => {
        const score = doc.data();
        const riskLevel = score.risk_level || 'low';
        riskDistribution[riskLevel as keyof typeof riskDistribution]++;
      });

      // Store aggregated metrics
      await db.collection('analytics_daily').doc(`fraud_metrics_${dateStr}`).set({
        metric_type: 'fraud_detection',
        date: dateStr,
        timestamp: Timestamp.now(),
        alerts: metrics,
        risk_distribution: riskDistribution
      });

      console.log(`Fraud metrics aggregated for ${dateStr}:`, { metrics, riskDistribution });

    } catch (error) {
      console.error('Error aggregating fraud metrics:', error);
      throw error;
    }
  });

// Helper function to calculate distance between two coordinates
function calculateDistance(
  loc1: { lat: number; lng: number },
  loc2: { lat: number; lng: number }
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLng = toRad(loc2.lng - loc1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(loc1.lat)) * Math.cos(toRad(loc2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}