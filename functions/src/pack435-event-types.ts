// Pack 435 - Event Types
export interface EventConfig {
  id?: string;
  name?: string;
  description?: string;
  startTime?: any;
  endTime?: any;
  location?: string;
  maxAttendees?: number;
  ticketTiers?: TicketTierConfig[];
  status?: EventStatus;
  visibility?: EventVisibility;
  [key: string]: any;
}

export enum TicketTier {
  GENERAL = 'GENERAL',
  VIP = 'VIP',
  MEET_AND_GREET = 'MEET_AND_GREET',
  PREMIUM = 'PREMIUM',
  EARLY_BIRD = 'EARLY_BIRD',
}

export interface TicketTierConfig {
  tier?: TicketTier;
  price?: number;
  quantity?: number;
  description?: string;
  [key: string]: any;
}

export interface EventAttendee {
  userId?: string;
  eventId?: string;
  ticketTier?: TicketTier;
  status?: AttendeeStatus;
  purchasedAt?: any;
  checkedInAt?: any;
  [key: string]: any;
}

export enum AttendeeStatus {
  REGISTERED = 'registered',
  PAID = 'paid',
  CONFIRMED = 'confirmed',
  CHECKED_IN = 'checked_in',
  NO_SHOW = 'no_show',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum EventVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  FOLLOWERS_ONLY = 'FOLLOWERS_ONLY',
}









