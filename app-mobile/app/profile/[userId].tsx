import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from '../../hooks/useTranslation';
import { useFanIdentity } from '../../hooks/useFanIdentity';
import { getProfileById } from '../../lib/feedService';
import { ProfileData } from '../../lib/profileService';
import { CallPreflightModal } from '../../components/CallPreflightModal';
import { CallType } from '../../services/callService';
import { BoostPurchaseModal } from '../../components/BoostPurchaseModal';
import { SubscribeButton } from '../../components/SubscribeButton';
import { SubscriptionPriceSetter } from '../../components/SubscriptionPriceSetter';
import { PPVMediaLock } from '../../components/PPVMediaLock';
import CreatorOfferRibbon from '../../components/CreatorOfferRibbon';
import CreatorOfferModal from '../../components/CreatorOfferModal';
import CreatorDropRibbon from '../../components/CreatorDropRibbon';
import CreatorDropModal from '../../components/CreatorDropModal';
import FanChallengeRibbon from '../../components/FanChallengeRibbon';
import FanChallengeModal from '../../components/FanChallengeModal';
import LocalEventRibbon from '../../components/LocalEventRibbon';
import LocalEventAccessModal from '../../components/LocalEventAccessModal';
import { getActiveDiscoveryBoost, getBoostRemainingMinutes, Boost } from '../../services/boostService';
import { type Challenge } from '../../services/fanChallengeService';
import { checkUnlocked, getPrice, getCreatorMediaPrices } from '../../services/ppvService';
import { isSubscribed } from '../../services/subscriptionService';
import { getFirestore, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { getUserTier } from '../../services/sponsoredAdsService';
import { canUserSetChatPrice } from '../../services/messagePricingService';
import { CreatorOffer } from '../../services/creatorOfferService';
import { CreatorDrop } from '../../services/creatorDropsService';
import { getCompanionSettings } from '../../services/creatorAICompanionService';
import FanIdentityBadge from '../../components/FanIdentityBadge';
import FanIdentityPanel from '../../components/FanIdentityPanel';
import { registerFanEvent } from '../../services/fanIdentityService';
import {
  getActiveEventForCreator,
  getUserParticipation,
  refreshEventStatuses,
  LocalFanEvent,
} from '../../services/localEventService';

const { width } = Dimensions.get('window');

interface CreatorGoal {
  id: string;
  title: string;
  category: string;
  currentTokens: number;
  targetTokens: number;
}

interface PPVMediaItem {
  id: string;
  thumbnail: string;
  locked: boolean;
  price: number;
}

export default function ProfileDetailScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showCallModal, setShowCallModal] = useState(false);
  const [selectedCallType, setSelectedCallType] = useState<CallType>('VOICE');
  const [creatorGoals, setCreatorGoals] = useState<CreatorGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [activeBoost, setActiveBoost] = useState<Boost | null>(null);
  const [boostRemainingMinutes, setBoostRemainingMinutes] = useState(0);
  const [userTier, setUserTier] = useState<'standard' | 'vip' | 'royal'>('standard');
  const [showSubscriptionPriceSetter, setShowSubscriptionPriceSetter] = useState(false);
  const [canSetSubscriptionPrice, setCanSetSubscriptionPrice] = useState(false);
  const [ppvMedia, setPPVMedia] = useState<PPVMediaItem[]>([]);
  const [isVIPSubscriber, setIsVIPSubscriber] = useState(false);
  const [userBalance] = useState(500); // Placeholder balance
  const [selectedOffer, setSelectedOffer] = useState<CreatorOffer | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [selectedDrop, setSelectedDrop] = useState<CreatorDrop | null>(null);
  const [showDropModal, setShowDropModal] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [hasAICompanion, setHasAICompanion] = useState(false);
  const [localEvent, setLocalEvent] = useState<LocalFanEvent | null>(null);
  const [isEventUnlocked, setIsEventUnlocked] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const glowAnim = useState(new Animated.Value(1))[0];

  // Pack 33-13: Fan Identity Engine
  const fanIdentity = useFanIdentity(user?.uid && user.uid !== userId ? userId : null);

  useEffect(() => {
    startGlowAnimation();
    loadProfile();
    loadCreatorGoals();
    loadActiveBoost();
    checkCreatorPermissions();
    loadPPVMedia();
    checkAICompanion();
    loadLocalEvent();

    // Pack 33-13: Register profile view event
    if (user?.uid && userId && user.uid !== userId) {
      registerFanEvent({
        type: 'PROFILE_VIEWED',
        viewerId: user.uid,
        targetId: userId,
      }).catch(err => console.error('Error registering profile view:', err));
    }
  }, [userId, user?.uid]);

  const startGlowAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const checkAICompanion = async () => {
    if (!userId) return;
    try {
      const settings = await getCompanionSettings(userId);
      setHasAICompanion(settings?.enabled || false);
    } catch (error) {
      console.error('Error checking AI companion:', error);
    }
  };

  const loadLocalEvent = async () => {
    if (!userId || !user?.uid) return;
    
    try {
      await refreshEventStatuses();
      const event = await getActiveEventForCreator(userId);
      setLocalEvent(event);
      
      if (event && user.uid !== userId) {
        const participation = await getUserParticipation(event.id, user.uid);
        setIsEventUnlocked(participation !== null);
      }
    } catch (error) {
      console.error('Error loading local event:', error);
    }
  };

  useEffect(() => {
    // Update boost remaining time every minute
    if (activeBoost) {
      const interval = setInterval(() => {
        const remaining = getBoostRemainingMinutes(activeBoost);
        setBoostRemainingMinutes(remaining);
        
        // If boost expired, refresh
        if (remaining <= 0) {
          loadActiveBoost();
        }
      }, 60000); // Update every minute

      return () => clearInterval(interval);
    }
  }, [activeBoost]);

  const loadProfile = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const profileData = await getProfileById(userId);
      setProfile(profileData);
      
      // Determine user tier for badge colors
      if (profileData) {
        const tier = getUserTier(profileData.membership);
        setUserTier(tier);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadCreatorGoals = async () => {
    if (!userId) return;

    try {
      setGoalsLoading(true);
      const db = getFirestore();
      const goalsRef = collection(db, 'creatorGoals');
      const q = query(
        goalsRef,
        where('creatorId', '==', userId),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
        limit(2)
      );

      const snapshot = await getDocs(q);
      const goals: CreatorGoal[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        goals.push({
          id: doc.id,
          title: data.title,
          category: data.category,
          currentTokens: data.currentTokens || 0,
          targetTokens: data.targetTokens || 0,
        });
      });

      setCreatorGoals(goals);
    } catch (error) {
      console.error('Error loading creator goals:', error);
    } finally {
      setGoalsLoading(false);
    }
  };

  const loadActiveBoost = async () => {
    if (!userId) return;

    try {
      const boost = await getActiveDiscoveryBoost(userId);
      setActiveBoost(boost);
      
      if (boost) {
        const remaining = getBoostRemainingMinutes(boost);
        setBoostRemainingMinutes(remaining);
      }
    } catch (error) {
      console.error('Error loading active boost:', error);
    }
  };

  const checkCreatorPermissions = async () => {
    if (!user?.uid || user.uid !== userId) return;
    
    // Check if user can set subscription prices
    const canSet = await canUserSetChatPrice(user.uid);
    setCanSetSubscriptionPrice(canSet);
  };

  const loadPPVMedia = async () => {
    if (!userId || !user?.uid) return;

    try {
      // Check if current user is VIP subscriber
      const isVIP = await isSubscribed(user.uid, userId);
      setIsVIPSubscriber(isVIP);

      // Load placeholder PPV media
      const placeholderMedia = [
        { id: 'ppv_profile_1', thumbnail: 'https://picsum.photos/300/300?random=11', locked: false, price: 0 },
        { id: 'ppv_profile_2', thumbnail: 'https://picsum.photos/300/300?random=12', locked: false, price: 0 },
        { id: 'ppv_profile_3', thumbnail: 'https://picsum.photos/300/300?random=13', locked: false, price: 0 },
      ];

      // Load unlock status and prices
      const mediaWithStatus = await Promise.all(
        placeholderMedia.map(async (item) => {
          const unlocked = await checkUnlocked(user.uid, item.id);
          const price = await getPrice(item.id);
          return { ...item, locked: !unlocked, price };
        })
      );

      // Filter to show only media with prices set
      const mediaWithPrices = mediaWithStatus.filter(m => m.price > 0);
      setPPVMedia(mediaWithPrices);
    } catch (error) {
      console.error('Error loading PPV media:', error);
    }
  };

  const handlePPVUnlock = async () => {
    await loadPPVMedia();
  };

  const handleBuyTokens = () => {
    router.push('/(tabs)/wallet' as any);
  };

  const handleBoostProfile = () => {
    setShowBoostModal(true);
  };

  const handleBoostSuccess = (boostId: string, expiresAt: Date) => {
    showToast('Twój profil został wyróżniony! 🎉', 'success');
    loadActiveBoost(); // Refresh boost status
  };

  const handleBoostError = (error: string) => {
    showToast(error, 'error');
  };

  const handleSendIcebreaker = () => {
    if (!profile) return;

    Alert.alert(
      'Send Icebreaker',
      `Send an icebreaker to ${profile.name}?\n\nThis feature will open the chat creation flow.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            // TODO: Implement chat creation flow
            Alert.alert('Coming Soon', 'Chat feature is under development!');
          },
        },
      ]
    );
  };

  const handleVoiceCall = () => {
    if (!user?.uid) {
      Alert.alert('Błąd', 'Musisz być zalogowany, aby rozpocząć połączenie');
      return;
    }
    setSelectedCallType('VOICE');
    setShowCallModal(true);
  };

  const handleVideoCall = () => {
    if (!user?.uid) {
      Alert.alert('Błąd', 'Musisz być zalogowany, aby rozpocząć połączenie');
      return;
    }
    setSelectedCallType('VIDEO');
    setShowCallModal(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Profile not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backIconButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{profile.name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Pack 33-6: Creator Offer Ribbon (only for viewers, not own profile) */}
        {user?.uid && user.uid !== userId && (
          <CreatorOfferRibbon
            creatorId={userId}
            viewerId={user.uid}
            onPress={(offer) => {
              setSelectedOffer(offer);
              setShowOfferModal(true);
            }}
          />
        )}

        {/* Pack 33-7: Creator Drop Ribbon (only for viewers, not own profile) */}
        {user?.uid && user.uid !== userId && (
          <CreatorDropRibbon
            creatorId={userId}
            onPress={(drop) => {
              setSelectedDrop(drop);
              setShowDropModal(true);
            }}
          />
        )}

        {/* Pack 33-15: Fan Challenge Ribbon (only for viewers, not own profile) */}
        {user?.uid && user.uid !== userId && (
          <FanChallengeRibbon
            creatorId={userId}
            onPress={(challenge) => {
              setSelectedChallenge(challenge);
              setShowChallengeModal(true);
            }}
          />
        )}

        {/* Phase 34: Local Event Ribbon (only for viewers, not own profile) */}
        {user?.uid && user.uid !== userId && localEvent && localEvent.status === 'ACTIVE' && (
          <LocalEventRibbon
            event={localEvent}
            isUnlocked={isEventUnlocked}
            onPress={() => setShowEventModal(true)}
          />
        )}

        {/* Photo Gallery */}
        <View style={styles.photoGallery}>
          <Image
            source={{ uri: profile.photos[selectedPhotoIndex] }}
            style={styles.mainPhoto}
            resizeMode="cover"
          />
          
          {/* Photo Indicators */}
          {profile.photos.length > 1 && (
            <View style={styles.photoIndicators}>
              {profile.photos.map((_, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.photoIndicator,
                    selectedPhotoIndex === index && styles.photoIndicatorActive,
                  ]}
                  onPress={() => setSelectedPhotoIndex(index)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Profile Info */}
        <View style={styles.content}>
          {/* Active Boost Indicator */}
          {user?.uid === userId && activeBoost && boostRemainingMinutes > 0 && (
            <View style={styles.boostIndicator}>
              <Text style={styles.boostIndicatorIcon}>🔥</Text>
              <Text style={styles.boostIndicatorText}>
                Twój profil jest boostowany • {boostRemainingMinutes} min do końca
              </Text>
            </View>
          )}

          {/* Name, Age, City with Badge */}
          <View style={styles.section}>
            <View style={styles.nameRow}>
              <Text style={styles.nameAge}>
                {profile.name}, {profile.age}
              </Text>
              {/* Pack 33-13: Fan Identity Badge (only when viewing another user) */}
              {user?.uid && user.uid !== userId && !fanIdentity.loading && fanIdentity.fanIdentity && (
                <FanIdentityBadge tag={fanIdentity.relationshipTag} size="small" />
              )}
              {/* Premium Badge */}
              {(userTier === 'vip' || userTier === 'royal') && (
                <View style={[
                  styles.premiumBadge,
                  {
                    backgroundColor: userTier === 'royal' ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255, 215, 0, 0.15)',
                    borderColor: userTier === 'royal' ? '#D4AF37' : '#FFD700',
                  }
                ]}>
                  <Text style={styles.premiumBadgeText}>
                    {userTier === 'royal' ? '👑 Royal' : '⭐ VIP'}
                  </Text>
                </View>
              )}
              {userTier === 'standard' && (
                <View style={[styles.premiumBadge, styles.standardBadge]}>
                  <Text style={styles.standardBadgeText}>Standard</Text>
                </View>
              )}
            </View>
            <Text style={styles.city}>📍 {profile.city}</Text>
          </View>

          {/* Pack 33-13: Fan Identity Panel (show if not NEW and viewing another user) */}
          {user?.uid && user.uid !== userId && !fanIdentity.loading && fanIdentity.fanIdentity && fanIdentity.relationshipTag !== 'NEW' && (
            <FanIdentityPanel
              fanIdentity={fanIdentity.fanIdentity}
              relationshipLabel={fanIdentity.relationshipLabel}
              relationshipDescription={fanIdentity.relationshipDescription}
              highlightText={fanIdentity.highlightText}
              targetName={profile.name}
            />
          )}

          {/* Bio */}
          {profile.bio && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.bio}>{profile.bio}</Text>
            </View>
          )}

          {/* Interests */}
          {profile.interests && profile.interests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Interests</Text>
              <View style={styles.interestsContainer}>
                {profile.interests.map((interest, index) => (
                  <View key={index} style={styles.interestBadge}>
                    <Text style={styles.interestText}>{interest}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Looking For */}
          {profile.interestedIn && profile.interestedIn.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Looking For</Text>
              <Text style={styles.lookingForText}>
                {profile.interestedIn
                  .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
                  .join(', ')}
              </Text>
            </View>
          )}

          {/* Creator Goals Section */}
          {creatorGoals.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 Cele twórcy</Text>
              {creatorGoals.map((goal) => {
                const progress = (goal.currentTokens / goal.targetTokens) * 100;
                return (
                  <TouchableOpacity
                    key={goal.id}
                    style={styles.goalCard}
                    onPress={() => router.push(`/creator/goals/${goal.id}` as any)}
                  >
                    <View style={styles.goalHeader}>
                      <Text style={styles.goalTitle}>{goal.title}</Text>
                      <View style={styles.goalCategoryBadge}>
                        <Text style={styles.goalCategoryText}>{goal.category}</Text>
                      </View>
                    </View>
                    <View style={styles.goalProgressContainer}>
                      <View style={styles.goalProgressBar}>
                        <View style={[styles.goalProgressFill, { width: `${Math.min(progress, 100)}%` }]} />
                      </View>
                      <Text style={styles.goalProgressText}>
                        {progress.toFixed(0)}% • {goal.currentTokens.toLocaleString()} / {goal.targetTokens.toLocaleString()} 💎
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.viewAllGoalsButton}
                onPress={() => router.push(`/creator/goals?userId=${userId}` as any)}
              >
                <Text style={styles.viewAllGoalsText}>Zobacz wszystkie cele →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Phase 33-3: Subscribe Button (for viewers) */}
          {user?.uid && user.uid !== userId && (
            <SubscribeButton
              userId={user.uid}
              creatorId={userId}
              creatorName={profile.name}
              onSubscribe={() => {
                showToast('Subscribed successfully! 🎉', 'success');
              }}
            />
          )}

          {/* Phase 33-3: Subscription Price Setter Button (for creator viewing own profile) */}
          {user?.uid === userId && canSetSubscriptionPrice && (
            <View style={styles.subscriptionSetterContainer}>
              <TouchableOpacity
                style={styles.subscriptionSetterButton}
                onPress={() => setShowSubscriptionPriceSetter(true)}
              >
                <Text style={styles.subscriptionSetterIcon}>⭐</Text>
                <Text style={styles.subscriptionSetterText}>
                  Manage Subscription
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Phase 33-4: PPV Media Preview */}
          {ppvMedia.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💎 {t('ppv.exclusiveMedia')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.ppvMediaScroll}
              >
                {ppvMedia.map((item) => (
                  <View key={item.id} style={styles.ppvMediaItem}>
                    {item.locked ? (
                      <PPVMediaLock
                        mediaId={item.id}
                        creatorId={userId}
                        basePrice={item.price}
                        isVIPSubscriber={isVIPSubscriber}
                        userBalance={userBalance}
                        thumbnailUrl={item.thumbnail}
                        onUnlock={handlePPVUnlock}
                        onBuyTokens={handleBuyTokens}
                      />
                    ) : (
                      <TouchableOpacity
                        style={styles.ppvUnlockedMedia}
                        activeOpacity={0.8}
                      >
                        <Image
                          source={{ uri: item.thumbnail }}
                          style={styles.ppvMediaImage}
                          resizeMode="cover"
                        />
                        <View style={styles.ppvUnlockedBadge}>
                          <Text style={styles.ppvUnlockedText}>✓</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Action Buttons */}
      <View style={styles.bottomBar}>
        {/* Pack 33-11: AI Companion Button (only for viewers when creator has it enabled) */}
        {user?.uid && user.uid !== userId && hasAICompanion && (
          <Animated.View style={{ transform: [{ scale: glowAnim }] }}>
            <TouchableOpacity
              style={styles.aiCompanionButton}
              onPress={() => router.push(`/ai-companion/${userId}` as any)}
            >
              <Text style={styles.aiCompanionIcon}>🤖</Text>
              <Text style={styles.aiCompanionText}>{t('aiCompanion.chatWithAI')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
        {/* Show Boost Button only if viewing ANOTHER user's profile */}
        {user?.uid && user.uid !== userId && (
          <TouchableOpacity
            style={styles.boostButton}
            onPress={handleBoostProfile}
          >
            <Text style={styles.boostButtonIcon}>⚡</Text>
            <Text style={styles.boostButtonText}>Boostuj profil</Text>
          </TouchableOpacity>
        )}

        <View style={styles.callButtons}>
          <TouchableOpacity style={styles.voiceCallButton} onPress={handleVoiceCall}>
            <Text style={styles.callIcon}>📞</Text>
            <Text style={styles.callButtonText}>Połączenie głosowe</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.videoCallButton} onPress={handleVideoCall}>
            <Text style={styles.callIcon}>📹</Text>
            <Text style={styles.callButtonText}>Połączenie wideo</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.icebreakerButton} onPress={handleSendIcebreaker}>
          <Text style={styles.icebreakerButtonText}>Send Icebreaker</Text>
        </TouchableOpacity>
      </View>

      {/* Call Preflight Modal */}
      {user?.uid && profile && (
        <CallPreflightModal
          visible={showCallModal}
          onClose={() => setShowCallModal(false)}
          callType={selectedCallType}
          otherUserId={userId}
          otherUserName={profile.name}
          currentUserId={user.uid}
        />
      )}

      {/* Boost Purchase Modal */}
      {user?.uid && (
        <BoostPurchaseModal
          visible={showBoostModal}
          onClose={() => setShowBoostModal(false)}
          userId={user.uid}
          onSuccess={handleBoostSuccess}
          onError={handleBoostError}
          onNeedTokens={() => {
            setShowBoostModal(false);
            router.push('/(tabs)/wallet' as any);
          }}
        />
      )}

      {/* Phase 33-3: Subscription Price Setter Modal */}
      {user?.uid === userId && canSetSubscriptionPrice && (
        <SubscriptionPriceSetter
          visible={showSubscriptionPriceSetter}
          onClose={() => setShowSubscriptionPriceSetter(false)}
          creatorId={userId}
          onPriceSet={(price) => {
            showToast(`Subscription price set to ${price} tokens/month`, 'success');
          }}
        />
      )}

      {/* Pack 33-6: Creator Offer Modal */}
      {user?.uid && selectedOffer && (
        <CreatorOfferModal
          visible={showOfferModal}
          offer={selectedOffer}
          viewerId={user.uid}
          onClose={() => {
            setShowOfferModal(false);
            setSelectedOffer(null);
          }}
          onPurchaseSuccess={() => {
            showToast(t('creatorOffers.toast_offerUnlocked') || 'Offer unlocked successfully!', 'success');
          }}
        />
      )}

      {/* Pack 33-7: Creator Drop Modal */}
      {user?.uid && selectedDrop && (
        <CreatorDropModal
          visible={showDropModal}
          drop={selectedDrop}
          viewerId={user.uid}
          isVip={userTier === 'vip' || userTier === 'royal'}
          onClose={() => {
            setShowDropModal(false);
            setSelectedDrop(null);
          }}
          onPurchaseSuccess={() => {
            showToast(t('creatorDrops.successPurchase') || 'Drop purchased successfully!', 'success');
          }}
        />
      )}

      {/* Pack 33-15: Fan Challenge Modal */}
      {user?.uid && selectedChallenge && (
        <FanChallengeModal
          visible={showChallengeModal}
          challenge={selectedChallenge}
          userId={user.uid}
          onClose={() => {
            setShowChallengeModal(false);
            setSelectedChallenge(null);
          }}
          onJoin={() => {
            showToast(t('fanChallenge.joined') || 'Challenge joined!', 'success');
          }}
        />
      )}

      {/* Phase 34: Local Event Access Modal */}
      {user?.uid && localEvent && (
        <LocalEventAccessModal
          visible={showEventModal}
          event={localEvent}
          creatorName={profile?.name || ''}
          userId={user.uid}
          isUnlocked={isEventUnlocked}
          onClose={() => setShowEventModal(false)}
          onUnlockSuccess={() => {
            loadLocalEvent();
            showToast(t('localEvents.unlockSuccess') || 'Event access unlocked!', 'success');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FF6B6B',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 28,
    color: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  photoGallery: {
    width: width,
    height: width * 1.2,
    position: 'relative',
  },
  mainPhoto: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  photoIndicators: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  photoIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  photoIndicatorActive: {
    backgroundColor: '#fff',
    width: 24,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  nameAge: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 12,
  },
  premiumBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 2,
  },
  premiumBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  standardBadge: {
    backgroundColor: 'rgba(64, 224, 208, 0.15)',
    borderColor: '#40E0D0',
  },
  standardBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  city: {
    fontSize: 18,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  bio: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  interestBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  interestText: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  lookingForText: {
    fontSize: 16,
    color: '#666',
  },
  boostIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#40E0D0',
  },
  boostIndicatorIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  boostIndicatorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#40E0D0',
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    gap: 12,
  },
  boostButton: {
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#40E0D0',
  },
  boostButtonIcon: {
    fontSize: 20,
  },
  boostButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  callButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  voiceCallButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#40E0D0',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  videoCallButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9C27B0',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  callIcon: {
    fontSize: 20,
  },
  callButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  icebreakerButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  icebreakerButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  goalCard: {
    backgroundColor: '#F9F9F9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  goalCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    borderRadius: 8,
  },
  goalCategoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#40E0D0',
  },
  goalProgressContainer: {
    gap: 8,
  },
  goalProgressBar: {
    height: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    backgroundColor: '#40E0D0',
    borderRadius: 4,
  },
  goalProgressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  viewAllGoalsButton: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  viewAllGoalsText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#40E0D0',
  },
  subscriptionSetterContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  subscriptionSetterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4AF37',
    paddingVertical: 16,
    borderRadius: 18,
    gap: 10,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  subscriptionSetterIcon: {
    fontSize: 24,
  },
  subscriptionSetterText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  ppvMediaScroll: {
    paddingVertical: 4,
    gap: 12,
  },
  ppvMediaItem: {
    width: 200,
    height: 200,
  },
  ppvUnlockedMedia: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  ppvMediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
  },
  ppvUnlockedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ppvUnlockedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  aiCompanionButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 16,
    borderRadius: 18,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
  },
  aiCompanionIcon: {
    fontSize: 24,
  },
  aiCompanionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});