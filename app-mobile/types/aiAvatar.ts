/**
 * AI Avatar Studio Types
 * Phase 4: SFW only (no real AI generation, skeleton implementation)
 */

import { Timestamp } from 'firebase/firestore';
import { AvatarStyle, AvatarGender } from '../config/monetization';

export interface AIAvatarGeneration {
  id?: string;
  userId: string;
  gender: AvatarGender;
  style: AvatarStyle;
  tokenCost: number;
  imageUrl: string; // Placeholder for now
  isPlaceholder: boolean;
  createdAt: Timestamp;
}

export interface AvatarGenerationRequest {
  gender: AvatarGender;
  style: AvatarStyle;
}

export { AvatarStyle, AvatarGender };