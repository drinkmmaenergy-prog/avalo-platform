/**
 * PACK 435 — Global Events Engine: Live Event Safety Mode
 * 
 * GPS tracking, panic buttons, incident reporting, and crowd risk management
 * Depends on: PACK 300/300A Support & Safety, PACK 267-268 Identity & Verification
 */

import * as admin from 'firebase-admin';

// ============================================================================
// SAFETY INTERFACES
// ============================================================================

export interface EventSafetyConfig {
  eventId: string;
  
  // Safety features enabled
  gpsTrackingEnabled: boolean;
  panicButtonEnabled: boolean;
  incidentReportingEnabled: boolean;
  qrIdentityValidation: boolean;
  crowdRiskMonitoring: boolean;
  
  // thresholds
  maxCrowdDensity: number; // people per square meter
  safetyRadiusMeters: number;
  panicResponseTime: number; // seconds
  
  // Staff
  safetyOfficers: string[]; // userIds
  organizerId: string;
  
  // Real-time status
  activeParticipants: number;
  currentIncidents: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface ParticipantLocation {
  userId: string;
  eventId: string;
  attendeeId: string;
  
  // Location data
  coordinates: {
    lat: number;
    lng: number;
    accuracy: number; // meters
  };
  
  // Tracking status
  trackingEnabled: boolean;
  lastUpdate: admin.firestore.Timestamp;
  batteryLevel?: number;
  
  // Geofence
  insideEventZone: boolean;
  distanceFromVenue?: number; // meters
  
  // Activity
  isMoving: boolean;
  speed?: number; // km/h
}

export interface SafetyIncident {
  incidentId: string;
  eventId: string;
  
  // Reporter
  reportedBy: string; // userId
  reportedAgainst?: string; // userId (if applicable)
  
  // Incident details
  type: SafetyIncidentType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  
  // Location
  location?: {
    lat: number;
    lng: number;
  };
  area?: string; // venue area/section
  
  // Evidence
  photos?: string[]; // URLs
  audioRecording?: string; // URL
  witnesses?: string[]; // userIds
  
  // Response
  status: 'reported' | 'acknowledged' | 'investigating' | 'resolved' | 'escalated';
  assignedTo?: string; // safety officer userId
  responseTime?: number; // seconds
  resolutionNotes?: string;
  
  // Actions taken
  usersFrozen?: string[]; // temporarily frozen accounts
  usersRemoved?: string[]; // removed from event
  policeNotified: boolean;
  
  // Timestamps
  reportedAt: admin.firestore.Timestamp;
  acknowledgedAt?: admin.firestore.Timestamp;
  resolvedAt?: admin.firestore.Timestamp;
}

export enum SafetyIncidentType {
  PANIC_BUTTON = 'panic_button',
  HARASSMENT = 'harassment',
  ASSAULT = 'assault',
  MEDICAL_EMERGENCY = 'medical_emergency',
  THEFT = 'theft',
  INTOXICATION = 'intoxication',
  THREAT = 'threat',
  INAPPROPRIATE_BEHAVIOR = 'inappropriate_behavior',
  CROWD_CRUSH = 'crowd_crush',
  FIRE_EMERGENCY = 'fire_emergency',
  OTHER = 'other',
}

export interface PanicButtonEvent {
  panicId: string;
  eventId: string;
  userId: string;
  
  // Location at time of panic
  location: {
    lat: number;
    lng: number;
  };
  
  // Context
  triggeredDuring?: string; // e.g., "speed_dating_round"
  pairId?: string; // if during paired activity
  
  // Response
  status: 'active' | 'responded' | 'resolved' | 'false_alarm';
  respondedBy?: string; // safety officer userId
  responseTime?: number; // seconds
  
  // Actions
  eventPaused: boolean;
  staffAlerted: boolean;
  policeNotified: boolean;
  
  // Timestamps
  triggeredAt: admin.firestore.Timestamp;
  respondedAt?: admin.firestore.Timestamp;
  resolvedAt?: admin.firestore.Timestamp;
}

export interface CrowdRiskAnalysis {
  eventId: string;
  timestamp: admin.firestore.Timestamp;
  
  // Crowd metrics
  totalAttendees: number;
  activeAttendees: number;
  crowdDensity: number; // people per square meter
  
  // Risk factors
  densityRiskLevel: 'safe' | 'moderate' | 'high' | 'critical';
  movementPatterns: 'normal' | 'congested' | 'dangerous';
  exitAccessibility: 'clear' | 'partially_blocked' | 'blocked';
  
  // Heatmap data
  hotspots: CrowdHotspot[];
  
  // Overall risk
  overallRiskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  
  // Alerts
  alertsTriggered: boolean;
  alertTypes?: string[];
}

export interface CrowdHotspot {
  area: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  attendeeCount: number;
  density: number;
  riskLevel: 'safe' | 'moderate' | 'high' | 'critical';
}

// ============================================================================
// GPS TRACKING
// ============================================================================

export async function updateParticipantLocation(
  userId: string,
  eventId: string,
  location: {
    lat: number;
    lng: number;
    accuracy: number;
  }
): Promise<boolean> {
  const db = admin.firestore();
  
  try {
    // Get event location for geofence check
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return false;
    }
    
    const event = eventDoc.data();
    const venueCoords = event?.location?.coordinates;
    const geofenceRadius = event?.location?.geoFencingRadius || 500; // default 500m
    
    // Calculate distance from venue
    let insideEventZone = true;
    let distanceFromVenue = 0;
    
    if (venueCoords) {
      distanceFromVenue = calculateDistance(
        location.lat,
        location.lng,
        venueCoords.lat,
        venueCoords.lng
      );
      insideEventZone = distanceFromVenue <= geofenceRadius;
    }
    
    // Get attendee ID
    const attendeeSnapshot = await db.collection('eventAttendees')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    
    if (attendeeSnapshot.empty) {
      return false;
    }
    
    const attendeeId = attendeeSnapshot.docs[0].id;
    
    // Update or create location record
    const locationRef = db.collection('participantLocations').doc(`${eventId}_${userId}`);
    
    await locationRef.set({
      userId,
      eventId,
      attendeeId,
      coordinates: location,
      trackingEnabled: true,
      lastUpdate: admin.firestore.Timestamp.now(),
      insideEventZone,
      distanceFromVenue,
      isMoving: true, // Can be enhanced with movement detection
    }, { merge: true });
    
    // Update attendee's last location
    await db.collection('eventAttendees').doc(attendeeId).update({
      lastLocation: {
        lat: location.lat,
        lng: location.lng,
        updatedAt: admin.firestore.Timestamp.now(),
      },
      gpsEnabled: true,
    });
    
    return true;
    
  } catch (error) {
    console.error('Location update error:', error);
    return false;
  }
}

export async function getActiveParticipantLocations(eventId: string): Promise<ParticipantLocation[]> {
  const db = admin.firestore();
  
  const locationsSnapshot = await db.collection('participantLocations')
    .where('eventId', '==', eventId)
    .where('trackingEnabled', '==', true)
    .get();
  
  return locationsSnapshot.docs.map(doc => doc.data() as ParticipantLocation);
}

// ============================================================================
// PANIC BUTTON
// ============================================================================

export async function triggerEventPanicButton(
  userId: string,
  eventId: string,
  context?: {
    triggeredDuring?: string;
    pairId?: string;
  }
): Promise<string> {
  const db = admin.firestore();
  
  // Get user's current location
  const locationDoc = await db.collection('participantLocations')
    .doc(`${eventId}_${userId}`)
    .get();
  
  const location = locationDoc.exists
    ? locationDoc.data()?.coordinates
    : { lat: 0, lng: 0 };
  
  // Create panic event
  const panicRef = db.collection('panicButtonEvents').doc();
  const panicId = panicRef.id;
  
  const panicEvent: PanicButtonEvent = {
    panicId,
    eventId,
    userId,
    location,
    triggeredDuring: context?.triggeredDuring,
    pairId: context?.pairId,
    status: 'active',
    eventPaused: false,
    staffAlerted: true,
    policeNotified: false,
    triggeredAt: admin.firestore.Timestamp.now(),
  };
  
  await panicRef.set(panicEvent);
  
  // Create safety incident
  await createSafetyIncident({
    eventId,
    reportedBy: userId,
    type: SafetyIncidentType.PANIC_BUTTON,
    severity: 'critical',
    category: 'panic_button',
    description: 'Panic button triggered by participant',
    location,
  });
  
  // Alert safety officers and organizer
  await alertSafetyStaff(eventId, 'panic_button', {
    userId,
    location,
    panicId,
  });
  
  // Update event risk level
  await db.collection('events').doc(eventId).update({
    riskScore: admin.firestore.FieldValue.increment(25),
    safetyIncidents: admin.firestore.FieldValue.increment(1),
  });
  
  return panicId;
}

export async function respondToPanic(
  panicId: string,
  responderId: string,
  action: 'resolved' | 'false_alarm' | 'escalated'
): Promise<boolean> {
  const db = admin.firestore();
  
  const panicRef = db.collection('panicButtonEvents').doc(panicId);
  const panicDoc = await panicRef.get();
  
  if (!panicDoc.exists) {
    return false;
  }
  
  const panic = panicDoc.data() as PanicButtonEvent;
  const responseTime = Math.floor(
    (Date.now() - panic.triggeredAt.toMillis()) / 1000
  );
  
  await panicRef.update({
    status: action === 'resolved' ? 'resolved' : action === 'false_alarm' ? 'false_alarm' : 'responded',
    respondedBy: responderId,
    responseTime,
    respondedAt: admin.firestore.Timestamp.now(),
    ...(action === 'resolved' && { resolvedAt: admin.firestore.Timestamp.now() }),
  });
  
  return true;
}

// ============================================================================
// INCIDENT REPORTING
// ============================================================================

export async function createSafetyIncident(
  incidentData: {
    eventId: string;
    reportedBy: string;
    reportedAgainst?: string;
    type: SafetyIncidentType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    description: string;
    location?: { lat: number; lng: number };
    area?: string;
    photos?: string[];
    witnesses?: string[];
  }
): Promise<string> {
  const db = admin.firestore();
  
  const incidentRef = db.collection('safetyIncidents').doc();
  const incidentId = incidentRef.id;
  
  const incident: SafetyIncident = {
    incidentId,
    eventId: incidentData.eventId,
    reportedBy: incidentData.reportedBy,
    reportedAgainst: incidentData.reportedAgainst,
    type: incidentData.type,
    severity: incidentData.severity,
    category: incidentData.category,
    description: incidentData.description,
    location: incidentData.location,
    area: incidentData.area,
    photos: incidentData.photos,
    witnesses: incidentData.witnesses,
    status: 'reported',
    policeNotified: false,
    reportedAt: admin.firestore.Timestamp.now(),
  };
  
  await incidentRef.set(incident);
  
  // Auto-assign to safety officer if critical
  if (incident.severity === 'critical') {
    await autoAssignSafetyOfficer(incidentId, incident.eventId);
  }
  
  // If reported against someone, add to their safety record
  if (incidentData.reportedAgainst) {
    await db.collection('users').doc(incidentData.reportedAgainst).update({
      'safetyRecord.incidentsReported': admin.firestore.FieldValue.increment(1),
      'safetyRecord.lastIncidentDate': admin.firestore.Timestamp.now(),
    });
  }
  
  // Update event safety stats
  await db.collection('events').doc(incidentData.eventId).update({
    safetyIncidents: admin.firestore.FieldValue.increment(1),
    riskScore: admin.firestore.FieldValue.increment(
      incident.severity === 'critical' ? 20 :
      incident.severity === 'high' ? 10 :
      incident.severity === 'medium' ? 5 : 2
    ),
  });
  
  return incidentId;
}

export async function updateIncidentStatus(
  incidentId: string,
  status: SafetyIncident['status'],
  updatedBy: string,
  notes?: string
): Promise<boolean> {
  const db = admin.firestore();
  
  const update: any = {
    status,
    updatedAt: admin.firestore.Timestamp.now(),
  };
  
  if (status === 'acknowledged') {
    update.acknowledgedAt = admin.firestore.Timestamp.now();
    update.assignedTo = updatedBy;
  }
  
  if (status === 'resolved') {
    update.resolvedAt = admin.firestore.Timestamp.now();
    if (notes) {
      update.resolutionNotes = notes;
    }
  }
  
  await db.collection('safetyIncidents').doc(incidentId).update(update);
  
  return true;
}

// ============================================================================
// CROWD RISK MONITORING
// ============================================================================

export async function analyzeCrowdRisk(eventId: string): Promise<CrowdRiskAnalysis> {
  const db = admin.firestore();
  
  // Get all active participant locations
  const locations = await getActiveParticipantLocations(eventId);
  
  // Get event details
  const eventDoc = await db.collection('events').doc(eventId).get();
  const event = eventDoc.data();
  
  const totalAttendees = event?.currentParticipants || 0;
const activeAttendees = locations.length;
  
  // Calculate crowd density (simplified)
  const venueArea = 500; // m² (should come from event config)
  const crowdDensity = activeAttendees / venueArea;
  
  // Determine density risk level
  let densityRiskLevel: 'safe' | 'moderate' | 'high' | 'critical';
  if (crowdDensity < 0.5) densityRiskLevel = 'safe';
  else if (crowdDensity < 1.0) densityRiskLevel = 'moderate';
  else if (crowdDensity < 2.0) densityRiskLevel = 'high';
  else densityRiskLevel = 'critical';
  
  // Identify hotspots (clusters of people)
  const hotspots = identifyCrowdHotspots(locations);
  
  // Calculate overall risk score
  let overallRiskScore = 0;
  overallRiskScore += densityRiskLevel === 'critical' ? 40 :
                       densityRiskLevel === 'high' ? 25 :
                       densityRiskLevel === 'moderate' ? 10 : 0;
  
  overallRiskScore += hotspots.filter(h => h.riskLevel === 'critical').length * 15;
  overallRiskScore += event?.safetyIncidents ? event.safetyIncidents * 10 : 0;
  
  // Determine overall risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (overallRiskScore < 25) riskLevel = 'low';
  else if (overallRiskScore < 50) riskLevel = 'medium';
  else if (overallRiskScore < 75) riskLevel = 'high';
  else riskLevel = 'critical';
  
  // Generate recommendations
  const recommendations: string[] = [];
  if (densityRiskLevel === 'high' || densityRiskLevel === 'critical') {
    recommendations.push('Crowd density is high - consider expanding space or limiting entry');
  }
  if (hotspots.some(h => h.riskLevel === 'critical')) {
    recommendations.push('Critical crowd hotspots detected - redistribute attendees');
  }
  if (event?.safetyIncidents > 2) {
    recommendations.push('Multiple safety incidents reported - increase security presence');
  }
  
  const analysis: CrowdRiskAnalysis = {
    eventId,
    timestamp: admin.firestore.Timestamp.now(),
    totalAttendees,
    activeAttendees,
    crowdDensity,
    densityRiskLevel,
    movementPatterns: 'normal', // Would need movement tracking to determine
    exitAccessibility: 'clear', // Would need real-time monitoring
    hotspots,
    overallRiskScore,
    riskLevel,
    recommendations,
    alertsTriggered: riskLevel === 'critical' || riskLevel === 'high',
    alertTypes: riskLevel === 'critical' ? ['high_density', 'safety_concern'] : undefined,
  };
  
  // Save analysis
  await db.collection('crowdRiskAnalyses').add(analysis);
  
  // Trigger alerts if needed
  if (analysis.alertsTriggered) {
    await alertSafetyStaff(eventId, 'crowd_risk', {
      riskLevel: analysis.riskLevel,
      score: analysis.overallRiskScore,
      recommendations: analysis.recommendations,
    });
  }
  
  return analysis;
}

function identifyCrowdHotspots(locations: ParticipantLocation[]): CrowdHotspot[] {
  // Simple clustering algorithm (would use more sophisticated method in production)
  const hotspots: CrowdHotspot[] = [];
  const clusterRadius = 10; // meters
  
  const clustered = new Set<string>();
  
  for (const loc of locations) {
    if (clustered.has(loc.userId)) continue;
    
    // Find nearby people
    const nearby = locations.filter(other => {
      if (clustered.has(other.userId)) return false;
      const distance = calculateDistance(
        loc.coordinates.lat,
        loc.coordinates.lng,
        other.coordinates.lat,
        other.coordinates.lng
      );
      return distance <= clusterRadius;
    });
    
    if (nearby.length >= 5) {
      // Found a hotspot
      const avgLat = nearby.reduce((sum, l) => sum + l.coordinates.lat, 0) / nearby.length;
      const avgLng = nearby.reduce((sum, l) => sum + l.coordinates.lng, 0) / nearby.length;
      
      const density = nearby.length / (Math.PI * clusterRadius * clusterRadius / 1000000); // per m²
      
      let riskLevel: 'safe' | 'moderate' | 'high' | 'critical';
      if (density < 0.5) riskLevel = 'safe';
      else if (density < 1.0) riskLevel = 'moderate';
      else if (density < 2.0) riskLevel = 'high';
      else riskLevel = 'critical';
      
      hotspots.push({
        area: `Zone ${hotspots.length + 1}`,
        coordinates: { lat: avgLat, lng: avgLng },
        attendeeCount: nearby.length,
        density,
        riskLevel,
      });
      
      nearby.forEach(l => clustered.add(l.userId));
    }
  }
  
  return hotspots;
}

// ============================================================================
// AUTO FREEZE USERS
// ============================================================================

export async function autoFreezeUserOnSafetyAlert(
  userId: string,
  eventId: string,
  reason: string
): Promise<boolean> {
  const db = admin.firestore();
  
  try {
    // Freeze user account temporarily
    await db.collection('users').doc(userId).update({
      accountState: 'temporarily_frozen',
      'safetyRecord.frozenAt': admin.firestore.Timestamp.now(),
      'safetyRecord.frozenReason': reason,
      'safetyRecord.frozenEventId': eventId,
    });
    
    // Log the action
    await db.collection('safetyActions').add({
      userId,
      eventId,
      action: 'auto_freeze',
      reason,
      timestamp: admin.firestore.Timestamp.now(),
      automated: true,
    });
    
    // Notify user
    await db.collection('notifications').add({
      userId,
      type: 'account_frozen',
      title: 'Account Temporarily Frozen',
      body: 'Your account has been temporarily frozen due to a safety concern. Please contact support.',
      priority: 'high',
      createdAt: admin.firestore.Timestamp.now(),
      read: false,
    });
    
    return true;
    
  } catch (error) {
    console.error('Auto-freeze error:', error);
    return false;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // Haversine formula
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // meters
}

async function autoAssignSafetyOfficer(incidentId: string, eventId: string): Promise<void> {
  const db = admin.firestore();
  
  // Get event safety config
  const safetyConfigDoc = await db.collection('eventSafetyConfigs').doc(eventId).get();
  const safetyOfficers = safetyConfigDoc.data()?.safetyOfficers || [];
  
  if (safetyOfficers.length > 0) {
    // Assign to first available officer (could be enhanced with load balancing)
    await db.collection('safetyIncidents').doc(incidentId).update({
      assignedTo: safetyOfficers[0],
      status: 'acknowledged',
      acknowledgedAt: admin.firestore.Timestamp.now(),
    });
    
    // Notify officer
    await db.collection('notifications').add({
      userId: safetyOfficers[0],
      type: 'incident_assigned',
      title: 'Safety Incident Assigned',
      body: 'A critical safety incident requires your immediate attention',
      data: { incidentId, eventId },
      priority: 'urgent',
      createdAt: admin.firestore.Timestamp.now(),
      read: false,
    });
  }
}

async function alertSafetyStaff(
  eventId: string,
  alertType: string,
  metadata: any
): Promise<void> {
  const db = admin.firestore();
  
  // Get event organizer and safety officers
  const eventDoc = await db.collection('events').doc(eventId).get();
  const organizerId = eventDoc.data()?.organizerId;
  
  const safetyConfigDoc = await db.collection('eventSafetyConfigs').doc(eventId).get();
  const safetyOfficers = safetyConfigDoc.data()?.safetyOfficers || [];
  
  const recipientIds = [organizerId, ...safetyOfficers].filter(Boolean);
  
  // Send notifications to all staff
  for (const userId of recipientIds) {
    await db.collection('notifications').add({
      userId,
      type: 'safety_alert',
      title: `Safety Alert: ${alertType}`,
      body: `Immediate attention required for event safety issue`,
      data: { eventId, alertType, ...metadata },
      priority: 'urgent',
      createdAt: admin.firestore.Timestamp.now(),
      read: false,
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  updateParticipantLocation,
  getActiveParticipantLocations,
  triggerEventPanicButton,
  respondToPanic,
  createSafetyIncident,
  updateIncidentStatus,
  analyzeCrowdRisk,
  autoFreezeUserOnSafetyAlert,
};
