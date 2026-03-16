import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

/**
 * Calendar Types - Complete Module
 * Extended to support calendarEngine.ts requirements
 */

export interface Calendar {
  id: string;
  earnerId: string;
  name: string;
  description?: string;
  timezone: string;
  availability: CalendarAvailability[];
  settings: CalendarSettings;
  availableSlots?: CalendarSlot[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarSettings {
  bufferBefore: number;
  bufferAfter: number;
  minNotice: number;
  maxAdvance: number;
  autoConfirm: boolean;
  minAdvanceHours?: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  earnerId: string;
  attendeeIds: string[];
  type: CalendarEventType;
  status: CalendarEventStatus;
  price?: number;
  currency?: string;
  location?: string;
  isVirtual: boolean;
  meetingUrl?: string;
  maxAttendees?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CalendarEventType = 
  | 'one_on_one'
  | 'group_session'
  | 'workshop'
  | 'webinar'
  | 'consultation'
  | 'coaching'
  | 'other';

export type CalendarEventStatus =
  | 'draft'
  | 'published'
  | 'cancelled'
  | 'completed'
  | 'in_progress';

export interface CalendarSlot {
  id: string;
  earnerId: string;
  startTime: Date;
  endTime: Date;
  isAvailable: boolean;
  eventId?: string;
}

export interface CalendarBooking {
  id: string;
  eventId: string;
  userId: string;
  guestId: string;
  hostId: string;
  status: BookingStatus;
  bookedAt: Date;
  paidAmount?: number;
  paymentId?: string;
  end?: Date;
  payment?: BookingPayment;
  start?: Date;
  timestamps?: BookingTimestamps;
  safety?: SafetyInfo;
  [key: string]: any;
}

export interface BookingPayment {
  amount: number;
  currency: string;
  status: string;
  totalTokensPaid?: number;
  platformTokens?: number;
  userShareTokens?: number;
  refundedUserTokens?: number;
}

export interface BookingTimestamps {
  created: Date;
  updated: Date;
  createdAt?: Date;
  updatedAt?: Date;
  cancelledAt?: Date;
}

export interface SafetyInfo {
  checkInTime?: Date;
  checkInLocation?: string;
  safetyEvents: SafetyEvent[];
  qrCode?: string;
  checkInAt?: Date;
  checkOutAt?: Date;
  mismatchReported?: boolean;
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
  | 'COMPLETED'
  | 'MISMATCH_REFUND';

export interface CalendarAvailability {
  earnerId: string;
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  timezone: string;
}

export interface CreateBookingRequest {
  eventId: string;
  userId: string;
  paymentMethodId?: string;
  hostId?: string;
  guestId?: string;
  slotId?: string;
  start?: Date;
  end?: Date;
  priceTokens?: number;
}

export interface CancelBookingRequest {
  bookingId: string;
  reason?: string;
}

export interface CheckInRequest {
  bookingId: string;
  location?: string;
  qrCode?: string;
  userId?: string;
}

export interface MismatchReportRequest {
  bookingId: string;
  type: string;
  description: string;
  reportedBy?: string;
  reason?: string;
}

export interface GoodwillRefundRequest {
  bookingId: string;
  amount: number;
  reason: string;
}

export interface CompleteMeetingRequest {
  bookingId: string;
  rating?: number;
  feedback?: string;
}

export interface SafetyEvent {
  id: string;
  type: SafetyEventType;
  timestamp: Date;
  details?: Record<string, any>;
}

export type SafetyEventType =
  | 'check_in'
  | 'check_out'
  | 'emergency'
  | 'location_share'
  | 'safety_alert';

export interface RefundPolicy {
  type?: 'full' | 'partial' | 'none';
  percentage?: number;
  deadline?: number;
  refundPercentage?: number;
  description?: string;
}


























