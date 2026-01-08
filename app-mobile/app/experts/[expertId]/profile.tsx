/**
 * PACK 136: Expert Profile Screen
 * View expert details, reviews, and book sessions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import {
  ExpertProfile,
  ExpertOffer,
  ExpertReview,
  getExpertProfile,
  getExpertReviews,
  listExpertOffers,
  formatCategoryName,
  formatOfferType,
} from '../../../services/expertMarketplaceService';

export default function ExpertProfileScreen() {
  const { expertId } = useLocalSearchParams<{ expertId: string }>();
  const [expert, setExpert] = useState<ExpertProfile | null>(null);
  const [offers, setOffers] = useState<ExpertOffer[]>([]);
  const [reviews, setReviews] = useState<ExpertReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (expertId) {
      loadExpertData();
    }
  }, [expertId]);

  const loadExpertData = async () => {
    try {
      setLoading(true);
      const [profileData, offersData, reviewsData] = await Promise.all([
        getExpertProfile(expertId),
        listExpertOffers(expertId, true),
        getExpertReviews(expertId, 10),
      ]);

      setExpert(profileData);
      setOffers(offersData.offers);
      setReviews(reviewsData);
    } catch (error) {
      console.error('Error loading expert data:', error);
      Alert.alert('Error', 'Failed to load expert profile');
    } finally {
      setLoading(false);
    }
  };

  const handleBookOffer = (offer: ExpertOffer) => {
    router.push({
      pathname: '/experts/book-session',
      params: {
        offerId: offer.offerId,
        expertId: offer.expertId,
        expertName: offer.expertName,
        offerTitle: offer.title,
        priceTokens: offer.priceTokens.toString(),
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!expert) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Expert not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={{ uri: expert.userAvatar || 'https://via.placeholder.com/100' }}
            style={styles.avatar}
          />
          <Text style={styles.name}>{expert.userName}</Text>
          <Text style={styles.category}>{formatCategoryName(expert.category)}</Text>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>⭐ {expert.averageRating.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{expert.completedSessions}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{expert.totalReviews}</Text>
              <Text style={styles.statLabel}>Reviews</Text>
            </View>
          </View>
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bio}>{expert.bio}</Text>
        </View>

        {/* Expertise */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expertise</Text>
          <Text style={styles.expertise}>{expert.expertiseDescription}</Text>
        </View>

        {/* Certifications */}
        {expert.certifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Certifications</Text>
            {expert.certifications.map((cert, index) => (
              <View key={index} style={styles.certItem}>
                <Text style={styles.certIcon}>✓</Text>
                <Text style={styles.certText}>{cert}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Offers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>
          {offers.length === 0 ? (
            <Text style={styles.emptyText}>No services available</Text>
          ) : (
            offers.map((offer) => (
              <TouchableOpacity
                key={offer.offerId}
                style={styles.offerCard}
                onPress={() => handleBookOffer(offer)}
              >
                <View style={styles.offerHeader}>
                  <Text style={styles.offerTitle}>{offer.title}</Text>
                  <Text style={styles.offerPrice}>{offer.priceTokens} 🪙</Text>
                </View>
                <Text style={styles.offerType}>{formatOfferType(offer.type)}</Text>
                <Text style={styles.offerDesc} numberOfLines={2}>
                  {offer.description}
                </Text>
                {offer.duration && (
                  <Text style={styles.offerDuration}>Duration: {offer.duration} min</Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Reviews */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Reviews ({expert.totalReviews})
          </Text>
          {reviews.length === 0 ? (
            <Text style={styles.emptyText}>No reviews yet</Text>
          ) : (
            reviews.map((review) => (
              <View key={review.reviewId} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewerName}>{review.reviewerName}</Text>
                  <Text style={styles.reviewRating}>
                    ⭐ {review.averageRating.toFixed(1)}
                  </Text>
                </View>
                <View style={styles.reviewRatings}>
                  <Text style={styles.reviewRatingDetail}>
                    Expertise: {review.ratings.expertise}/5
                  </Text>
                  <Text style={styles.reviewRatingDetail}>
                    Clarity: {review.ratings.clarity}/5
                  </Text>
                  <Text style={styles.reviewRatingDetail}>
                    Professionalism: {review.ratings.professionalism}/5
                  </Text>
                  <Text style={styles.reviewRatingDetail}>
                    Helpfulness: {review.ratings.helpfulness}/5
                  </Text>
                </View>
                {review.comment && (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  category: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 40,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  bio: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
  },
  expertise: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
  },
  certItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  certIcon: {
    fontSize: 16,
    color: '#10B981',
    marginRight: 8,
  },
  certText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  offerCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  offerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  offerPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B82F6',
  },
  offerType: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  offerDesc: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 8,
  },
  offerDuration: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
  reviewCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  reviewRating: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F59E0B',
  },
  reviewRatings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  reviewRatingDetail: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 12,
    marginBottom: 4,
  },
  reviewComment: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginTop: 8,
  },
});