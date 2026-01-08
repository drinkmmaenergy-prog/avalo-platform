/**
 * Live Rooms & Gifts Types
 * Phase 4: Token economy skeleton (no real streaming)
 */

import { Timestamp } from 'firebase/firestore';
import { Gift } from '../config/monetization';

export interface LiveRoom {
  id?: string;
  hostUid: string;
  title: string;
  isLive: boolean;
  viewerCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  thumbnailUrl?: string;
  description?: string;
}

export interface GiftTransaction {
  id?: string;
  roomId: string;
  senderUid: string;
  hostUid: string;
  giftId: string;
  giftName: string;
  tokenCost: number;
  creatorAmount: number;
  avaloFee: number;
  createdAt: Timestamp;
}

export interface RoomMessage {
  id?: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  message: string;
  type: 'chat' | 'gift' | 'join' | 'leave';
  giftId?: string;
  createdAt: Timestamp;
}

// Re-export Gift from config for convenience
export type { Gift };