/**
 * Safe-Meet Type Definitions
 * Phase 25: Safety feature for offline meetings
 * 
 * Provides QR-based meeting confirmation, trusted contacts, and SOS functionality
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

/**
 * Safe-Meet Session Status
 */
export type SafeMeetStatus = 
  | 'PENDING'      // Created, awaiting QR scan
  | 'ACTIVE'       // Both users confirmed
  | 'ENDED'        // Normally ended
  | 'SOS_TRIGGERED' // Emergency triggered
  | 'CANCELLED';   // Cancelled before start

/**
 * SOS Source Type
 */
export type SafeMeetSOSSource = 'SOS_PIN' | 'SOS_BUTTON';

/**
 * Safe-Meet Session Document
 */
export interface SafeMeetSession {
  sessionId: string;
  hostId: string;           // User who created the meeting
  guestId: string | null;   // User who scanned QR (null until scan)
  
  status: SafeMeetStatus;
  
  // Session token for QR code
  sessionToken: string;     // Short token for QR generation
  
  // Location info (optional)
  approxLocation?: {
    city: string;
    country: string;
  };
  
  meetingNote?: string;     // Optional note (e.g., "Coffee at 7pm")
  
  // Timestamps
  createdAt: Timestamp | FieldValue;
  startedAt?: Timestamp | FieldValue;  // When guest scanned
  endedAt?: Timestamp | FieldValue;    // When ended normally or via SOS
  
  // Metadata
  lastUpdatedAt: Timestamp | FieldValue;
}

/**
 * Trusted Contact Document
 */
export interface TrustedContact {
  userId: string;
  name: string;
  phone: string;
  email: string;
  lastUpdatedAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
}

/**
 * Safe-Meet Incident (created on SOS)
 */
export interface SafeMeetIncident {
  incidentId: string;
  sessionId: string;
  
  // Participants
  hostId: string;
  guestId: string | null;
  triggeringUserId: string;  // Who triggered SOS
  
  // Incident details
  source: SafeMeetSOSSource;
  severity: 'HIGH';
  
  // Location at time of SOS
  approxLocation?: {
    city: string;
    country: string;
  };
  
  // When
  triggeredAt: Timestamp | FieldValue;
  
  // Status
  resolved: boolean;
  resolvedAt?: Timestamp | FieldValue;
  resolvedBy?: string;
  
  // Notes
  notes?: string;
  
  createdAt: Timestamp | FieldValue;
}

/**
 * Law Enforcement Queue Item (for supported regions)
 */
export interface SafeMeetLawEnforcementQueueItem {
  queueId: string;
  incidentId: string;
  sessionId: string;
  
  // User info
  reportingUserId: string;
  otherUserId: string | null;
  
  // Location
  country: string;
  city?: string;
  
  // Incident data
  incidentTime: Timestamp | FieldValue;
  incidentType: SafeMeetSOSSource;
  
  // Processing status
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';
  processedBy?: string;
  processedAt?: Timestamp | FieldValue;
  
  // Notes for moderators
  moderatorNotes?: string;
  
  createdAt: Timestamp | FieldValue;
}

/**
 * Input for creating a Safe-Meet session
 */
export interface CreateSafeMeetSessionInput {
  userId: string;
  approxLocation?: {
    city: string;
    country: string;
  };
  meetingNote?: string;
}

/**
 * Input for joining a session via QR
 */
export interface JoinSafeMeetSessionInput {
  userId: string;
  sessionToken: string;
}

/**
 * Input for ending a session
 */
export interface EndSafeMeetSessionInput {
  userId: string;
  sessionId: string;
}

/**
 * Input for triggering SOS
 */
export interface TriggerSOSInput {
  userId: string;
  sessionId: string;
  source: SafeMeetSOSSource;
}

/**
 * Input for setting trusted contact
 */
export interface SetTrustedContactInput {
  userId: string;
  name: string;
  phone: string;
  email: string;
}

/**
 * Response type for session operations
 */
export interface SafeMeetSessionResponse {
  success: boolean;
  session?: SafeMeetSession;
  error?: string;
}

/**
 * Response type for trusted contact operations
 */
export interface TrustedContactResponse {
  success: boolean;
  contact?: TrustedContact;
  error?: string;
}