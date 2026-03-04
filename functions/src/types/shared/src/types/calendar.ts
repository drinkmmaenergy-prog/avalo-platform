// Types for calendar
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: any;
  endTime: any;
  userId: string;
  type: string;
}

export interface CalendarSlot {
  id?: string;
  slotId?: string;
  startTime: any;
  endTime: any;
  available: boolean;
  price?: number;
  status?: 'available' | 'booked' | 'blocked';
}

export type CalendarEventType = 'MEETING' | 'CALL' | 'DATE' | 'OTHER';

export interface Calendar {
  id: string;
  userId: string;
  timezone: string;
  slots: CalendarSlot[];
  availableSlots?: CalendarSlot[];
  settings?: CalendarSettings;
}

export interface CalendarSettings {
  defaultDuration: number;
  bufferTime: number;
  workingHours: WorkingHours;
  minAdvanceHours?: number;
}

export interface WorkingHours {
  start: string;
  end: string;
  days: number[];
}

export interface PaymentInfo {
  amount?: number;
  currency?: string;
  status?: 'pending' | 'completed' | 'refunded' | 'partial_refund';
  refundAmount?: number;
  totalTokensPaid?: number;
  avaloShareTokens?: number;
  userShareTokens?: number;
  creatorShareTokens?: number;
  refundedUserTokens?: number;
  refundedCreatorTokens?: number;
  refundedAvaloTokens?: number;
  [key: string]: any;
}

export interface SafetyInfo {
  checkInTime?: any;
  checkInAt?: any;
  checkOutTime?: any;
  checkOutAt?: any;
  panicTriggered?: boolean;
  locationShared?: boolean;
  mismatchReported?: boolean;
  mismatchReportedAt?: any;
  mismatchDetails?: MismatchReportRequest;
  qrCode?: string;
  safetyCode?: string;
  [key: string]: any;
}

export interface CalendarBooking {
  id?: string;
  bookingId?: string;
  calendarId?: string;
  hostId?: string;
  guestId?: string;
  startTime?: any;
  endTime?: any;
  start?: any;
  end?: any;
  slotId?: string;
  priceTokens?: number;
  status?: BookingStatus;
  type?: CalendarEventType;
  price?: number;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  payment?: PaymentInfo | any;
  safety?: SafetyInfo | any;
  timestamps?: {
    created?: any;
    updated?: any;
    cancelled?: any;
    completed?: any;
    createdAt?: any;
    updatedAt?: any;
    cancelledAt?: any;
    completedAt?: any;
    [key: string]: any;
  };
  [key: string]: any;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED_BY_GUEST'
  | 'CANCELLED_BY_HOST'
  | 'MISMATCH_REFUND'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'COMPLETED_GOODWILL'
  | 'AWAITING_SELFIE'
  | 'ACTIVE';

export interface CreateBookingRequest {
  calendarId: string;
  hostId: string;
  guestId?: string;
  slotId?: string;
  startTime: any;
  endTime: any;
  start?: any;
  end?: any;
  type: CalendarEventType;
  price?: number;
  priceTokens?: number;
  notes?: string;
}

export interface CancelBookingRequest {
  bookingId: string;
  reason?: string;
}

export interface CheckInRequest {
  bookingId: string;
  userId?: string;
  qrCode?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

export interface MismatchReportRequest {
  bookingId: string;
  reportedBy?: string;
  type: 'no_show' | 'late' | 'wrong_person' | 'other';
  reason?: string;
  description?: string;
  evidence?: string[];
}

export interface GoodwillRefundRequest {
  bookingId: string;
  amount: number;
  reason: string;
  hostId?: string;
  [key: string]: any;
}

export interface CompleteMeetingRequest {
  bookingId: string;
  rating?: number;
  feedback?: string;
}

export interface SafetyEvent {
  id?: string;
  bookingId?: string;
  userId?: string;
  type?: SafetyEventType | string;
  eventType?: SafetyEventType | string;
  timestamp?: any;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export type SafetyEventType = 
  | 'check_in' 
  | 'check_out' 
  | 'panic' 
  | 'location_share' 
  | 'timer_expired' 
  | 'CHECK_IN'
  | 'meeting_started'
  | 'mismatch_reported';

export interface RefundPolicyConfig {
  refundPercentage?: number;
  description?: string;
  [key: string]: any;
}

export interface RefundPolicy {
  type?: 'full' | 'partial' | 'none' | 'custom';
  refundPercentage?: number;
  description?: string;
  [key: string]: any;
}









