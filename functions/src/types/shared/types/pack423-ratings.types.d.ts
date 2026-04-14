import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

export interface UserRating  {
    id: string;
    fromUserId: string;
    toUserId: string;
    rating: number;
    comment?: string;
    createdAt: any;
  [key: string]: any;
}
export interface NPSResponse  {
    userId: string;
    score: number;
    feedback?: string;
    timestamp: any;
  [key: string]: any;
}
export interface RatingMetrics  {
    averageRating: number;
    totalRatings: number;
    distribution: Record<number, number>;
  [key: string]: any;
}
export type RatingCategory = 'OVERALL' | 'COMMUNICATION' | 'RELIABILITY' | 'QUALITY';




























