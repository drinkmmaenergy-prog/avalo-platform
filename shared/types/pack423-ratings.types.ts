// Stub types for pack423 ratings
export interface UserRating {
  id: string;
  fromUserId: string;
  toUserId: string;
  rating: number;
  comment?: string;
  createdAt: any;
}

export interface NPSResponse {
  userId: string;
  score: number;
  feedback?: string;
  timestamp: any;
}

export interface RatingMetrics {
  averageRating: number;
  totalRatings: number;
  distribution: Record<number, number>;
}

export type RatingCategory = 'OVERALL' | 'COMMUNICATION' | 'RELIABILITY' | 'QUALITY';
