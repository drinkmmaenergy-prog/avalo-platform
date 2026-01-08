/**
 * PACK 434 — Global Ambassador Program & Offline Partner Expansion Engine
 * Fraud & Risk Engine Extension
 * 
 * Detects QR farming, fake attendees, ambassador rings, and GPS forgery
 * Integrates with PACK 302 fraud graph
 */

import { firestore } from 'firebase-admin';
import { AmbassadorProfile } from './pack434-ambassador-types';

// ============================================================================
// FRAUD DETECTION TYPES
// ============================================================================

export enum FraudType {
  QR_FARMING = 'qr_farming',
  FAKE_ATTENDEES = 'fake_attendees',
  FAKE_GROUPS = 'fake_groups',
  AMBASSADOR_RING = 'ambassador_ring',
  MULTI_DEVICE_SPOOFING = 'multi_device_spoofing',
  GPS_FORGERY_CLUSTER = 'gps_forgery_cluster',
  MASS_REFERRALS = 'mass_referrals',
  FAKE_CONVERSIONS = 'fake_conversions',
}

export interface FraudAlert {
  id: string;
  type: FraudType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Entities involved
  ambassadorIds: string[];
  userIds?: string[];
  deviceIds?: string[];
  eventIds?: string[];
  
  // Detection details
  detectedAt: firestore.Timestamp;
  detectionMethod: string;
  confidence: number; // 0-1
  
  // Evidence
  evidence: {
    description: string;
    dataPoints: any[];
    patterns: string[];
  };
  
  // Risk assessment
  estimatedLoss: number;
  affectedCount: number;
  
  // Status
  status: 'open' | 'investigating' | 'confirmed' | 'false_positive' | 'resolved';
  reviewedBy?: string;
  reviewedAt?: firestore.Timestamp;
  resolution?: string;
  
  // Actions taken
  actions: {
    type: 'earnings_freeze' | 'suspension' | 'termination' | 'warning' | 'manual_review';
    takenAt: firestore.Timestamp;
    takenBy: string;
    details?: string;
  }[];
}

export interface FraudPattern {
  type: FraudType;
  indicators: string[];
  threshold: number;
  weight: number;
}

export interface AmbassadorRing {
  id: string;
  ambassadorIds: string[];
  ringType: 'cross_referral' | 'coordinated_fraud' | 'fake_network';
  
  // Detection
  detectedAt: firestore.Timestamp;
  confidence: number;
  
  // Evidence
  sharedDevices: string[];
  sharedLocations: string[];
  crossReferrals: number;
  suspiciousPatterns: string[];
  
  // Impact
  totalEarnings: number;
  affectedUsers: number;
  
  status: 'active' | 'investigating' | 'confirmed' | 'disbanded';
}

// ============================================================================
// FRAUD DETECTION SERVICE
// ============================================================================

export class FraudDetectionService {
  private db: firestore.Firestore;

  // Fraud pattern definitions
  private fraudPatterns: FraudPattern[] = [
    {
      type: FraudType.QR_FARMING,
      indicators: [
        'same_qr_multiple_scans',
        'same_device_multiple_qrs',
        'rapid_sequential_scans',
        'location_jumping',
      ],
      threshold: 0.7,
      weight: 0.8,
    },
    {
      type: FraudType.FAKE_ATTENDEES,
      indicators: [
        'users_never_active',
        'identical_profiles',
        'same_device_multiple_accounts',
        'location_mismatch',
      ],
      threshold: 0.75,
      weight: 0.9,
    },
    {
      type: FraudType.AMBASSADOR_RING,
      indicators: [
        'mutual_referrals',
        'shared_devices',
        'coordinated_timing',
        'same_ip_range',
      ],
      threshold: 0.8,
      weight: 1.0,
    },
    {
      type: FraudType.GPS_FORGERY_CLUSTER,
      indicators: [
        'perfect_accuracy',
        'impossible_speed',
        'vpn_detected',
        'developer_mode',
      ],
      threshold: 0.65,
      weight: 0.7,
    },
  ];

  constructor(db: firestore.Firestore) {
    this.db = db;
  }

  /**
   * Run comprehensive fraud detection
   */
  async runFraudDetection(ambassadorId?: string): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];

    if (ambassadorId) {
      // Check specific ambassador
      alerts.push(...(await this.detectQRFarming(ambassadorId)));
      alerts.push(...(await this.detectFakeAttendees(ambassadorId)));
      alerts.push(...(await this.detectMassReferrals(ambassadorId)));
    } else {
      // Run full system check
      alerts.push(...(await this.detectAmbassadorRings()));
      alerts.push(...(await this.detectGPSForgeryClusters()));
      alerts.push(...(await this.detectMultiDeviceSpoofing()));
    }

    // Save alerts
    for (const alert of alerts) {
      await this.saveAlert(alert);
      
      // Auto-action based on severity
      await this.takeAutoAction(alert);
    }

    return alerts;
  }

  /**
   * Detect QR farming
   */
  private async detectQRFarming(ambassadorId: string): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];

    // Get all QR scans for this ambassador
    const scansSnap = await this.db
      .collection('qr_scans')
      .where('ambassadorId', '==', ambassadorId)
      .where('scannedAt', '>=', this.getTimeAgo(7, 'days'))
      .get();

    // Group by device
    const deviceScans = new Map<string, any[]>();
    
    for (const scanDoc of scansSnap.docs) {
      const scan = scanDoc.data();
      const deviceId = scan.device.deviceId;
      
      if (!deviceScans.has(deviceId)) {
        deviceScans.set(deviceId, []);
      }
      
      deviceScans.get(deviceId)!.push(scan);
    }

    // Check for suspicious patterns
    for (const [deviceId, scans] of deviceScans) {
      // Pattern 1: Too many scans from same device
      if (scans.length > 50) {
        alerts.push(this.createAlert({
          type: FraudType.QR_FARMING,
          severity: 'high',
          ambassadorIds: [ambassadorId],
          deviceIds: [deviceId],
          evidence: {
            description: `Device ${deviceId} scanned QR code ${scans.length} times in 7 days`,
            dataPoints: scans.map((s) => ({
              timestamp: s.scannedAt,
              qrCode: s.qrCode,
            })),
            patterns: ['excessive_scans'],
          },
          estimatedLoss: scans.length * 2, // Assuming $2 CPI
          affectedCount: scans.length,
          confidence: 0.9,
        }));
      }

      // Pattern 2: Rapid sequential scans
      const rapidScans = this.detectRapidScans(scans);
      if (rapidScans.length > 10) {
        alerts.push(this.createAlert({
          type: FraudType.QR_FARMING,
          severity: 'medium',
          ambassadorIds: [ambassadorId],
          deviceIds: [deviceId],
          evidence: {
            description: `Device performed ${rapidScans.length} rapid sequential scans`,
            dataPoints: rapidScans,
            patterns: ['rapid_scanning'],
          },
          estimatedLoss: rapidScans.length * 2,
          affectedCount: rapidScans.length,
          confidence: 0.8,
        }));
      }

      // Pattern 3: Location jumping (impossible travel speeds)
      const locationJumps = this.detectLocationJumping(scans);
      if (locationJumps.length > 0) {
        alerts.push(this.createAlert({
          type: FraudType.GPS_FORGERY_CLUSTER,
          severity: 'high',
          ambassadorIds: [ambassadorId],
          deviceIds: [deviceId],
          evidence: {
            description: `Detected ${locationJumps.length} impossible location changes`,
            dataPoints: locationJumps,
            patterns: ['location_jumping', 'gps_spoofing'],
          },
          estimatedLoss: locationJumps.length * 5,
          affectedCount: locationJumps.length,
          confidence: 0.95,
        }));
      }
    }

    return alerts;
  }

  /**
   * Detect fake attendees
   */
  private async detectFakeAttendees(ambassadorId: string): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];

    // Get events for this ambassador
    const eventsSnap = await this.db
      .collection('partner_events')
      .where('ambassadorId', '==', ambassadorId)
      .where('status', '==', 'completed')
      .get();

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data();
      
      // Get check-ins for this event
      const checkInsSnap = await this.db
        .collection('event_checkins')
        .where('eventId', '==', event.id)
        .get();

      const userIds = checkInsSnap.docs.map((doc) => doc.data().userId);
      
      // Check if users are real
      const fakeUsers = await this.identifyFakeUsers(userIds);
      
      if (fakeUsers.length > event.attendees * 0.3) {
        // More than 30% fake users
        alerts.push(this.createAlert({
          type: FraudType.FAKE_ATTENDEES,
          severity: 'critical',
          ambassadorIds: [ambassadorId],
          eventIds: [event.id],
          userIds: fakeUsers,
          evidence: {
            description: `${fakeUsers.length} of ${userIds.length} attendees appear to be fake`,
            dataPoints: fakeUsers.map((userId) => ({ userId })),
            patterns: ['inactive_users', 'incomplete_profiles'],
          },
          estimatedLoss: fakeUsers.length * 10,
          affectedCount: fakeUsers.length,
          confidence: 0.85,
        }));
      }
    }

    return alerts;
  }

  /**
   * Detect mass referrals
   */
  private async detectMassReferrals(ambassadorId: string): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];

    // Get referrals in last 24 hours
    const referralsSnap = await this.db
      .collection('referral_tracking')
      .where('ambassadorId', '==', ambassadorId)
      .where('createdAt', '>=', this.getTimeAgo(1, 'days'))
      .get();

    const referrals = referralsSnap.docs.map((doc) => doc.data());

    // Check for suspicious patterns
    if (referrals.length > 100) {
      // More than 100 referrals in 24 hours
      const deviceGroups = this.groupByDevice(referrals);
      
      for (const [deviceId, refs] of Object.entries(deviceGroups)) {
        if ((refs as any[]).length > 20) {
          alerts.push(this.createAlert({
            type: FraudType.MASS_REFERRALS,
            severity: 'high',
            ambassadorIds: [ambassadorId],
            deviceIds: [deviceId],
            evidence: {
              description: `${(refs as any[]).length} referrals from single device in 24 hours`,
              dataPoints: refs as any[],
              patterns: ['mass_referrals', 'device_farming'],
            },
            estimatedLoss: (refs as any[]).length * 10,
            affectedCount: (refs as any[]).length,
            confidence: 0.9,
          }));
        }
      }
    }

    return alerts;
  }

  /**
   * Detect ambassador rings
   */
  private async detectAmbassadorRings(): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];

    // Get all ambassadors
    const ambassadorsSnap = await this.db
      .collection('ambassadors')
      .where('status', '==', 'active')
      .get();

    const ambassadors = ambassadorsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[];

    // Analyze cross-referrals
    for (let i = 0; i < ambassadors.length; i++) {
      for (let j = i + 1; j < ambassadors.length; j++) {
        const amb1 = ambassadors[i];
        const amb2 = ambassadors[j];

        const ringScore = await this.calculateRingScore(amb1.id, amb2.id);

        if (ringScore > 0.8) {
          // Likely ring detected
          alerts.push(this.createAlert({
            type: FraudType.AMBASSADOR_RING,
            severity: 'critical',
            ambassadorIds: [amb1.id, amb2.id],
            evidence: {
              description: `Suspected collusion between ambassadors`,
              dataPoints: [
                { ambassador1: amb1.id, ambassador2: amb2.id, ringScore },
              ],
              patterns: ['cross_referrals', 'shared_resources'],
            },
            estimatedLoss: 1000, // Estimated
            affectedCount: 2,
            confidence: ringScore,
          }));
        }
      }
    }

    return alerts;
  }

  /**
   * Detect GPS forgery clusters
   */
  private async detectGPSForgeryClusters(): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];

    // Get recent check-ins with location data
    const checkInsSnap = await this.db
      .collection('event_checkins')
      .where('checkInTime', '>=', this.getTimeAgo(7, 'days'))
      .get();

    const suspiciousLocations = new Map<string, any[]>();

    for (const checkInDoc of checkInsSnap.docs) {
      const checkIn = checkInDoc.data();
      
      // Check for GPS forgery indicators
      if (
        checkIn.location.accuracy < 5 || // Perfect accuracy
        checkIn.fraudFlags?.includes('fake_gps_detected')
      ) {
        const deviceId = checkIn.deviceId;
        
        if (!suspiciousLocations.has(deviceId)) {
          suspiciousLocations.set(deviceId, []);
        }
        
        suspiciousLocations.get(deviceId)!.push(checkIn);
      }
    }

    for (const [deviceId, checkIns] of suspiciousLocations) {
      if (checkIns.length > 5) {
        alerts.push(this.createAlert({
          type: FraudType.GPS_FORGERY_CLUSTER,
          severity: 'high',
          deviceIds: [deviceId],
          ambassadorIds: Array.from(new Set(checkIns.map((c) => c.ambassadorId))),
          evidence: {
            description: `Device shows ${checkIns.length} instances of GPS forgery`,
            dataPoints: checkIns,
            patterns: ['gps_spoofing', 'location_forgery'],
          },
          estimatedLoss: checkIns.length * 5,
          affectedCount: checkIns.length,
          confidence: 0.85,
        }));
      }
    }

    return alerts;
  }

  /**
   * Detect multi-device spoofing
   */
  private async detectMultiDeviceSpoofing(): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];

    // Get users with multiple devices
    const referralsSnap = await this.db
      .collection('referral_tracking')
      .where('createdAt', '>=', this.getTimeAgo(30, 'days'))
      .get();

    const userDevices = new Map<string, Set<string>>();

    for (const referralDoc of referralsSnap.docs) {
      const referral = referralDoc.data();
      const userId = referral.userId;
      const deviceId = referral.device.deviceId;
      
      if (!userDevices.has(userId)) {
        userDevices.set(userId, new Set());
      }
      
      userDevices.get(userId)!.add(deviceId);
    }

    // Check for suspicious multi-device patterns
    for (const [userId, devices] of userDevices) {
      if (devices.size > 3) {
        alerts.push(this.createAlert({
          type: FraudType.MULTI_DEVICE_SPOOFING,
          severity: 'medium',
          userIds: [userId],
          deviceIds: Array.from(devices),
          evidence: {
            description: `User ${userId} associated with ${devices.size} different devices`,
            dataPoints: Array.from(devices).map((d) => ({ device: d })),
            patterns: ['multi_device', 'device_spoofing'],
          },
          estimatedLoss: 0,
          affectedCount: 1,
          confidence: 0.7,
        }));
      }
    }

    return alerts;
  }

  /**
   * Calculate ring score between two ambassadors
   */
  private async calculateRingScore(amb1Id: string, amb2Id: string): Promise<number> {
    let score = 0;

    // Check for mutual referrals
    const mutualRefs = await this.checkMutualReferrals(amb1Id, amb2Id);
    if (mutualRefs > 0) {
      score += 0.4;
    }

    // Check for shared devices
    const sharedDevices = await this.checkSharedDevices(amb1Id, amb2Id);
    if (sharedDevices > 0) {
      score += 0.3;
    }

    // Check for shared IP ranges
    const sharedIPs = await this.checkSharedIPs(amb1Id, amb2Id);
    if (sharedIPs > 0) {
      score += 0.2;
    }

    // Check for coordinated timing
    const coordinated = await this.checkCoordinatedTiming(amb1Id, amb2Id);
    if (coordinated) {
      score += 0.1;
    }

    return score;
  }

  /**
   * Take automatic action based on alert
   */
  private async takeAutoAction(alert: FraudAlert): Promise<void> {
    if (alert.severity === 'critical' && alert.confidence > 0.9) {
      // Auto-suspend
      for (const ambassadorId of alert.ambassadorIds) {
        await this.suspendAmbassador(ambassadorId, alert.id);
      }
    } else if (alert.severity === 'high' && alert.confidence > 0.8) {
      // Freeze earnings
      for (const ambassadorId of alert.ambassadorIds) {
        await this.freezeEarnings(ambassadorId, alert.id);
      }
    }

    // Escalate to PACK 302 fraud graph
    await this.escalateToFraudGraph(alert);
  }

  /**
   * Suspend ambassador
   */
  private async suspendAmbassador(ambassadorId: string, alertId: string): Promise<void> {
    await this.db.collection('ambassadors').doc(ambassadorId).update({
      status: 'suspended',
      suspendedAt: firestore.Timestamp.now(),
      suspensionReason: `Fraud alert: ${alertId}`,
    });
  }

  /**
   * Freeze earnings
   */
  private async freezeEarnings(ambassadorId: string, alertId: string): Promise<void> {
    // Mark all pending earnings as frozen
    const earningsSnap = await this.db
      .collection('ambassador_earnings')
      .where('ambassadorId', '==', ambassadorId)
      .where('status', '==', 'pending')
      .get();

    const batch = this.db.batch();
    
    for (const earningDoc of earningsSnap.docs) {
      batch.update(earningDoc.ref, {
        status: 'frozen',
        frozenReason: `Fraud alert: ${alertId}`,
        frozenAt: firestore.Timestamp.now(),
      });
    }

    await batch.commit();
  }

  /**
   * Escalate to PACK 302 fraud graph
   */
  private async escalateToFraudGraph(alert: FraudAlert): Promise<void> {
    // Integration with PACK 302 fraud detection system
    await this.db.collection('fraud_graph_alerts').add({
      source: 'pack434_ambassador',
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      entities: {
        ambassadorIds: alert.ambassadorIds,
        userIds: alert.userIds || [],
        deviceIds: alert.deviceIds || [],
      },
      createdAt: firestore.Timestamp.now(),
    });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private createAlert(data: Omit<FraudAlert, 'id' | 'detectedAt' | 'status' | 'actions' | 'detectionMethod'>): FraudAlert {
    return {
      ...data,
      id: this.db.collection('fraud_alerts').doc().id,
      detectedAt: firestore.Timestamp.now(),
      detectionMethod: 'automated',
      status: 'open',
      actions: [],
    };
  }

  private async saveAlert(alert: FraudAlert): Promise<void> {
    await this.db.collection('fraud_alerts').doc(alert.id).set(alert);
  }

  private getTimeAgo(amount: number, unit: 'days' | 'hours' | 'minutes'): firestore.Timestamp {
    const now = new Date();
    
    switch (unit) {
      case 'days':
        now.setDate(now.getDate() - amount);
        break;
      case 'hours':
        now.setHours(now.getHours() - amount);
        break;
      case 'minutes':
        now.setMinutes(now.getMinutes() - amount);
        break;
    }

    return firestore.Timestamp.fromDate(now);
  }

  private detectRapidScans(scans: any[]): any[] {
    // Detect scans within 5 seconds of each other
    const rapid: any[] = [];
    
    for (let i = 1; i < scans.length; i++) {
      const timeDiff =
        scans[i].scannedAt.toMillis() - scans[i - 1].scannedAt.toMillis();
      
      if (timeDiff < 5000) {
        rapid.push({ scan1: scans[i - 1], scan2: scans[i], timeDiff });
      }
    }

    return rapid;
  }

  private detectLocationJumping(scans: any[]): any[] {
    // Detect impossible travel speeds
    const jumps: any[] = [];
    
    for (let i = 1; i < scans.length; i++) {
      if (!scans[i].location || !scans[i - 1].location) continue;

      const distance = this.calculateDistance(
        scans[i - 1].location.latitude,
        scans[i - 1].location.longitude,
        scans[i].location.latitude,
        scans[i].location.longitude
      );

      const timeDiff =
        (scans[i].scannedAt.toMillis() - scans[i - 1].scannedAt.toMillis()) /
        1000 /
        3600; // hours

      const speed = distance / timeDiff; // km/h

      if (speed > 1000) {
        // Impossible speed (faster than plane)
        jumps.push({
          from: scans[i - 1].location,
          to: scans[i].location,
          distance,
          speed,
        });
      }
    }

    return jumps;
  }

  private async identifyFakeUsers(userIds: string[]): Promise<string[]> {
    const fakeUsers: string[] = [];

    for (const userId of userIds) {
      const userDoc = await this.db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        fakeUsers.push(userId);
        continue;
      }

      const user = userDoc.data();
      
      // Check if user is real
      if (
        !user!.profileComplete ||
        !user!.lastActiveAt ||
        (user!.lastActiveAt.toMillis() < Date.now() - 7 * 24 * 60 * 60 * 1000)
      ) {
        fakeUsers.push(userId);
      }
    }

    return fakeUsers;
  }

  private groupByDevice(referrals: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    for (const ref of referrals) {
      const deviceId = ref.device.deviceId;
      
      if (!groups[deviceId]) {
        groups[deviceId] = [];
      }
      
      groups[deviceId].push(ref);
    }

    return groups;
  }

  private async checkMutualReferrals(amb1Id: string, amb2Id: string): Promise<number> {
    // Check if ambassadors refer each other's users
    const refs1 = await this.db
      .collection('referral_tracking')
      .where('ambassadorId', '==', amb1Id)
      .get();

    const refs2 = await this.db
      .collection('referral_tracking')
      .where('ambassadorId', '==', amb2Id)
      .get();

    const users1 = new Set(refs1.docs.map((d) => d.data().userId));
    const users2 = new Set(refs2.docs.map((d) => d.data().userId));

    let mutual = 0;
    
    for (const user of users1) {
      if (users2.has(user)) {
        mutual++;
      }
    }

    return mutual;
  }

  private async checkSharedDevices(amb1Id: string, amb2Id: string): Promise<number> {
    // Check for shared devices between ambassadors
    const refs1 = await this.db
      .collection('referral_tracking')
      .where('ambassadorId', '==', amb1Id)
      .get();

    const refs2 = await this.db
      .collection('referral_tracking')
      .where('ambassadorId', '==', amb2Id)
      .get();

    const devices1 = new Set(refs1.docs.map((d) => d.data().device.deviceId));
    const devices2 = new Set(refs2.docs.map((d) => d.data().device.deviceId));

    let shared = 0;
    
    for (const device of devices1) {
      if (devices2.has(device)) {
        shared++;
      }
    }

    return shared;
  }

  private async checkSharedIPs(amb1Id: string, amb2Id: string): Promise<number> {
    // Similar to checkSharedDevices but for IP addresses
    return 0; // Placeholder
  }

  private async checkCoordinatedTiming(amb1Id: string, amb2Id: string): Promise<boolean> {
    // Check if activities happen at similar times
    return false; // Placeholder
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

// ============================================================================
// EXPORT FACTORY
// ============================================================================

export function createFraudDetectionService(
  db: firestore.Firestore
): FraudDetectionService {
  return new FraudDetectionService(db);
}
