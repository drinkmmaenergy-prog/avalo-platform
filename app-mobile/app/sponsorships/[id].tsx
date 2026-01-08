/**
 * PACK 151 - Sponsorship Detail Screen
 * View and apply to sponsorship opportunities
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
  TextInput,
  Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getAuth } from 'firebase/auth';
import type { SponsorshipOffer } from '../../lib/sponsorships/types';
import {
  getDealTypeLabel,
  formatCurrency,
  getDealTypeColor,
  getDeliverableTypeLabel,
  isOfferExpired,
  SponsorshipSDK
} from '../../lib/sponsorships/sdk';

export default function SponsorshipDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const auth = getAuth();
  const user = auth.currentUser;

  const [offer, setOffer] = useState<SponsorshipOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');

  useEffect(() => {
    loadOffer();
  }, [id]);

  const loadOffer = async () => {
    try {
      setLoading(true);
      const offerDoc = await getDoc(doc(db, 'sponsorship_offers', id as string));
      
      if (offerDoc.exists()) {
        const data = offerDoc.data();
        setOffer({
          ...data,
          id: offerDoc.id,
          metadata: {
            ...data.metadata,
            createdAt: data.metadata.createdAt instanceof Timestamp 
              ? data.metadata.createdAt.toDate() 
              : new Date(data.metadata.createdAt),
            updatedAt: data.metadata.updatedAt instanceof Timestamp 
              ? data.metadata.updatedAt.toDate() 
              : new Date(data.metadata.updatedAt),
            expiresAt: data.metadata.expiresAt 
              ? (data.metadata.expiresAt instanceof Timestamp 
                ? data.metadata.expiresAt.toDate() 
                : new Date(data.metadata.expiresAt))
              : undefined
          }
        } as SponsorshipOffer);
      }
    } catch (error) {
      console.error('Error loading sponsorship:', error);
      Alert.alert('Error', 'Failed to load sponsorship details');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please sign in to apply');
      return;
    }

    try {
      setApplying(true);

      const result = await SponsorshipSDK.applyToSponsorship({
        offerId: id as string,
        creatorId: user.uid,
        message: applicationMessage,
        portfolioItems: []
      });

      Alert.alert(
        'Application Submitted',
        'Your application has been submitted successfully. The brand will review it shortly.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Error applying:', error);
      Alert.alert('Error', error.message || 'Failed to submit application');
    } finally {
      setApplying(false);
      setShowApplicationForm(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Sponsorship not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isExpired = isOfferExpired(offer.metadata.expiresAt);
  const isFull = offer.currentCreators >= offer.maxCreators;
  const canApply = !isExpired && !isFull && offer.status === 'open';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        {offer.brandLogo && (
          <Image source={{ uri: offer.brandLogo }} style={styles.brandLogo} />
        )}
        <Text style={styles.brandName}>{offer.brandName}</Text>
        <View style={[styles.dealTypeBadge, { backgroundColor: getDealTypeColor(offer.dealType) }]}>
          <Text style={styles.dealTypeText}>{getDealTypeLabel(offer.dealType)}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{offer.title}</Text>
        <Text style={styles.description}>{offer.description}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compensation</Text>
          <View style={styles.compensationCard}>
            <Text style={styles.compensationAmount}>
              {offer.compensation.useTokens && '🪙 '}
              {formatCurrency(offer.compensation.amount, offer.compensation.currency)}
            </Text>
            {offer.compensation.useTokens && offer.compensation.splitRatio && (
              <Text style={styles.compensationNote}>
                Creator receives {offer.compensation.splitRatio.creator}% 
                (Platform fee: {offer.compensation.splitRatio.platform}%)
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requirements</Text>
          <View style={styles.requirementRow}>
            <Text style={styles.requirementLabel}>Deliverables:</Text>
            <Text style={styles.requirementValue}>
              {offer.requirements.deliverableCount} items
            </Text>
          </View>
          <View style={styles.requirementRow}>
            <Text style={styles.requirementLabel}>Timeline:</Text>
            <Text style={styles.requirementValue}>{offer.requirements.timeline}</Text>
          </View>
          {offer.requirements.minFollowers && (
            <View style={styles.requirementRow}>
              <Text style={styles.requirementLabel}>Min Followers:</Text>
              <Text style={styles.requirementValue}>
                {offer.requirements.minFollowers.toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deliverable Types</Text>
          <View style={styles.deliverableTypes}>
            {offer.requirements.deliverableTypes.map((type, index) => (
              <View key={index} style={styles.deliverableTypeBadge}>
                <Text style={styles.deliverableTypeText}>
                  {getDeliverableTypeLabel(type)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {offer.requirements.categories && offer.requirements.categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Categories</Text>
            <View style={styles.categories}>
              {offer.requirements.categories.map((category, index) => (
                <View key={index} style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{category}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Availability</Text>
          <View style={styles.availabilityRow}>
            <Text style={styles.availabilityLabel}>Spots Taken:</Text>
            <Text style={styles.availabilityValue}>
              {offer.currentCreators} / {offer.maxCreators}
            </Text>
          </View>
          {offer.metadata.expiresAt && (
            <View style={styles.availabilityRow}>
              <Text style={styles.availabilityLabel}>Expires:</Text>
              <Text style={[
                styles.availabilityValue,
                isExpired && styles.expiredText
              ]}>
                {new Date(offer.metadata.expiresAt).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>

        {isExpired && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>⚠️ This sponsorship has expired</Text>
          </View>
        )}

        {isFull && !isExpired && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>⚠️ All spots have been filled</Text>
          </View>
        )}

        {!showApplicationForm && canApply && (
          <TouchableOpacity
            style={styles.applyButton}
            onPress={() => setShowApplicationForm(true)}
          >
            <Text style={styles.applyButtonText}>Apply Now</Text>
          </TouchableOpacity>
        )}

        {showApplicationForm && (
          <View style={styles.applicationForm}>
            <Text style={styles.formTitle}>Application Message (Optional)</Text>
            <TextInput
              style={styles.messageInput}
              placeholder="Tell the brand why you're a great fit..."
              value={applicationMessage}
              onChangeText={setApplicationMessage}
              multiline
              numberOfLines={4}
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.formButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowApplicationForm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, applying && styles.submitButtonDisabled]}
                onPress={handleApply}
                disabled={applying}
              >
                {applying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Application</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB'
  },
  header: {
    backgroundColor: '#8B5CF6',
    padding: 20,
    paddingTop: 60,
    alignItems: 'center'
  },
  brandLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#FFFFFF'
  },
  brandName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8
  },
  dealTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  dealTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  content: {
    padding: 20
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
    marginBottom: 24
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12
  },
  compensationCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  compensationAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8B5CF6',
    marginBottom: 8
  },
  compensationNote: {
    fontSize: 14,
    color: '#6B7280'
  },
  requirementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  requirementLabel: {
    fontSize: 14,
    color: '#6B7280'
  },
  requirementValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827'
  },
  deliverableTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  deliverableTypeBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  deliverableTypeText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '500'
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  categoryBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  categoryText: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '500'
  },
  availabilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  availabilityLabel: {
    fontSize: 14,
    color: '#6B7280'
  },
  availabilityValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827'
  },
  expiredText: {
    color: '#EF4444'
  },
  warningCard: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginBottom: 16
  },
  warningText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '500',
    textAlign: 'center'
  },
  applyButton: {
    backgroundColor: '#8B5CF6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  applicationForm: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 8
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12
  },
  messageInput: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center'
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280'
  },
  submitButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
    alignItems: 'center'
  },
  submitButtonDisabled: {
    opacity: 0.5
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  errorText: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 20
  },
  backButton: {
    padding: 12,
    backgroundColor: '#8B5CF6',
    borderRadius: 8
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF'
  }
});