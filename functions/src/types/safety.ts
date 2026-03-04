/**
 * PACK 280 - Safety Types
 * Type definitions for Panic & Live Safety Engine
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type SessionType = 'calendar' | 'event' | 'chat';
export type PanicContext = 'none' | 'calendar' | 'event' | 'chat';
export type NotificationChannel = 'sms' | 'email' | 'whatsapp' | 'push';
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';
export type TrustCenterStatus = 'normal' | 'escalated' | 'closed';

// ============================================================================
// SAFETY PROFILE
// ============================================================================

export interface SafetySettings {
  autoTrackingOnMeetings: boolean;
  autoTrackingOnEvents: boolean;
  panicSendProfile: boolean;
  panicSendLocation: boolean;
}

export interface TrustedContact {
  contactId: string;
  name: string;
  channel: NotificationChannel;
  value: string; // phone number, email, etc.
  enabled: boolean;
}

export interface SafetyProfile {
  userId: string;
  trustedContacts: TrustedContact[];
  settings: SafetySettings;
  lastPanicAt: string | null;
  lastPanicContext: PanicContext;
}

// ============================================================================
// LIVE SESSION
// ============================================================================

export interface LocationData {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: string;
}

export interface LiveSession {
  sessionId: string;
  type: SessionType;
  bookingId: string | null;
  eventId: string | null;
  hostId: string;
  guestId: string | null;
  participants: string[];
  startedAt: string;
  endedAt: string | null;
  lastLocation: LocationData | null;
  panicTriggeredBy: string | null;
  trustCenterStatus: TrustCenterStatus;
}

// ============================================================================
// PANIC EVENT
// ============================================================================

export interface PanicEvent {
  eventId: string;
  userId: string;
  sessionId: string | null;
  context: PanicContext;
  location: LocationData | null;
  triggeredAt: string;
  notificationsSent: number;
  metadata: {
    bookingId?: string;
    eventId?: string;
    chatPartnerId?: string;
  };
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export interface TrustedContactNotification {
  notificationId: string;
  userId: string;
  contactId: string;
  channel: NotificationChannel;
  recipient: string;
  message: string;
  sentAt: string;
  deliveryStatus: DeliveryStatus;
  metadata: {
    panicEventId: string;
    sessionId?: string;
  };
}

export interface PanicNotificationPayload {
  userName: string;
  userProfilUSDl: string;
  lastLocation: LocationData | null;
  mapUrl: string | null;
  timestamp: string;
  context: PanicContext;
  meetingPartner?: {
    name: string;
    profilUSDl: string;
  };
}

// ============================================================================
// SESSION LOGS
// ============================================================================

export interface SafetySessionLog {
  logId: string;
  sessionId: string;
  userId: string;
  action: 'session_started' | 'session_ended' | 'location_updated' | 'panic_triggered' | 'status_changed';
  timestamp: string;
  details: Record<string, any>;
}

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface CreateSafetyProfileRequest {
  userId: string;
  trustedContacts?: TrustedContact[];
  settings?: Partial<SafetySettings>;
}

export interface UpdateSafetyProfileRequest {
  userId: string;
  trustedContacts?: TrustedContact[];
  settings?: Partial<SafetySettings>;
}

export interface AddTrustedContactRequest {
  userId: string;
  contact: Omit<TrustedContact, 'contactId'>;
}

export interface StartLiveSessionRequest {
  type: SessionType;
  hostId: string;
  guestId?: string;
  bookingId?: string;
  eventId?: string;
  participants: string[];
}

export interface UpdateLiveSessionLocationRequest {
  sessionId: string;
  location: Omit<LocationData, 'updatedAt'>;
}

export interface TriggerPanicRequest {
  userId: string;
  context: PanicContext;
  sessionId?: string;
  bookingId?: string;
  eventId?: string;
  chatPartnerId?: string;
  location?: Omit<LocationData, 'updatedAt'>;
}

export interface EndLiveSessionRequest {
  sessionId: string;
  reason?: string;
}









