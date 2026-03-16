import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

import { Timestamp } from 'firebase-admin/firestore';
import { admin } from '../runtime';

export type MeetType = 'real_meet' | 'social_meet';
export type MeetStatus = 'booked' | 'waiting' | 'completed' | 'cancelled' | 'dispute';
export type DisputeStatus = 'open' | 'resolved_for_guest' | 'resolved_for_host';

export interface MeetProfile {
  userId: string;
  enabled: boolean;
  realMeetEnabled: boolean;
  socialMeetEnabled: boolean;
  realMeetPrice: number;
  socialMeetPrice: number;
  bio: string;
  rules: string;
  availability: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MeetBooking {
  bookingId: string;
  meetType: MeetType;
  hostId: string;
  guestId: string;
  price: number;
  escrowAmount: number;
  platformFee: number;
  status: MeetStatus;
  scheduledDate: Timestamp;
  location?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelledBy?: string;
  disputeId?: string;
}

export interface MeetDispute {
  disputeId: string;
  bookingId: string;
  reportedBy: string;
  reason: string;
  evidence?: string;
  status: DisputeStatus;
  resolution?: string;
  resolvedBy?: string;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}

export interface MeetAvailability {
  userId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

























