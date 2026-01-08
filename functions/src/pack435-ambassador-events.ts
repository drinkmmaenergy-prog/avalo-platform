/**
 * PACK 435 — Global Events Engine: Ambassador & Partner Integration
 * 
 * Ambassador earnings, partner venue revenue, QR + geo-fencing attribution
 * Depends on: PACK 434 Ambassador Program, PACK 435 Event Types
 */

import * as admin from 'firebase-admin';

// ============================================================================
// AMBASSADOR EVENT INTERFACES
// ============================================================================

export interface AmbassadorEventAttribution {
  attributionId: string;
  ambassadorId: string;
  eventId: string;
  attendeeId: string;
  userId: string;
  
  // Attribution method
  method: 'referral_code' | 'direct_link' | 'qr_scan' | 'social_share';
  referralCode?: string;
  
  // Verification
  qrVerified: boolean;
  qrVerifiedAt?: admin.firestore.Timestamp;
  geoVerified: boolean; // within event geofence
  
  // Earnings
  bonusAmount: number;
  currency: string;
  earningStatus: 'pending' | 'verified' | 'paid' | 'rejected';
  
  // Payment
  paidAt?: admin.firestore.Timestamp;
  payoutId?: string;
  
  // Metadata
  createdAt: admin.firestore.Timestamp;
}

export interface PartnerVenue {
  venueId: string;
  venueName: string;
  ownerUserId: string;
  
  // Location
  address: string;
  city: string;
  country: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  geofenceRadius: number; // meters
  
  // Venue details
  type: 'restaurant' | 'bar' | 'club' | 'cafe' | 'event_space' | 'hotel' | 'other';
  capacity: number;
  amenities: string[];
  
  // Partnership
  partnershipStatus: 'pending' | 'active' | 'suspended' | 'terminated';
  commissionRate: number; // percentage of event revenue
  
  // Stats
  eventsHosted: number;
  totalRevenue: number;
  partnerEarnings: number;
  averageRating: number;
  
  // Metadata
  joinedAt: admin.firestore.Timestamp;
  lastEventDate?: admin.firestore.Timestamp;
}

export interface PartnerVenueRevenue {
  revenueId: string;
  venueId: string;
  eventId: string;
  
  // Revenue breakdown
  totalEventRevenue: number;
  venueCommission: number;
  venueCommissionRate: number;
  
  // Verification
  requiresQRCheck: boolean;
  verifiedAttendees: number;
  totalAttendees: number;
  verificationRate: number;
  
  // Payout
  status: 'calculating' | 'pending' | 'approved' | 'paid';
  approvedAt?: admin.firestore.Timestamp;
  paidAt?: admin.firestore.Timestamp;
  
  // Analytics
  venueAnalytics: {
    foodBeverageSales?: number;
    additionalRevenue?: number;
    repeatCustomers?: number;
  };
  
  createdAt: admin.firestore.Timestamp;
}

export interface AmbassadorDashboard {
  ambassadorId: string;
  
  // Stats
  totalEventsReferred: number;
  totalAttendeesReferred: number;
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  
  // Performance
  conversionRate: number; // % of referrals that attended
  verificationRate: number; // % that got QR verified
  averageEarningPerAttendee: number;
  
  // Top events
  topEvents: {
    eventId: string;
    eventName: string;
    attendees: number;
    earnings: number;
  }[];
  
  // Current period
  periodStartDate: admin.firestore.Timestamp;
  periodEndDate: admin.firestore.Timestamp;
  periodEarnings: number;
  
  lastUpdated: admin.firestore.Timestamp;
}

// ============================================================================
// AMBASSADOR ATTRIBUTION
// ============================================================================

export async function trackAmbassadorAttribution(
  ambassadorId: string,
  eventId: string,
  attendeeId: string,
  userId: string,
  method: 'referral_code' | 'direct_link' | 'qr_scan' | 'social_share',
  referralCode?: string
): Promise<string> {
  const db = admin.firestore();
  
  // Get event to determine bonus amount
  const eventDoc = await db.collection('events').doc(eventId).get();
  const event = eventDoc.data();
  const bonusAmount = event?.revenueShare?.ambassadorBonus || 5; // default $5
  
  // Create attribution record
  const attributionRef = await db.collection('ambassadorAttributions').add({
    ambassadorId,
    eventId,
    attendeeId,
    userId,
    method,
    referralCode,
    qrVerified: false,
    geoVerified: false,
    bonusAmount,
    currency: 'USD',
    earningStatus: 'pending',
    createdAt: admin.firestore.Timestamp.now(),
  } as AmbassadorEventAttribution);
  
  // Update ambassador stats
  await db.collection('users').doc(ambassadorId).update({
    'ambassadorStats.totalReferrals': admin.firestore.FieldValue.increment(1),
    'ambassadorStats.pendingEarnings': admin.firestore.FieldValue.increment(bonusAmount),
  });
  
  return attributionRef.id;
}

export async function verifyAmbassadorQR(
  attributionId: string
): Promise<boolean> {
  const db = admin.firestore();
  
  const attributionRef = db.collection('ambassadorAttributions').doc(attributionId);
  const attributionDoc = await attributionRef.get();
  
  if (!attributionDoc.exists) {
    return false;
  }
  
  const attribution = attributionDoc.data() as AmbassadorEventAttribution;
  
  // Mark as QR verified
  await attributionRef.update({
    qrVerified: true,
    qrVerifiedAt: admin.firestore.Timestamp.now(),
    earningStatus: 'verified',
  });
  
  // Update ambassador stats
  await db.collection('users').doc(attribution.ambassadorId).update({
    'ambassadorStats.verifiedAttendees': admin.firestore.FieldValue.increment(1),
  });
  
  return true;
}

export async function verifyGeoLocation(
  attributionId: string,
  userLat: number,
  userLng: number
): Promise<boolean> {
  const db = admin.firestore();
  
  const attributionDoc = await db.collection('ambassadorAttributions').doc(attributionId).get();
  if (!attributionDoc.exists) {
    return false;
  }
  
  const attribution = attributionDoc.data() as AmbassadorEventAttribution;
  
  // Get event location
  const eventDoc = await db.collection('events').doc(attribution.eventId).get();
  const event = eventDoc.data();
  const venueCoords = event?.location?.coordinates;
  const geofenceRadius = event?.location?.geoFencingRadius || 500;
  
  if (!venueCoords) {
    return false;
  }
  
  // Calculate distance
  const distance = calculateDistance(
    userLat,
    userLng,
    venueCoords.lat,
    venueCoords.lng
  );
  
  const withinGeofence = distance <= geofenceRadius;
  
  // Update attribution
  await db.collection('ambassadorAttributions').doc(attributionId).update({
    geoVerified: withinGeofence,
  });
  
  return withinGeofence;
}

// ============================================================================
// AMBASSADOR EARNINGS PAYOUT
// ============================================================================

export async function processAmbassadorEventPayouts(eventId: string): Promise<number> {
  const db = admin.firestore();
  
  // Get all verified attributions for this event
  const attributionsSnapshot = await db.collection('ambassadorAttributions')
    .where('eventId', '==', eventId)
    .where('earningStatus', '==', 'verified')
    .where('qrVerified', '==', true)
    .get();
  
  let totalPaidOut = 0;
  
  for (const doc of attributionsSnapshot.docs) {
    const attribution = doc.data() as AmbassadorEventAttribution;
    
    // Credit ambassador wallet
    await db.collection('users').doc(attribution.ambassadorId).update({
      'wallet.balance': admin.firestore.FieldValue.increment(attribution.bonusAmount),
      'ambassadorStats.totalEarnings': admin.firestore.FieldValue.increment(attribution.bonusAmount),
      'ambassadorStats.pendingEarnings': admin.firestore.FieldValue.increment(-attribution.bonusAmount),
    });
    
    // Create wallet transaction
    await db.collection('walletTransactions').add({
      userId: attribution.ambassadorId,
      type: 'ambassador_event_bonus',
      amount: attribution.bonusAmount,
      currency: attribution.currency,
      eventId,
      attributionId: doc.id,
      status: 'completed',
      createdAt: admin.firestore.Timestamp.now(),
    });
    
    // Update attribution status
    await doc.ref.update({
      earningStatus: 'paid',
      paidAt: admin.firestore.Timestamp.now(),
    });
    
    totalPaidOut += attribution.bonusAmount;
  }
  
  return totalPaidOut;
}

// ============================================================================
// PARTNER VENUE MANAGEMENT
// ============================================================================

export async function registerPartnerVenue(
  venueData: {
    venueName: string;
    ownerUserId: string;
    address: string;
    city: string;
    country: string;
    coordinates: { lat: number; lng: number };
    type: PartnerVenue['type'];
    capacity: number;
    amenities: string[];
    geofenceRadius?: number;
  }
): Promise<string> {
  const db = admin.firestore();
  
  const venueRef = await db.collection('partnerVenues').add({
    ...venueData,
    geofenceRadius: venueData.geofenceRadius || 100,
    partnershipStatus: 'pending',
    commissionRate: 10, // default 10%
    eventsHosted: 0,
    totalRevenue: 0,
    partnerEarnings: 0,
    averageRating: 0,
    joinedAt: admin.firestore.Timestamp.now(),
  } as PartnerVenue);
  
  return venueRef.id;
}

export async function approvePartnerVenue(
  venueId: string,
  commissionRate: number
): Promise<boolean> {
  const db = admin.firestore();
  
  await db.collection('partnerVenues').doc(venueId).update({
    partnershipStatus: 'active',
    commissionRate,
  });
  
  // Notify venue owner
  const venueDoc = await db.collection('partnerVenues').doc(venueId).get();
  const venue = venueDoc.data() as PartnerVenue;
  
  await db.collection('notifications').add({
    userId: venue.ownerUserId,
    type: 'venue_approved',
    title: 'Venue Partnership Approved',
    body: `Your venue "${venue.venueName}" has been approved as a partner venue`,
    data: { venueId, commissionRate },
    createdAt: admin.firestore.Timestamp.now(),
    read: false,
  });
  
  return true;
}

// ============================================================================
// PARTNER VENUE REVENUE
// ============================================================================

export async function calculatePartnerVenueRevenue(
  eventId: string,
  venueId: string
): Promise<PartnerVenueRevenue> {
  const db = admin.firestore();
  
  // Get venue details
  const venueDoc = await db.collection('partnerVenues').doc(venueId).get();
  const venue = venueDoc.data() as PartnerVenue;
  
  // Get event revenue
  const eventDoc = await db.collection('events').doc(eventId).get();
  const event = eventDoc.data();
  
  // Get all payments for this event
  const paymentsSnapshot = await db.collection('eventPayments')
    .where('eventId', '==', eventId)
    .where('status', '==', 'completed')
    .get();
  
  let totalEventRevenue = 0;
  paymentsSnapshot.forEach(doc => {
    totalEventRevenue += doc.data().amount;
  });
  
  const venueCommission = totalEventRevenue * (venue.commissionRate / 100);
  
  // Get verification stats
  const attendeesSnapshot = await db.collection('eventAttendees')
    .where('eventId', '==', eventId)
    .where('status', 'in', ['checked_in', 'confirmed'])
    .get();
  
  const totalAttendees = attendeesSnapshot.size;
  let verifiedAttendees = 0;
  
  attendeesSnapshot.forEach(doc => {
    if (doc.data().qrVerified) {
      verifiedAttendees++;
    }
  });
  
  const verificationRate = totalAttendees > 0 ? (verifiedAttendees / totalAttendees) * 100 : 0;
  
  // Create revenue record
  const revenueData: PartnerVenueRevenue = {
    revenueId: `${venueId}_${eventId}`,
    venueId,
    eventId,
    totalEventRevenue,
    venueCommission,
    venueCommissionRate: venue.commissionRate,
    requiresQRCheck: true,
    verifiedAttendees,
    totalAttendees,
    verificationRate,
    status: verificationRate >= 70 ? 'approved' : 'pending',
    venueAnalytics: {},
    createdAt: admin.firestore.Timestamp.now(),
  };
  
  if (verificationRate >= 70) {
    revenueData.approvedAt = admin.firestore.Timestamp.now();
  }
  
  await db.collection('partnerVenueRevenues').doc(revenueData.revenueId).set(revenueData);
  
  return revenueData;
}

export async function payoutPartnerVenue(revenueId: string): Promise<boolean> {
  const db = admin.firestore();
  
  const revenueDoc = await db.collection('partnerVenueRevenues').doc(revenueId).get();
  if (!revenueDoc.exists) {
    return false;
  }
  
  const revenue = revenueDoc.data() as PartnerVenueRevenue;
  
  if (revenue.status !== 'approved') {
    return false;
  }
  
  // Get venue details
  const venueDoc = await db.collection('partnerVenues').doc(revenue.venueId).get();
  const venue = venueDoc.data() as PartnerVenue;
  
  // Credit venue owner wallet
  await db.collection('users').doc(venue.ownerUserId).update({
    'wallet.balance': admin.firestore.FieldValue.increment(revenue.venueCommission),
  });
  
  // Create wallet transaction
  await db.collection('walletTransactions').add({
    userId: venue.ownerUserId,
    type: 'venue_commission',
    amount: revenue.venueCommission,
    currency: 'USD',
    eventId: revenue.eventId,
    venueId: revenue.venueId,
    status: 'completed',
    createdAt: admin.firestore.Timestamp.now(),
  });
  
  // Update revenue status
  await db.collection('partnerVenueRevenues').doc(revenueId).update({
    status: 'paid',
    paidAt: admin.firestore.Timestamp.now(),
  });
  
  // Update venue stats
  await db.collection('partnerVenues').doc(revenue.venueId).update({
    totalRevenue: admin.firestore.FieldValue.increment(revenue.totalEventRevenue),
    partnerEarnings: admin.firestore.FieldValue.increment(revenue.venueCommission),
    eventsHosted: admin.firestore.FieldValue.increment(1),
    lastEventDate: admin.firestore.Timestamp.now(),
  });
  
  return true;
}

// ============================================================================
// ANALYTICS DASHBOARD
// ============================================================================

export async function getAmbassadorDashboard(ambassadorId: string): Promise<AmbassadorDashboard> {
  const db = admin.firestore();
  
  // Get all attributions
  const attributionsSnapshot = await db.collection('ambassadorAttributions')
    .where('ambassadorId', '==', ambassadorId)
    .get();
  
  const totalEventsReferred = new Set(attributionsSnapshot.docs.map(doc => doc.data().eventId)).size;
  const totalAttendeesReferred = attributionsSnapshot.size;
  
  let totalEarnings = 0;
  let pendingEarnings = 0;
  let paidEarnings = 0;
  let verifiedCount = 0;
  
  attributionsSnapshot.forEach(doc => {
    const attr = doc.data() as AmbassadorEventAttribution;
    if (attr.qrVerified) verifiedCount++;
    
    if (attr.earningStatus === 'paid') {
      paidEarnings += attr.bonusAmount;
      totalEarnings += attr.bonusAmount;
    } else if (attr.earningStatus === 'verified') {
      pendingEarnings += attr.bonusAmount;
      totalEarnings += attr.bonusAmount;
    }
  });
  
  const conversionRate = totalAttendeesReferred > 0
    ? (verifiedCount / totalAttendeesReferred) * 100
    : 0;
  
  const verificationRate = totalAttendeesReferred > 0
    ? (verifiedCount / totalAttendeesReferred) * 100
    : 0;
  
  const averageEarningPerAttendee = totalAttendeesReferred > 0
    ? totalEarnings / totalAttendeesReferred
    : 0;
  
  // Get top events
  const eventEarnings = new Map<string, number>();
  attributionsSnapshot.forEach(doc => {
    const attr = doc.data() as AmbassadorEventAttribution;
    if (attr.earningStatus === 'paid' || attr.earningStatus === 'verified') {
      const current = eventEarnings.get(attr.eventId) || 0;
      eventEarnings.set(attr.eventId, current + attr.bonusAmount);
    }
  });
  
  const topEvents = Array.from(eventEarnings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([eventId, earnings]) => ({
      eventId,
      eventName: 'Event Name', // Would fetch from events collection
      attendees: 0, // Would calculate
      earnings,
    }));
  
  // Current period (last 30 days)
  const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let periodEarnings = 0;
  
  attributionsSnapshot.forEach(doc => {
    const attr = doc.data() as AmbassadorEventAttribution;
    if (attr.createdAt.toDate() >= periodStart && 
        (attr.earningStatus === 'paid' || attr.earningStatus === 'verified')) {
      periodEarnings += attr.bonusAmount;
    }
  });
  
  const dashboard: AmbassadorDashboard = {
    ambassadorId,
    totalEventsReferred,
    totalAttendeesReferred,
    totalEarnings,
    pendingEarnings,
    paidEarnings,
    conversionRate,
    verificationRate,
    averageEarningPerAttendee,
    topEvents,
    periodStartDate: admin.firestore.Timestamp.fromDate(periodStart),
    periodEndDate: admin.firestore.Timestamp.now(),
    periodEarnings,
    lastUpdated: admin.firestore.Timestamp.now(),
  };
  
  // Cache dashboard
  await db.collection('ambassadorDashboards').doc(ambassadorId).set(dashboard);
  
  return dashboard;
}

export async function getPartnerVenueDashboard(venueId: string): Promise<any> {
  const db = admin.firestore();
  
  // Get venue
  const venueDoc = await db.collection('partnerVenues').doc(venueId).get();
  const venue = venueDoc.data() as PartnerVenue;
  
  // Get all revenues
  const revenuesSnapshot = await db.collection('partnerVenueRevenues')
    .where('venueId', '==', venueId)
    .get();
  
  const revenuesByEvent = revenuesSnapshot.docs.map(doc => doc.data() as PartnerVenueRevenue);
  
  return {
    venue,
    revenuesByEvent,
    summary: {
      totalEvents: venue.eventsHosted,
      totalRevenue: venue.totalRevenue,
      totalEarnings: venue.partnerEarnings,
      averageRevenuePerEvent: venue.eventsHosted > 0 ? venue.totalRevenue / venue.eventsHosted : 0,
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  trackAmbassadorAttribution,
  verifyAmbassadorQR,
  verifyGeoLocation,
  processAmbassadorEventPayouts,
  registerPartnerVenue,
  approvePartnerVenue,
  calculatePartnerVenueRevenue,
  payoutPartnerVenue,
  getAmbassadorDashboard,
  getPartnerVenueDashboard,
};
