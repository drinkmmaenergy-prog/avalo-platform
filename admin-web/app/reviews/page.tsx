'use client';

/**
 * PACK 424 — Store Reviews Management
 * Admin interface for viewing and responding to app store reviews
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface StoreReview {
  id: string;
  platform: 'IOS' | 'ANDROID';
  locale: string;
  storeUserName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  reviewText?: string;
  createdAt: number;
  scrapedAt: number;
  version: string;
  country: string;
  sentimentScore?: number;
  riskFlag?: boolean;
  linkedUserId?: string;
  responseText?: string;
  responseAt?: number;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    platform: 'all',
    rating: 'all',
    country: 'all',
    riskFlag: 'all',
  });

  useEffect(() => {
    loadReviews();
  }, [filters]);

  const loadReviews = async () => {
    setLoading(true);

    try {
      let q = query(
        collection(db, 'storeReviews'),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      // Apply filters
      if (filters.platform !== 'all') {
        q = query(q, where('platform', '==', filters.platform));
      }

      if (filters.rating !== 'all') {
        q = query(q, where('rating', '==', parseInt(filters.rating)));
      }

      if (filters.riskFlag !== 'all') {
        q = query(q, where('riskFlag', '==', filters.riskFlag === 'true'));
      }

      const snapshot = await getDocs(q);
      const reviewsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as StoreReview[];

      setReviews(reviewsData);
    } catch (error) {
      console.error('Error loading reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRatingColor = (rating: number): string => {
    if (rating >= 4) return 'text-green-600';
    if (rating === 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPlatformBadge = (platform: string): JSX.Element => {
    const colors = {
      IOS: 'bg-gray-800 text-white',
      ANDROID: 'bg-green-600 text-white',
    };

    return (
      <span
        className={`px-2 py-1 text-xs rounded-full ${
          colors[platform as keyof typeof colors]
        }`}
      >
        {platform}
      </span>
    );
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Store Reviews</h1>
        <p className="text-gray-600">
          Monitor and respond to App Store and Google Play reviews
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Platform</label>
            <select
              value={filters.platform}
              onChange={e =>
                setFilters({ ...filters, platform: e.target.value })
              }
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="all">All Platforms</option>
              <option value="IOS">iOS</option>
              <option value="ANDROID">Android</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Rating</label>
            <select
              value={filters.rating}
              onChange={e => setFilters({ ...filters, rating: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="all">All Ratings</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Risk</label>
            <select
              value={filters.riskFlag}
              onChange={e =>
                setFilters({ ...filters, riskFlag: e.target.value })
              }
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="all">All Reviews</option>
              <option value="true">Flagged Only</option>
              <option value="false">Not Flagged</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={loadReviews}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Total Reviews</div>
          <div className="text-2xl font-bold">{reviews.length}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Average Rating</div>
          <div className="text-2xl font-bold">
            {reviews.length > 0
              ? (
                  reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
                ).toFixed(1)
              : '0.0'}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Needs Response</div>
          <div className="text-2xl font-bold text-orange-600">
            {reviews.filter(r => !r.responseText && r.rating <= 2).length}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Flagged</div>
          <div className="text-2xl font-bold text-red-600">
            {reviews.filter(r => r.riskFlag).length}
          </div>
        </div>
      </div>

      {/* Reviews List */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No reviews found</div>
        ) : (
          <div className="divide-y">
            {reviews.map(review => (
              <Link
                key={review.id}
                href={`/reviews/${review.id}`}
                className="block p-4 hover:bg-gray-50 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getPlatformBadge(review.platform)}
                    <span className="font-medium">{review.storeUserName}</span>
                    {review.riskFlag && (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                        ⚠️ Flagged
                      </span>
                    )}
                    {review.linkedUserId && (
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                        Verified User
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>{review.country.toUpperCase()}</span>
                    <span>{formatDate(review.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <span
                      key={star}
                      className={`text-xl ${
                        star <= review.rating ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                    >
                      ★
                    </span>
                  ))}
                  <span className={`ml-2 font-semibold ${getRatingColor(review.rating)}`}>
                    {review.rating}.0
                  </span>
                </div>

                {review.reviewText && (
                  <p className="text-gray-700 mb-2 line-clamp-2">
                    {review.reviewText}
                  </p>
                )}

                {review.sentimentScore !== undefined && (
                  <div className="text-sm text-gray-600 mb-2">
                    Sentiment:{' '}
                    <span
                      className={
                        review.sentimentScore > 0
                          ? 'text-green-600'
                          : review.sentimentScore < 0
                          ? 'text-red-600'
                          : 'text-gray-600'
                      }
                    >
                      {review.sentimentScore.toFixed(2)}
                    </span>
                  </div>
                )}

                {review.responseText ? (
                  <div className="mt-2 p-2 bg-blue-50 rounded">
                    <div className="text-xs text-blue-600 font-medium mb-1">
                      ✓ Responded {review.responseAt && `on ${formatDate(review.responseAt)}`}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-1">
                      {review.responseText}
                    </p>
                  </div>
                ) : review.rating <= 2 ? (
                  <div className="mt-2 text-sm text-orange-600 font-medium">
                    ⚠️ Needs response
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
