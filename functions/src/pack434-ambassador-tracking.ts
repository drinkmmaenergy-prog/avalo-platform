/**
 * PACK 434 — Global Ambassador Program & Offline Partner Expansion Engine
 * Referral & Tracking System (Offline Safe Version)
 * 
 * Handles offline attribution, QR codes, event check-ins, and geo-validation
 */

import { firestore } from 'firebase-admin';
import { AmbassadorProfile } from './pack434-ambassador-types';

// ============================================================================
// TRACKING TYPES
// ============================================================================

export interface ReferralTracking {
  id: string;
  ambassadorId: string;
  userId: string; // Referred user
  
  // Attribution method
  method: 'code' | 'qr' | 'event' | 'link' | 'manual';
  referralCode?: string;
  qrCode?: string;
  eventId?: string;
  
  // Location validation
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: firestore.Timestamp;
    geoValidated: boolean;
    city?: string;
    country?: string;
  };
  
  // Device information
  device: {
    deviceId: string;
    platform: 'ios' | 'android' | 'web';
    ipAddress: string;
    userAgent: string;
  };
  
  // Fraud detection
  fraudCheck: {
    vpnDetected: boolean;
    fakeGpsDetected: boolean;
    suspiciousDevice: boolean;
    riskScore: number; // 0-100
    flags: string[];
  };
  
  // Conversion funnel
  funnel: {
    registered: boolean;
    registeredAt?: firestore.Timestamp;
    kycCompleted: boolean;
    kycCompletedAt?: firestore.Timestamp;
    profileCompleted: boolean;
    profileCompletedAt?: firestore.Timestamp;
    firstPurchase: boolean;
    firstPurchaseAt?: firestore.Timestamp;
  };
  
  // Status
  status: 'pending' | 'verified' | 'converted' | 'invalid' | 'fraudulent';
  
  // Timestamps
  createdAt: firestore.Timestamp;
  verifiedAt?: firestore.Timestamp;
}

export interface EventCheckIn {
  id: string;
  eventId: string;
  ambassadorId: string;
  userId: string;
  
  // Check-in details
  checkInTime: firestore.Timestamp;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  
  // Validation
  withinRadius: boolean;
  withinTimeWindow: boolean;
  geoValidated: boolean;
  
  // Attribution
  attributed: boolean;
  attributionReason?: string;
  
  // Device
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  
  // Fraud checks
  fraudFlags: string[];
}

export interface QRCodeScan {
  id: string;
  qrCode: string;
  ambassadorId: string;
  userId?: string;
  
  // Scan details
  scannedAt: firestore.Timestamp;
  action: 'register' | 'download' | 'join_event' | 'creator_onboard' | 'partner';
  
  // Location
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  
  // Device
  device: {
    deviceId: string;
    platform: 'ios' | 'android' | 'web';
    ipAddress: string;
  };
  
  // Validation
  valid: boolean;
  invalidReason?: string;
  
  // Fraud
  fraudScore: number;
  fraudFlags: string[];
}

export interface GeoValidationResult {
  valid: boolean;
  vpnDetected: boolean;
  fakeGpsDetected: boolean;
  locationConsistent: boolean;
  withinExpectedRadius: boolean;
  suspiciousPattern: boolean;
  riskScore: number;
  flags: string[];
}

// ============================================================================
// TRACKING SERVICE
// ============================================================================

export class AmbassadorTrackingService {
  private db: firestore.Firestore;

  constructor(db: firestore.Firestore) {
    this.db = db;
  }

  /**
   * Track referral by code
   */
  async trackReferralByCode(
    referralCode: string,
    userId: string,
    deviceInfo: any,
    location?: any
  ): Promise<ReferralTracking> {
    // Find ambassador by referral code
    const ambassadorsSnap = await this.db
      .collection('ambassadors')
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();

    if (ambassadorsSnap.empty) {
      throw new Error('Invalid referral code');
    }

    const ambassador = ambassadorsSnap.docs[0].data() as AmbassadorProfile;

    // Check if user already referred
    const existingReferral = await this.db
      .collection('referral_tracking')
      .where('userId', '==', userId)
      .get();

    if (!existingReferral.empty) {
      throw new Error('User already referred by another ambassador');
    }

    // Perform fraud checks
    const fraudCheck = await this.performFraudChecks(deviceInfo, location, ambassador);

    // Create tracking record
    const tracking: ReferralTracking = {
      id: this.db.collection('referral_tracking').doc().id,
      ambassadorId: ambassador.id,
      userId,
      method: 'code',
      referralCode,
      location: location
        ? {
            ...location,
            timestamp: firestore.Timestamp.now(),
            geoValidated: false,
          }
        : undefined,
      device: deviceInfo,
      fraudCheck,
      funnel: {
        registered: false,
        kycCompleted: false,
        profileCompleted: false,
        firstPurchase: false,
      },
      status: fraudCheck.riskScore > 70 ? 'invalid' : 'pending',
      createdAt: firestore.Timestamp.now(),
    };

    await this.db.collection('referral_tracking').doc(tracking.id).set(tracking);

    // Validate location if provided
    if (location) {
      await this.validateLocation(tracking.id, ambassador);
    }

    return tracking;
  }

  /**
   * Track QR code scan
   */
  async trackQRCodeScan(
    qrCode: string,
    action: QRCodeScan['action'],
    deviceInfo: any,
    location?: any,
    userId?: string
  ): Promise<QRCodeScan> {
    // Extract ambassador ID from QR code
    const ambassadorId = this.extractAmbassadorIdFromQR(qrCode);

    // Perform fraud detection
    const fraudResult = await this.detectQRFraud(qrCode, deviceInfo, location);

    const scan: QRCodeScan = {
      id: this.db.collection('qr_scans').doc().id,
      qrCode,
      ambassadorId,
      userId,
      scannedAt: firestore.Timestamp.now(),
      action,
      location,
      device: deviceInfo,
      valid: fraudResult.riskScore < 70,
      invalidReason: fraudResult.riskScore >= 70 ? 'High fraud risk' : undefined,
      fraudScore: fraudResult.riskScore,
      fraudFlags: fraudResult.flags,
    };

    await this.db.collection('qr_scans').doc(scan.id).set(scan);

    // If user ID provided, create referral tracking
    if (userId && scan.valid) {
      await this.trackReferralByCode(
        (await this.getAmbassador(ambassadorId)).referralCode,
        userId,
        deviceInfo,
        location
      );
    }

    return scan;
  }

  /**
   * Track event check-in
   */
  async trackEventCheckIn(
    eventId: string,
    userId: string,
    ambassadorId: string,
    location: { latitude: number; longitude: number; accuracy: number },
    deviceInfo: any
  ): Promise<EventCheckIn> {
    // Get event details
    const eventDoc = await this.db.collection('events').doc(eventId).get();
    
    if (!eventDoc.exists) {
      throw new Error('Event not found');
    }

    const event = eventDoc.data();
    const eventLocation = event!.location;
    const eventTime = event!.startTime.toDate();
    const now = new Date();

    // Check if within radius
    const distance = this.calculateDistance(
      location.latitude,
      location.longitude,
      eventLocation.latitude,
      eventLocation.longitude
    );

    const withinRadius = distance <= (event!.radius || 1); // 1 km default

    // Check if within time window (1 hour before to 2 hours after)
    const hoursBefore = (now.getTime() - eventTime.getTime()) / (1000 * 60 * 60);
    const withinTimeWindow = hoursBefore >= -1 && hoursBefore <= 2;

    // Perform geo-validation
    const geoValidation = await this.validateGeoLocation(location, deviceInfo);

    const checkIn: EventCheckIn = {
      id: this.db.collection('event_checkins').doc().id,
      eventId,
      ambassadorId,
      userId,
      checkInTime: firestore.Timestamp.now(),
      location,
      withinRadius,
      withinTimeWindow,
      geoValidated: geoValidation.valid,
      attributed: withinRadius && withinTimeWindow && geoValidation.valid,
      attributionReason: !withinRadius
        ? 'Outside event radius'
        : !withinTimeWindow
        ? 'Outside event time window'
        : !geoValidation.valid
        ? 'Failed geo-validation'
        : undefined,
      deviceId: deviceInfo.deviceId,
      platform: deviceInfo.platform,
      fraudFlags: geoValidation.flags,
    };

    await this.db.collection('event_checkins').doc(checkIn.id).set(checkIn);

    // Create referral tracking if attributed and not already referred
    if (checkIn.attributed) {
      try {
        await this.trackReferralByCode(
          (await this.getAmbassador(ambassadorId)).referralCode,
          userId,
          deviceInfo,
          location
        );
      } catch (error) {
        // User may already be referred, that's ok
        console.log('Event check-in attribution failed:', error);
      }
    }

    return checkIn;
  }

  /**
   * Update referral funnel
   */
  async updateReferralFunnel(
    userId: string,
    step: keyof ReferralTracking['funnel'],
    completed: boolean
  ): Promise<void> {
    const trackingSnap = await this.db
      .collection('referral_tracking')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (trackingSnap.empty) {
      return; // No referral tracking for this user
    }

    const trackingDoc = trackingSnap.docs[0];
    const tracking = trackingDoc.data() as ReferralTracking;

    const updateData: any = {
      [`funnel.${step}`]: completed,
    };

    if (completed) {
      updateData[`funnel.${step}At`] = firestore.Timestamp.now();

      // Update status based on funnel progress
      if (step === 'kycCompleted' && !tracking.funnel.kycCompleted) {
        updateData.status = 'verified';
        updateData.verifiedAt = firestore.Timestamp.now();
      } else if (step === 'firstPurchase' && !tracking.funnel.firstPurchase) {
        updateData.status = 'converted';
      }
    }

    await this.db.collection('referral_tracking').doc(trackingDoc.id).update(updateData);
  }

  /**
   * Perform fraud checks
   */
  private async performFraudChecks(
    deviceInfo: any,
    location: any,
    ambassador: AmbassadorProfile
  ): Promise<ReferralTracking['fraudCheck']> {
    const flags: string[] = [];
    let riskScore = 0;

    // Check for VPN
    const vpnDetected = await this.detectVPN(deviceInfo.ipAddress);
    if (vpnDetected) {
      flags.push('vpn_detected');
      riskScore += 30;
    }

    // Check for fake GPS
    let fakeGpsDetected = false;
    if (location) {
      fakeGpsDetected = await this.detectFakeGPS(location, deviceInfo);
      if (fakeGpsDetected) {
        flags.push('fake_gps_detected');
        riskScore += 40;
      }
    }

    // Check for suspicious device patterns
    const suspiciousDevice = await this.checkSuspiciousDevice(deviceInfo.deviceId);
    if (suspiciousDevice) {
      flags.push('suspicious_device');
      riskScore += 20;
    }

    // Check for mass scans from same device
    const massScans = await this.detectMassScans(deviceInfo.deviceId);
    if (massScans) {
      flags.push('mass_scans_detected');
      riskScore += 25;
    }

    // Check location consistency
    if (location && ambassador.region) {
      const inRegion = await this.checkLocationInRegion(location, ambassador.region);
      if (!inRegion) {
        flags.push('location_outside_region');
        riskScore += 15;
      }
    }

    return {
      vpnDetected,
      fakeGpsDetected,
      suspiciousDevice,
      riskScore: Math.min(riskScore, 100),
      flags,
    };
  }

  /**
   * Detect VPN usage
   */
  private async detectVPN(ipAddress: string): Promise<boolean> {
    // Integration with VPN detection service (e.g., IPQualityScore, VPNapi)
    // This is a placeholder - implement actual provider integration
    
    // Check if IP is in known VPN ranges
    // For now, return false
    return false;
  }

  /**
   * Detect fake GPS
   */
  private async detectFakeGPS(location: any, deviceInfo: any): Promise<boolean> {
    // Check accuracy - fake GPS often has perfect accuracy
    if (location.accuracy < 5) {
      return true;
    }

    // Check for developer options enabled (Android)
    if (deviceInfo.platform === 'android' && deviceInfo.developerOptionsEnabled) {
      return true;
    }

    // Check for known GPS spoofing apps
    // This would require device permissions and scanning
    return false;
  }

  /**
   * Check suspicious device
   */
  private async checkSuspiciousDevice(deviceId: string): Promise<boolean> {
    // Check how many referrals this device has generated
    const referralsSnap = await this.db
      .collection('referral_tracking')
      .where('device.deviceId', '==', deviceId)
      .get();

    // Suspicious if more than 10 referrals from same device
    return referralsSnap.size > 10;
  }

  /**
   * Detect mass scans
   */
  private async detectMassScans(deviceId: string): Promise<boolean> {
    // Check scans in last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const scansSnap = await this.db
      .collection('qr_scans')
      .where('device.deviceId', '==', deviceId)
      .where('scannedAt', '>=', firestore.Timestamp.fromDate(oneDayAgo))
      .get();

    // Suspicious if more than 20 scans in 24 hours
    return scansSnap.size > 20;
  }

  /**
   * Check location in region
   */
  private async checkLocationInRegion(
    location: { latitude: number; longitude: number },
    region: AmbassadorProfile['region']
  ): Promise<boolean> {
    if (!region.coordinates) {
      return true; // Can't validate without region coordinates
    }

    const distance = this.calculateDistance(
      location.latitude,
      location.longitude,
      region.coordinates.latitude,
      region.coordinates.longitude
    );

    const maxRadius = region.radius || 50; // Default 50km
    return distance <= maxRadius;
  }

  /**
   * Validate location
   */
  private async validateLocation(
    trackingId: string,
    ambassador: AmbassadorProfile
  ): Promise<void> {
    const trackingDoc = await this.db.collection('referral_tracking').doc(trackingId).get();
    const tracking = trackingDoc.data() as ReferralTracking;

    if (!tracking.location) {
      return;
    }

    const validation = await this.validateGeoLocation(
      {
        latitude: tracking.location.latitude,
        longitude: tracking.location.longitude,
        accuracy: tracking.location.accuracy,
      },
      tracking.device
    );

    await this.db.collection('referral_tracking').doc(trackingId).update({
      'location.geoValidated': validation.valid,
      'fraudCheck.riskScore': validation.riskScore,
      'fraudCheck.flags': firestore.FieldValue.arrayUnion(...validation.flags),
    });
  }

  /**
   * Validate geo location
   */
  private async validateGeoLocation(
    location: { latitude: number; longitude: number; accuracy: number },
    deviceInfo: any
  ): Promise<GeoValidationResult> {
    const flags: string[] = [];
    let riskScore = 0;

    // Check accuracy
    if (location.accuracy > 100) {
      flags.push('low_accuracy');
      riskScore += 10;
    }

    // Check for impossible coordinates
    if (
      location.latitude < -90 ||
      location.latitude > 90 ||
      location.longitude < -180 ||
      location.longitude > 180
    ) {
      flags.push('invalid_coordinates');
      riskScore += 50;
    }

    // Check for common fake GPS coordinates (0, 0)
    if (location.latitude === 0 && location.longitude === 0) {
      flags.push('null_island');
      riskScore += 60;
    }

    // Detect VPN
    const vpnDetected = await this.detectVPN(deviceInfo.ipAddress);
    if (vpnDetected) {
      flags.push('vpn_detected');
      riskScore += 30;
    }

    // Detect fake GPS
    const fakeGpsDetected = await this.detectFakeGPS(location, deviceInfo);

    return {
      valid: riskScore < 50,
      vpnDetected,
      fakeGpsDetected,
      locationConsistent: riskScore < 30,
      withinExpectedRadius: true, // Would need ambassador region data
      suspiciousPattern: flags.length > 2,
      riskScore: Math.min(riskScore, 100),
      flags,
    };
  }

  /**
   * Detect QR fraud
   */
  private async detectQRFraud(
    qrCode: string,
    deviceInfo: any,
    location?: any
  ): Promise<GeoValidationResult> {
    const flags: string[] = [];
    let riskScore = 0;

    // Check for QR farming (same QR scanned multiple times from same device)
    const scansSnap = await this.db
      .collection('qr_scans')
      .where('qrCode', '==', qrCode)
      .where('device.deviceId', '==', deviceInfo.deviceId)
      .get();

    if (scansSnap.size > 3) {
      flags.push('qr_farming');
      riskScore += 40;
    }

    // Check for mass scanning
    const massScans = await this.detectMassScans(deviceInfo.deviceId);
    if (massScans) {
      flags.push('mass_scans');
      riskScore += 30;
    }

    // Validate location if provided
    if (location) {
      const geoValidation = await this.validateGeoLocation(location, deviceInfo);
      riskScore += geoValidation.riskScore * 0.5; // Weight location issues lower
      flags.push(...geoValidation.flags);
    }

    return {
      valid: riskScore < 70,
      vpnDetected: await this.detectVPN(deviceInfo.ipAddress),
      fakeGpsDetected: location ? await this.detectFakeGPS(location, deviceInfo) : false,
      locationConsistent: riskScore < 50,
      withinExpectedRadius: true,
      suspiciousPattern: flags.length > 2,
      riskScore: Math.min(riskScore, 100),
      flags,
    };
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
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

  /**
   * Extract ambassador ID from QR code
   */
  private extractAmbassadorIdFromQR(qrCode: string): string {
    // Extract from URL format: https://avalo.app/r/{REFERRAL_CODE}
    // Then lookup ambassador by referral code
    // This is a placeholder - implement actual extraction logic
    return qrCode.split('/').pop() || '';
  }

  /**
   * Get ambassador
   */
  private async getAmbassador(ambassadorId: string): Promise<AmbassadorProfile> {
    const doc = await this.db.collection('ambassadors').doc(ambassadorId).get();
    
    if (!doc.exists) {
      throw new Error('Ambassador not found');
    }

    return doc.data() as AmbassadorProfile;
  }
}

// ============================================================================
// EXPORT FACTORY
// ============================================================================

export function createAmbassadorTrackingService(
  db: firestore.Firestore
): AmbassadorTrackingService {
  return new AmbassadorTrackingService(db);
}
