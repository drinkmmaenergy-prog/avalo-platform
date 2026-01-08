/**
 * PACK 215: Viral Moments for Payers
 * 
 * High-spending/active men can generate growth:
 * - First friend joins: Chemistry match reveal (high-potential match highlighted)
 * - 3+ friends join: "Avalo Strong Profile" badge + boosted exposure
 * 
 * Result: More chances to find dates with high-value women
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface FriendInvite {
  id: string;
  invited_user_id: string;
  selfie_verified: boolean;
  joined_at: any;
}

interface PayerStats {
  hasSpendingHistory: boolean;
  totalInvited: number;
  verifiedFriends: number;
  rewards: {
    hasChemistryReveal: boolean;
    hasStrongProfileBadge: boolean;
  };
}

export default function PayerMomentsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<PayerStats>({
    hasSpendingHistory: false,
    totalInvited: 0,
    verifiedFriends: 0,
    rewards: {
      hasChemistryReveal: false,
      hasStrongProfileBadge: false,
    },
  });
  const [friends, setFriends] = useState<FriendInvite[]>([]);
  const [referralLink, setReferralLink] = useState<string>('');

  useEffect(() => {
    loadPayerData();
  }, [user]);

  const loadPayerData = async () => {
    if (!user?.uid) return;

    try {
      // Check spending history
      const transactionsQuery = query(
        collection(db, 'transactions'),
        where('user_id', '==', user.uid),
        where('type', '==', 'payment'),
        where('status', '==', 'completed')
      );
      
      const transactions = await getDocs(transactionsQuery);
      const hasSpending = !transactions.empty;

      // Get invited friends
      const friendsQuery = query(
        collection(db, 'invited_users'),
        where('inviter_id', '==', user.uid)
      );

      onSnapshot(friendsQuery, (snapshot) => {
        const friendsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as FriendInvite[];

        const verifiedCount = friendsList.filter(f => f.selfie_verified).length;

        setFriends(friendsList);
        setStats(prev => ({
          ...prev,
          hasSpendingHistory: hasSpending,
          totalInvited: friendsList.length,
          verifiedFriends: verifiedCount,
        }));
      });

      // Check for rewards
      const rewardsQuery = query(
        collection(db, 'viral_rewards'),
        where('user_id', '==', user.uid)
      );

      onSnapshot(rewardsQuery, (snapshot) => {
        const hasChemistry = snapshot.docs.some(
          doc => doc.data().reward_type === 'chemistry_reveal'
        );
        
        const badgesQuery = query(
          collection(db, 'viral_badges'),
          where('user_id', '==', user.uid),
          where('badge_type', '==', 'strong_profile_badge')
        );
        
        getDocs(badgesQuery).then(badgeSnapshot => {
          setStats(prev => ({
            ...prev,
            rewards: {
              hasChemistryReveal: hasChemistry,
              hasStrongProfileBadge: !badgeSnapshot.empty,
            },
          }));
        });
      });

      // Get referral link
      const linkQuery = query(
        collection(db, 'referral_links'),
        where('inviter_id', '==', user.uid),
        where('status', '==', 'active')
      );

      const linkSnapshot = await getDocs(linkQuery);
      if (!linkSnapshot.empty) {
        setReferralLink(linkSnapshot.docs[0].data().link_url);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading payer data:', error);
      setLoading(false);
    }
  };

  const generateReferralLink = async () => {
    if (!user?.uid) return;

    setProcessing(true);
    try {
      const generateLink = httpsCallable(functions, 'generateReferralLink');
      const result: any = await generateLink();
      
      if (result.data.link) {
        setReferralLink(result.data.link);
        Alert.alert('Success', 'Your referral link is ready!');
      }
    } catch (error) {
      console.error('Error generating link:', error);
      Alert.alert('Error', 'Failed to generate referral link');
    } finally {
      setProcessing(false);
    }
  };

  const shareLink = async () => {
    if (!referralLink) return;

    try {
      await Share.share({
        message: `Join me on Avalo! Experience real connections. 💫\n\n${referralLink}`,
        url: referralLink,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const claimViralReward = async () => {
    if (!user?.uid) return;

    setProcessing(true);
    try {
      const processViralMoment = httpsCallable(functions, 'processPayerViralMoment');
      const result: any = await processViralMoment();
      
      Alert.alert(
        'Viral Moment!',
        `You have ${result.data.friendCount} friends on Avalo. Check your rewards!`
      );
    } catch (error: any) {
      console.error('Error claiming reward:', error);
      Alert.alert('Error', error.message || 'Failed to process viral moment');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  if (!stats.hasSpendingHistory) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Viral Moments' }} />
        <View style={styles.notEligibleContainer}>
          <Text style={styles.notEligibleIcon}>💎</Text>
          <Text style={styles.notEligibleTitle}>Active Payers Only</Text>
          <Text style={styles.notEligibleText}>
            This feature is available for active members who support the community through paid activities.
          </Text>
          <TouchableOpacity
            style={styles.exploreButton}
            onPress={() => router.back()}
          >
            <Text style={styles.exploreButtonText}>Explore Avalo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const nextMilestone = stats.verifiedFriends >= 3 ? null : 
                        stats.verifiedFriends >= 1 ? 3 : 1;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Viral Moments' }} />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>💪 Build Your Network</Text>
          <Text style={styles.headerSubtitle}>
            Bring your friends and unlock exclusive matchmaking benefits
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.totalInvited}</Text>
            <Text style={styles.statLabel}>Friends Invited</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.verifiedFriends}</Text>
            <Text style={styles.statLabel}>Verified Friends</Text>
          </View>
        </View>

        {/* Rewards Status */}
        <View style={styles.rewardsSection}>
          <Text style={styles.sectionTitle}>🎁 Your Benefits</Text>
          
          <View style={[
            styles.rewardCard,
            stats.verifiedFriends >= 1 && styles.rewardCardUnlocked
          ]}>
            <View style={styles.rewardLeft}>
              <Text style={styles.rewardIcon}>🔮</Text>
              <View style={styles.rewardInfo}>
                <Text style={styles.rewardTitle}>Chemistry Match Reveal</Text>
                <Text style={styles.rewardDescription}>
                  High-potential match highlighted for you
                </Text>
              </View>
            </View>
            {stats.verifiedFriends >= 1 ? (
              <View style={styles.unlockedBadge}>
                <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
              </View>
            ) : (
              <View style={styles.lockedBadge}>
                <Text style={styles.lockedText}>1 friend</Text>
              </View>
            )}
          </View>

          <View style={[
            styles.rewardCard,
            stats.verifiedFriends >= 3 && styles.rewardCardUnlocked
          ]}>
            <View style={styles.rewardLeft}>
              <Text style={styles.rewardIcon}>💪</Text>
              <View style={styles.rewardInfo}>
                <Text style={styles.rewardTitle}>Strong Profile Badge</Text>
                <Text style={styles.rewardDescription}>
                  Increased exposure to top earners
                </Text>
              </View>
            </View>
            {stats.verifiedFriends >= 3 ? (
              <View style={styles.unlockedBadge}>
                <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
              </View>
            ) : (
              <View style={styles.lockedBadge}>
                <Text style={styles.lockedText}>3 friends</Text>
              </View>
            )}
          </View>
        </View>

        {/* Progress */}
        {nextMilestone && (
          <View style={styles.progressSection}>
            <Text style={styles.progressTitle}>
              {nextMilestone - stats.verifiedFriends} more friend{nextMilestone - stats.verifiedFriends > 1 ? 's' : ''} to unlock next reward
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${(stats.verifiedFriends / nextMilestone) * 100}%` }
                ]} 
              />
            </View>
          </View>
        )}

        {/* Referral Link */}
        <View style={styles.linkSection}>
          <Text style={styles.sectionTitle}>Share & Grow</Text>
          
          {referralLink ? (
            <>
              <View style={styles.linkCard}>
                <Text style={styles.linkText} numberOfLines={1}>
                  {referralLink}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.shareButton}
                onPress={shareLink}
              >
                <Ionicons name="share-social" size={20} color="#fff" />
                <Text style={styles.shareButtonText}>Share Your Link</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.generateButton}
              onPress={generateReferralLink}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="link" size={20} color="#fff" />
                  <Text style={styles.generateButtonText}>Generate Link</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Friends List */}
        {friends.length > 0 && (
          <View style={styles.friendsSection}>
            <Text style={styles.sectionTitle}>
              Your Network ({stats.verifiedFriends}/{stats.totalInvited})
            </Text>
            
            {friends.map((friend) => (
              <View key={friend.id} style={styles.friendCard}>
                <View style={styles.friendInfo}>
                  <View style={[
                    styles.friendStatus,
                    friend.selfie_verified && styles.friendStatusVerified
                  ]}>
                    <Ionicons 
                      name={friend.selfie_verified ? "checkmark-circle" : "time"} 
                      size={16} 
                      color={friend.selfie_verified ? "#4ECDC4" : "#888"} 
                    />
                  </View>
                  <Text style={styles.friendText}>
                    {friend.selfie_verified ? 'Verified Friend' : 'Pending Verification'}
                  </Text>
                </View>
                <Text style={styles.friendDate}>
                  {new Date(friend.joined_at?.seconds * 1000).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* How It Works */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          
          <View style={styles.infoStep}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>
              Share your unique link with friends
            </Text>
          </View>

          <View style={styles.infoStep}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>
              They install and verify with selfie
            </Text>
          </View>

          <View style={styles.infoStep}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>
              You unlock exclusive benefits
            </Text>
          </View>

          <View style={styles.infoStep}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>
              Get better matches and visibility
            </Text>
          </View>
        </View>

        {/* CTA */}
        {stats.verifiedFriends > 0 && (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={claimViralReward}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaButtonText}>Check My Rewards</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  notEligibleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  notEligibleIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  notEligibleTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  notEligibleText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  exploreButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  exploreButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#888',
    lineHeight: 22,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  rewardsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  rewardCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    opacity: 0.6,
  },
  rewardCardUnlocked: {
    opacity: 1,
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  rewardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rewardIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  rewardDescription: {
    fontSize: 12,
    color: '#888',
  },
  unlockedBadge: {
    marginLeft: 12,
  },
  lockedBadge: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 12,
  },
  lockedText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  progressSection: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  progressTitle: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ECDC4',
    borderRadius: 4,
  },
  linkSection: {
    marginBottom: 24,
  },
  linkCard: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  linkText: {
    fontSize: 14,
    color: '#fff',
  },
  shareButton: {
    flexDirection: 'row',
    backgroundColor: '#4ECDC4',
    padding: 16,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  generateButton: {
    flexDirection: 'row',
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  friendsSection: {
    marginBottom: 24,
  },
  friendCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendStatus: {
    marginRight: 8,
  },
  friendStatusVerified: {
    // Additional styling if needed
  },
  friendText: {
    fontSize: 14,
    color: '#fff',
  },
  friendDate: {
    fontSize: 12,
    color: '#888',
  },
  infoSection: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF6B6B',
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 32,
    marginRight: 12,
  },
  stepText: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  ctaButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
