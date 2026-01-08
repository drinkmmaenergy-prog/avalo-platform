/**
 * PACK 434 — Global Ambassador Program & Offline Partner Expansion Engine
 * Offline Partner Expansion Module
 * 
 * Handles nightclubs, gyms, universities, and other physical location partnerships
 */

import { firestore } from 'firebase-admin';

// ============================================================================
// PARTNER TYPES
// ============================================================================

export enum PartnerType {
  NIGHTCLUB = 'nightclub',
  BAR = 'bar',
  GYM = 'gym',
  FITNESS_CENTER = 'fitness_center',
  UNIVERSITY = 'university',
  COWORKING_SPACE = 'coworking_space',
  RESTAURANT = 'restaurant',
  HOTEL = 'hotel',
  EVENT_VENUE = 'event_venue',
  OTHER = 'other',
}

export enum PartnerStatus {
  PROSPECT = 'prospect',
  CONTACTED = 'contacted',
  NEGOTIATING = 'negotiating',
  ACTIVE = 'active',
  PAUSED = 'paused',
  TERMINATED = 'terminated',
}

// ============================================================================
// PARTNER DATA STRUCTURES
// ============================================================================

export interface Partner {
  id: string;
  type: PartnerType;
  status: PartnerStatus;
  
  // Business info
  businessName: string;
  legalName: string;
  taxId?: string;
  
  // Contact
  contact: {
    name: string;
    email: string;
    phone: string;
    role: string;
  };
  
  // Location
  location: {
    address: string;
    city: string;
    state?: string;
    country: string;
    postalCode: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  
  // Partnership details
  ambassadorId?: string; // Managing ambassador
  
  // Marketing assets
  qrCode: string; // Partner-specific QR code
  promotionalCode: string;
  marketingKit?: {
    logoUrl: string;
    posterUrls: string[];
    digitalAssetsUrl: string;
  };
  
  // Performance
  metrics: {
    totalScans: number;
    totalSignups: number;
    totalConversions: number;
    totalRevenue: number;
  };
  
  // Contract
  contract?: {
    type: 'revenue_share' | 'fixed_fee' | 'hybrid';
    revenueSplitPercentage?: number;
    monthlyFee?: number;
    minimumGuarantee?: number;
    startDate: firestore.Timestamp;
    endDate?: firestore.Timestamp;
    contractUrl?: string;
  };
  
  // Integration
  integration?: {
    ticketingSystem?: string;
    posSystem?: string;
    apiKey?: string;
    webhookUrl?: string;
  };
  
  // Timestamps
  createdAt: firestore.Timestamp;
  activatedAt?: firestore.Timestamp;
  lastActivityAt?: firestore.Timestamp;
}

export interface PartnerEvent {
  id: string;
  partnerId: string;
  ambassadorId?: string;
  
  // Event details
  name: string;
  description: string;
  type: 'party' | 'concert' | 'fitness_class' | 'workshop' | 'speed_dating' | 'meetup' | 'other';
  
  // Timing
  startTime: firestore.Timestamp;
  endTime: firestore.Timestamp;
  
  // Location (from partner or custom)
  location: {
    name: string;
    address: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  
  // Capacity
  capacity?: number;
  attendees: number;
  checkedIn: number;
  
  // Ticketing
  ticketing?: {
    required: boolean;
    price?: number;
    currency?: string;
    ticketUrl?: string;
  };
  
  // Avalo integration
  avaloPromotion: {
    qrCode: string;
    tokenGiveaway?: number;
    vipDiscount?: number;
    creatorBooth?: boolean;
  };
  
  // Performance
  metrics: {
    qrScans: number;
    signups: number;
    revenue: number;
  };
  
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  
  createdAt: firestore.Timestamp;
  completedAt?: firestore.Timestamp;
}

export interface PartnerDashboard {
  partnerId: string;
  
  // Summary statistics
  stats: {
    totalEvents: number;
    upcomingEvents: number;
    totalAttendees: number;
    totalSignups: number;
    conversionRate: number;
    revenue: number;
  };
  
  // Recent activity
  recentScans: {
    timestamp: firestore.Timestamp;
    userId?: string;
    location: string;
    converted: boolean;
  }[];
  
  // Performance over time
  timeline: {
    date: string;
    scans: number;
    signups: number;
    revenue: number;
  }[];
  
  // Top performing events
  topEvents: {
    eventId: string;
    eventName: string;
    attendees: number;
    signups: number;
    revenue: number;
  }[];
}

export interface PartnerCoupon {
  id: string;
  partnerId: string;
  
  // Coupon details
  code: string;
  description: string;
  
  // Discount
  type: 'percentage' | 'fixed' | 'free_trial' | 'token_bonus';
  value: number;
  currency?: string;
  
  // Validity
  validFrom: firestore.Timestamp;
  validUntil?: firestore.Timestamp;
  maxUses?: number;
  usesPerUser?: number;
  
  // Usage tracking
  totalUses: number;
  
  // Restrictions
  restrictions?: {
    minPurchase?: number;
    newUsersOnly?: boolean;
    membershipTypes?: string[];
  };
  
  status: 'active' | 'paused' | 'expired';
  
  createdAt: firestore.Timestamp;
}

// ============================================================================
// PARTNER SERVICE
// ============================================================================

export class PartnerExpansionService {
  private db: firestore.Firestore;

  constructor(db: firestore.Firestore) {
    this.db = db;
  }

  /**
   * Create partner
   */
  async createPartner(
    data: Omit<Partner, 'id' | 'qrCode' | 'promotionalCode' | 'metrics' | 'createdAt'>,
    ambassadorId?: string
  ): Promise<Partner> {
    const partnerId = this.db.collection('partners').doc().id;
    
    const partner: Partner = {
      ...data,
      id: partnerId,
      qrCode: this.generatePartnerQRCode(partnerId),
      promotionalCode: this.generatePromotionalCode(data.businessName),
      metrics: {
        totalScans: 0,
        totalSignups: 0,
        totalConversions: 0,
        totalRevenue: 0,
      },
      ambassadorId,
      createdAt: firestore.Timestamp.now(),
    };

    await this.db.collection('partners').doc(partnerId).set(partner);

    return partner;
  }

  /**
   * Activate partner
   */
  async activatePartner(partnerId: string): Promise<void> {
    await this.db.collection('partners').doc(partnerId).update({
      status: PartnerStatus.ACTIVE,
      activatedAt: firestore.Timestamp.now(),
    });

    // Generate marketing kit
    await this.generateMarketingKit(partnerId);
  }

  /**
   * Create partner event
   */
  async createPartnerEvent(
    partnerId: string,
    data: Omit<PartnerEvent, 'id' | 'partnerId' | 'attendees' | 'checkedIn' | 'metrics' | 'status' | 'createdAt'>
  ): Promise<PartnerEvent> {
    const partner = await this.getPartner(partnerId);
    
    const eventId = this.db.collection('partner_events').doc().id;
    
    const event: PartnerEvent = {
      ...data,
      id: eventId,
      partnerId,
      attendees: 0,
      checkedIn: 0,
      avaloPromotion: {
        ...data.avaloPromotion,
        qrCode: `https://avalo.app/event/${eventId}`,
      },
      metrics: {
        qrScans: 0,
        signups: 0,
        revenue: 0,
      },
      status: 'scheduled',
      createdAt: firestore.Timestamp.now(),
    };

    await this.db.collection('partner_events').doc(eventId).set(event);

    return event;
  }

  /**
   * Track partner scan
   */
  async trackPartnerScan(
    partnerId: string,
    userId?: string,
    location?: any,
    deviceInfo?: any
  ): Promise<void> {
    // Update partner metrics
    await this.db.collection('partners').doc(partnerId).update({
      'metrics.totalScans': firestore.FieldValue.increment(1),
      lastActivityAt: firestore.Timestamp.now(),
    });

    // Record scan activity
    await this.db.collection('partner_scans').add({
      partnerId,
      userId,
      location,
      deviceInfo,
      scannedAt: firestore.Timestamp.now(),
    });
  }

  /**
   * Track partner conversion
   */
  async trackPartnerConversion(
    partnerId: string,
    userId: string,
    conversionType: 'signup' | 'subscription' | 'purchase',
    amount?: number
  ): Promise<void> {
    const updateData: any = {
      lastActivityAt: firestore.Timestamp.now(),
    };

    if (conversionType === 'signup') {
      updateData['metrics.totalSignups'] = firestore.FieldValue.increment(1);
    }

    updateData['metrics.totalConversions'] = firestore.FieldValue.increment(1);

    if (amount) {
      updateData['metrics.totalRevenue'] = firestore.FieldValue.increment(amount);
      
      // Calculate partner revenue share
      await this.calculatePartnerRevenue(partnerId, amount);
    }

    await this.db.collection('partners').doc(partnerId).update(updateData);
  }

  /**
   * Calculate partner revenue share
   */
  private async calculatePartnerRevenue(
    partnerId: string,
    transactionAmount: number
  ): Promise<void> {
    const partner = await this.getPartner(partnerId);

    if (!partner.contract || partner.contract.type !== 'revenue_share') {
      return;
    }

    const sharePercentage = partner.contract.revenueSplitPercentage || 0;
    const partnerShare = transactionAmount * sharePercentage;

    // Record partner earning
    await this.db.collection('partner_earnings').add({
      partnerId,
      amount: partnerShare,
      sourceAmount: transactionAmount,
      sharePercentage,
      createdAt: firestore.Timestamp.now(),
      status: 'pending',
    });
  }

  /**
   * Get partner dashboard
   */
  async getPartnerDashboard(partnerId: string): Promise<PartnerDashboard> {
    const partner = await this.getPartner(partnerId);

    // Get events
    const eventsSnap = await this.db
      .collection('partner_events')
      .where('partnerId', '==', partnerId)
      .get();

    const totalEvents = eventsSnap.size;
    let upcomingEvents = 0;
    let totalAttendees = 0;

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data() as PartnerEvent;
      
      if (event.status === 'scheduled' || event.status === 'active') {
        upcomingEvents++;
      }
      
      totalAttendees += event.attendees;
    }

    // Get recent scans
    const scansSnap = await this.db
      .collection('partner_scans')
      .where('partnerId', '==', partnerId)
      .orderBy('scannedAt', 'desc')
      .limit(10)
      .get();

    const recentScans = scansSnap.docs.map((doc) => {
      const scan = doc.data();
      return {
        timestamp: scan.scannedAt,
        userId: scan.userId,
        location: scan.location || 'Unknown',
        converted: !!scan.userId,
      };
    });

    // Calculate conversion rate
    const conversionRate =
      partner.metrics.totalScans > 0
        ? partner.metrics.totalSignups / partner.metrics.totalScans
        : 0;

    return {
      partnerId,
      stats: {
        totalEvents,
        upcomingEvents,
        totalAttendees,
        totalSignups: partner.metrics.totalSignups,
        conversionRate,
        revenue: partner.metrics.totalRevenue,
      },
      recentScans,
      timeline: [], // Would be calculated from historical data
      topEvents: [], // Would be sorted by performance
    };
  }

  /**
   * Create partner coupon
   */
  async createPartnerCoupon(
    partnerId: string,
    data: Omit<PartnerCoupon, 'id' | 'partnerId' | 'totalUses' | 'status' | 'createdAt'>
  ): Promise<PartnerCoupon> {
    await this.getPartner(partnerId); // Validate partner exists

    const coupon: PartnerCoupon = {
      ...data,
      id: this.db.collection('partner_coupons').doc().id,
      partnerId,
      totalUses: 0,
      status: 'active',
      createdAt: firestore.Timestamp.now(),
    };

    await this.db.collection('partner_coupons').doc(coupon.id).set(coupon);

    return coupon;
  }

  /**
   * Redeem partner coupon
   */
  async redeemPartnerCoupon(
    couponCode: string,
    userId: string
  ): Promise<PartnerCoupon> {
    // Find coupon
    const couponsSnap = await this.db
      .collection('partner_coupons')
      .where('code', '==', couponCode)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (couponsSnap.empty) {
      throw new Error('Invalid or inactive coupon');
    }

    const couponDoc = couponsSnap.docs[0];
    const coupon = couponDoc.data() as PartnerCoupon;

    // Validate coupon
    const now = firestore.Timestamp.now();
    
    if (coupon.validFrom > now) {
      throw new Error('Coupon not yet valid');
    }

    if (coupon.validUntil && coupon.validUntil < now) {
      throw new Error('Coupon expired');
    }

    if (coupon.maxUses && coupon.totalUses >= coupon.maxUses) {
      throw new Error('Coupon usage limit reached');
    }

    // Check user-specific limits
    if (coupon.usesPerUser) {
      const userUsagesSnap = await this.db
        .collection('coupon_usages')
        .where('couponId', '==', coupon.id)
        .where('userId', '==', userId)
        .get();

      if (userUsagesSnap.size >= coupon.usesPerUser) {
        throw new Error('User usage limit reached');
      }
    }

    // Record usage
    await this.db.collection('coupon_usages').add({
      couponId: coupon.id,
      partnerId: coupon.partnerId,
      userId,
      usedAt: firestore.Timestamp.now(),
    });

    // Increment usage count
    await this.db.collection('partner_coupons').doc(coupon.id).update({
      totalUses: firestore.FieldValue.increment(1),
    });

    return coupon;
  }

  /**
   * Generate marketing kit
   */
  private async generateMarketingKit(partnerId: string): Promise<void> {
    const partner = await this.getPartner(partnerId);

    // Generate marketing assets
    // This would integrate with design generation service
    const marketingKit = {
      logoUrl: `https://avalo.app/assets/partner/${partnerId}/logo.png`,
      posterUrls: [
        `https://avalo.app/assets/partner/${partnerId}/poster-1.png`,
        `https://avalo.app/assets/partner/${partnerId}/poster-2.png`,
      ],
      digitalAssetsUrl: `https://avalo.app/assets/partner/${partnerId}/digital-kit.zip`,
    };

    await this.db.collection('partners').doc(partnerId).update({
      marketingKit,
    });
  }

  /**
   * Generate partner QR code
   */
  private generatePartnerQRCode(partnerId: string): string {
    return `https://avalo.app/p/${partnerId}`;
  }

  /**
   * Generate promotional code
   */
  private generatePromotionalCode(businessName: string): string {
    // Create code from business name
    const cleaned = businessName
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 8)
      .toUpperCase();
    
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    return `${cleaned}${random}`;
  }

  /**
   * Get partner
   */
  private async getPartner(partnerId: string): Promise<Partner> {
    const doc = await this.db.collection('partners').doc(partnerId).get();
    
    if (!doc.exists) {
      throw new Error('Partner not found');
    }

    return doc.data() as Partner;
  }

  /**
   * Get partner by type and location
   */
  async getPartnersByLocation(
    latitude: number,
    longitude: number,
    radiusKm: number,
    type?: PartnerType
  ): Promise<Partner[]> {
    // This would require geohashing or similar geo-query solution
    // Firebase doesn't support native geo-queries
    // Use a library like geofire-common or geofirestore
    
    const partnersSnap = await this.db
      .collection('partners')
      .where('status', '==', PartnerStatus.ACTIVE)
      .get();

    const partners: Partner[] = [];

    for (const partnerDoc of partnersSnap.docs) {
      const partner = partnerDoc.data() as Partner;
      
      if (type && partner.type !== type) {
        continue;
      }

      const distance = this.calculateDistance(
        latitude,
        longitude,
        partner.location.coordinates.latitude,
        partner.location.coordinates.longitude
      );

      if (distance <= radiusKm) {
        partners.push(partner);
      }
    }

    return partners;
  }

  /**
   * Calculate distance between coordinates
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
}

// ============================================================================
// EXPORT FACTORY
// ============================================================================

export function createPartnerExpansionService(
  db: firestore.Firestore
): PartnerExpansionService {
  return new PartnerExpansionService(db);
}
