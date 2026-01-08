import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
// PACK 248: Romance scam protection
import {
  analyzeMessageForScam,
  submitStopScamReport,
  getSubtleWarning,
} from '../../services/romanceScamService';
import { RomanceScamDetection } from '../../types/romance-scam.types';
// PACK 249: NSFW Shield
import {
  analyzeMessageForNSFW,
  checkNSFWSafeZone,
  recordNSFWConsent,
  shouldBlockMessage,
  getNSFWWarningMessage,
  detectsExplicitContent,
} from '../../services/nsfwShieldService';
import { NSFWDetection } from '../../types/nsfw-shield.types';
import { NSFWConsentModal } from '../../components/NSFWConsentModal';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from '../../hooks/useTranslation';
import { ChatBubble } from '../../components/ChatBubble';
import { MediaBubble } from '../../components/MediaBubble';
import { MediaAttachmentModal } from '../../components/MediaAttachmentModal';
import { TokenPurchaseModal } from '../../components/TokenPurchaseModal';
import { CallPreflightModal } from '../../components/CallPreflightModal';
import { WelcomeMessagePicker } from '../../components/WelcomeMessagePicker';
import { ChatMessagePriceSetter } from '../../components/ChatMessagePriceSetter';
import { ChatSendCostIndicator } from '../../components/ChatSendCostIndicator';
import { MessageEarningIndicator } from '../../components/MessageEarningIndicator';
import { VIPRoomEntryCard } from '../../components/VIPRoomEntryCard';
import CreatorOfferModal from '../../components/CreatorOfferModal';
import CreatorDropModal from '../../components/CreatorDropModal';
import { CallType } from '../../services/callService';
import { isSubscribed } from '../../services/subscriptionService';
import {
  unlockMedia,
  createMediaMessage,
  saveChatMessage,
} from '../../services/chatMediaService';
import { MediaType } from '../../services/mediaPricingService';
import {
  getActiveOffersForViewer,
  hasUserPurchasedOffer,
  CreatorOffer,
} from '../../services/creatorOfferService';
import {
  getActiveDrop,
  CreatorDrop,
} from '../../services/creatorDropsService';
import {
  subscribeToMessages,
  sendMessage,
  markChatAsRead,
  getChatDetails,
  ChatMessage,
} from '../../services/chatService';
import { registerChallengeProgress } from '../../services/fanChallengeService';
import {
  subscribeToTokenBalance,
  calculateMessageCost,
  hasEnoughTokens,
  processMessageTransaction,
} from '../../services/tokenService';
import {
  createChatRetargetBoost,
  isChatEligibleForRetarget,
  BOOST_CONFIG,
} from '../../services/boostService';
import { getProfile, ProfileData } from '../../lib/profileService';
import { generateWelcomeMessages, WelcomeMessageBundle } from '../../utils/aiWelcomeMessage';
import { loadQuizAnswers, QuizAnswers } from '../../services/onboardingProfileService';
import { useLocaleContext } from '../../contexts/LocaleContext';
import {
  getChatPrice,
  canUserSetChatPrice,
  calculateCreatorEarnings,
} from '../../services/messagePricingService';
// PACK 45: Chat sync service
import {
  subscribeToConversation,
  markMessagesDelivered,
  markConversationRead,
} from '../../services/chatSyncService';

export default function ChatConversationScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { locale } = useLocaleContext();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherUserName, setOtherUserName] = useState('User');
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [selectedCallType, setSelectedCallType] = useState<CallType>('VOICE');
  const [showBoostConfirmModal, setShowBoostConfirmModal] = useState(false);
  const [canShowBoostIcon, setCanShowBoostIcon] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState<Date | null>(null);
  const flatListRef = useRef<FlatList>(null);
  
  // Phase 32-3: Welcome message picker state
  const [showWelcomePicker, setShowWelcomePicker] = useState(false);
  const [welcomeMessages, setWelcomeMessages] = useState<WelcomeMessageBundle | null>(null);
  const [hasCheckedWelcome, setHasCheckedWelcome] = useState(false);
  
  // Phase 33-2: Monetized chat state
  const [showPriceSetter, setShowPriceSetter] = useState(false);
  const [chatPrice, setChatPrice] = useState(0);
  const [canSetPrice, setCanSetPrice] = useState(false);
  const [messageEarnings, setMessageEarnings] = useState<{ [messageId: string]: number }>({});
  
  // PACK 42: Media attachment state
  const [showMediaModal, setShowMediaModal] = useState(false);
  
  // Phase 33-3: Subscription state
  const [isVIPSubscriber, setIsVIPSubscriber] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  
  // Pack 33-6: Creator offers state
  const [creatorOffers, setCreatorOffers] = useState<CreatorOffer[]>([]);
  const [showOfferCTA, setShowOfferCTA] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<CreatorOffer | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  
  // Pack 33-7: Creator drops state
  const [creatorDrop, setCreatorDrop] = useState<CreatorDrop | null>(null);
  const [showDropCTA, setShowDropCTA] = useState(false);
  const [showDropModal, setShowDropModal] = useState(false);
  
  // PACK 248: Romance scam protection state
  const [showStopScamModal, setShowStopScamModal] = useState(false);
  const [scamWarning, setScamWarning] = useState<string | null>(null);
  const [lastScamDetection, setLastScamDetection] = useState<RomanceScamDetection | null>(null);

  // PACK 249: NSFW Shield state
  const [showNSFWConsentModal, setShowNSFWConsentModal] = useState(false);
  const [nsfwSafeZoneActive, setNsfwSafeZoneActive] = useState(false);
  const [nsfwWarning, setNsfwWarning] = useState<string | null>(null);
  const [pendingExplicitMessage, setPendingExplicitMessage] = useState<string | null>(null);
  const [lastNSFWDetection, setLastNSFWDetection] = useState<NSFWDetection | null>(null);

  useEffect(() => {
    if (!chatId || !user?.uid) {
      setLoading(false);
      return;
    }

    // Load chat details
    getChatDetails(chatId).then((chat) => {
      if (chat) {
        const foundOtherUserId = chat.participants.find((id) => id !== user.uid);
        setOtherUserName(foundOtherUserId || 'User');
        setOtherUserId(foundOtherUserId || null);
      }
    });

    // Mark chat as read immediately
    markChatAsRead(chatId, user.uid).catch((error) => {
      console.error('Error marking chat as read:', error);
    });

    // Subscribe to messages (original Firestore subscription)
    const unsubscribe = subscribeToMessages(
      chatId,
      (updatedMessages) => {
        setMessages(updatedMessages);
        setLoading(false);
        
        // Phase 32-3: Check if we need to show welcome message picker
        if (!hasCheckedWelcome && updatedMessages.length === 0 && otherUserId) {
          checkAndShowWelcomePicker();
        }
        
        // Track last message time for boost eligibility
        if (updatedMessages.length > 0) {
          const lastMsg = updatedMessages[updatedMessages.length - 1];
          // Handle both Firestore timestamp and createdAt number
          const msgTime = (lastMsg as any).timestamp instanceof Date
            ? (lastMsg as any).timestamp
            : ((lastMsg as any).timestamp?.toDate ? (lastMsg as any).timestamp.toDate() : new Date(lastMsg.createdAt || Date.now()));
          setLastMessageTime(msgTime);
        }
        
        // Auto-scroll to latest message
        setTimeout(() => {
          if (flatListRef.current && updatedMessages.length > 0) {
            flatListRef.current.scrollToEnd({ animated: true });
          }
        }, 100);
      },
      (error) => {
        console.error('Error subscribing to messages:', error);
        setLoading(false);
      }
    );

    // Cleanup subscription
    return () => {
      unsubscribe();
    };
  }, [chatId, user?.uid, otherUserId, hasCheckedWelcome]);

  // PACK 249: Check NSFW Safe Zone status on mount
  useEffect(() => {
    if (!chatId) return;

    const checkSafeZone = async () => {
      const isActive = await checkNSFWSafeZone(chatId);
      setNsfwSafeZoneActive(isActive);
    };

    checkSafeZone();
  }, [chatId]);

  // PACK 45: Mark received messages as delivered and read
  useEffect(() => {
    if (!user?.uid || !otherUserId || messages.length === 0) return;

    const markReceivedMessages = async () => {
      // Get messages sent by partner that haven't been marked as read yet
      const unreadMessages = messages.filter(
        (msg) => msg.senderId === otherUserId && msg.receiverId === user.uid
      );

      if (unreadMessages.length === 0) return;

      try {
        // Mark all as delivered and read when viewing chat
        await markConversationRead(user.uid, otherUserId);
      } catch (error) {
        console.error('[PACK 45] Error marking messages read:', error);
      }
    };

    // Mark messages when screen is visible
    markReceivedMessages();
  }, [messages, user?.uid, otherUserId]);

  // Phase 33-2: Load chat price and check creator permissions
  useEffect(() => {
    const loadChatPricing = async () => {
      if (!chatId || !user?.uid) return;

      try {
        const price = await getChatPrice(chatId);
        setChatPrice(price);

        const canSet = await canUserSetChatPrice(user.uid);
        setCanSetPrice(canSet);
      } catch (error) {
        console.error('Error loading chat pricing:', error);
      }
    };

    loadChatPricing();
  }, [chatId, user?.uid]);

  // Phase 33-3: Check subscription status
  useEffect(() => {
    checkSubscriptionStatus();
  }, [user?.uid, otherUserId]);

  const checkSubscriptionStatus = async () => {
    if (!user?.uid || !otherUserId) {
      setCheckingSubscription(false);
      return;
    }

    try {
      // Check if current user is subscribed to the other user
      const subscribed = await isSubscribed(user.uid, otherUserId);
      setIsVIPSubscriber(subscribed);
    } catch (error) {
      console.error('Error checking subscription status:', error);
      setIsVIPSubscriber(false);
    } finally {
      setCheckingSubscription(false);
    }
  };

  // Pack 33-6: Load creator offers
  useEffect(() => {
    checkCreatorOffers();
  }, [user?.uid, otherUserId, isVIPSubscriber]);

  // Pack 33-7: Load creator drops
  useEffect(() => {
    checkCreatorDrops();
  }, [user?.uid, otherUserId, isVIPSubscriber]);

  const checkCreatorOffers = async () => {
    if (!user?.uid || !otherUserId) {
      setShowOfferCTA(false);
      return;
    }

    try {
      // Only show offers if NOT subscribed
      if (isVIPSubscriber) {
        setShowOfferCTA(false);
        return;
      }

      // Get active offers for this creator that viewer hasn't purchased
      const offers = await getActiveOffersForViewer(otherUserId, user.uid);
      setCreatorOffers(offers);
      
      // Show CTA if there are available offers
      setShowOfferCTA(offers.length > 0);
    } catch (error) {
      console.error('Error checking creator offers:', error);
      setShowOfferCTA(false);
    }
  };

  const handleOfferCTAPress = () => {
    if (creatorOffers.length > 0) {
      setSelectedOffer(creatorOffers[0]); // Show first available offer
      setShowOfferModal(true);
    }
  };

  const handleOfferPurchaseSuccess = () => {
    setShowOfferCTA(false); // Hide CTA after purchase
    showToast(
      t('creatorOffers.toast_offerUnlocked') || 'Offer unlocked successfully!',
      'success'
    );
  };

  const checkCreatorDrops = async () => {
    if (!user?.uid || !otherUserId) {
      setShowDropCTA(false);
      return;
    }

    try {
      // Only show drops if NOT subscribed
      if (isVIPSubscriber) {
        setShowDropCTA(false);
        return;
      }

      // Get active drop for this creator
      const activeDrop = await getActiveDrop(otherUserId);
      
      if (activeDrop && activeDrop.active) {
        const seatsLeft = activeDrop.seats - activeDrop.purchasedBy.length;
        // Only show if seats available
        if (seatsLeft > 0) {
          setCreatorDrop(activeDrop);
          setShowDropCTA(true);
        } else {
          setShowDropCTA(false);
        }
      } else {
        setShowDropCTA(false);
      }
    } catch (error) {
      console.error('Error checking creator drops:', error);
      setShowDropCTA(false);
    }
  };

  const handleDropCTAPress = () => {
    if (creatorDrop) {
      setShowDropModal(true);
    }
  };

  const handleDropPurchaseSuccess = () => {
    setShowDropCTA(false); // Hide CTA after purchase
    showToast(
      t('creatorDrops.successPurchase') || 'Drop purchased successfully!',
      'success'
    );
    checkCreatorDrops(); // Refresh drop status
  };

  // Subscribe to token balance
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeToTokenBalance(
      user.uid,
      (balance) => {
        setTokenBalance(balance);
      },
      (error) => {
        console.error('Error subscribing to token balance:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  // Check boost eligibility
  useEffect(() => {
    const checkBoostEligibility = async () => {
      if (!chatId || !lastMessageTime) {
        setCanShowBoostIcon(false);
        return;
      }

      const minutesSinceLastMessage = (Date.now() - lastMessageTime.getTime()) / (1000 * 60);
      const hasEnoughBalance = tokenBalance >= BOOST_CONFIG.chatRetarget.ping.tokens;
      const isInactive = minutesSinceLastMessage >= 60;

      setCanShowBoostIcon(isInactive && hasEnoughBalance);
    };

    checkBoostEligibility();
    
    // Recheck every minute
    const interval = setInterval(checkBoostEligibility, 60000);
    return () => clearInterval(interval);
  }, [chatId, lastMessageTime, tokenBalance]);

  // Phase 32-3: Function to check and show welcome message picker
  const checkAndShowWelcomePicker = async () => {
    if (!user?.uid || !otherUserId || hasCheckedWelcome) return;

    setHasCheckedWelcome(true);

    try {
      // Load profiles
      const [selfProfile, matchedProfile, quizAnswers] = await Promise.all([
        getProfile(user.uid),
        getProfile(otherUserId),
        loadQuizAnswers(),
      ]);

      if (selfProfile && matchedProfile) {
        // Generate welcome messages
        const language = locale === 'pl' ? 'pl' : 'en';
        const messages = generateWelcomeMessages(
          selfProfile,
          matchedProfile,
          language,
          quizAnswers || undefined
        );

        setWelcomeMessages(messages);
        setShowWelcomePicker(true);
      }
    } catch (error) {
      console.error('Error generating welcome messages:', error);
      // Silently fail - user can still type manually
    }
  };

  // Phase 32-3: Handle welcome message selection
  const handleWelcomeMessageSelect = (message: string) => {
    setInputText(message);
    setShowWelcomePicker(false);
  };

  // Phase 32-3: Handle welcome picker cancel
  const handleWelcomePickerCancel = () => {
    setShowWelcomePicker(false);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !chatId || !user?.uid || sending || !otherUserId) {
      return;
    }

    const messageText = inputText.trim();
    
    // PACK 249: Check for NSFW content BEFORE sending
    const nsfwDetection = await analyzeMessageForNSFW(
      messageText,
      `temp_${Date.now()}`,
      chatId,
      user.uid,
      otherUserId
    );
    
    // If prohibited content detected, block immediately
    if (nsfwDetection && shouldBlockMessage(nsfwDetection)) {
      Alert.alert(
        'Message Not Sent',
        'This message contains prohibited content and cannot be sent. Please keep conversations legal and consensual.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // If explicit content detected and no consent yet, ask for consent
    if (detectsExplicitContent(messageText) && !nsfwSafeZoneActive) {
      setPendingExplicitMessage(messageText);
      setShowNSFWConsentModal(true);
      return;
    }
    
    // If gray zone detected, show warning but allow
    if (nsfwDetection && nsfwDetection.riskLevel === 'GRAY_ZONE') {
      const warningMsg = getNSFWWarningMessage(nsfwDetection.riskLevel);
      if (warningMsg) {
        setNsfwWarning(warningMsg);
        setTimeout(() => setNsfwWarning(null), 8000);
      }
    }
    
    // Phase 33-3: Subscribers get free chat (no pricing)
    if (isVIPSubscriber) {
      // VIP subscribers don't pay for messages
      setSending(true);
      setInputText('');
      
      try {
        await sendMessage(chatId, user.uid, messageText);
      } catch (error) {
        console.error('Error sending message:', error);
        setInputText(messageText);
        Alert.alert('Error', 'Failed to send message. Please try again.');
      } finally {
        setSending(false);
      }
      return;
    }
    
    // Phase 33-2: Check if chat has a price and handle UI-only payment (for non-subscribers)
    if (chatPrice > 0) {
      // Check if user has enough tokens (UI only)
      if (tokenBalance < chatPrice) {
        Alert.alert(
          t('monetizedChat.notEnoughTokens'),
          t('monetizedChat.notEnoughTokensMessage', {
            required: chatPrice,
            balance: tokenBalance
          }),
          [
            {
              text: t('monetizedChat.buyTokens'),
              onPress: () => setShowPurchaseModal(true),
            },
            {
              text: t('common.cancel'),
              style: 'cancel',
            },
          ]
        );
        return;
      }

      // UI-only: Deduct tokens from sender's visual balance
      setTokenBalance(prev => prev - chatPrice);
      
      // UI-only: Add earnings to creator's visual balance (if current user is receiver)
      const creatorEarnings = calculateCreatorEarnings(chatPrice);
      
      // Store earnings for this message (for visual display)
      const tempMessageId = `msg_${Date.now()}`;
      setMessageEarnings(prev => ({
        ...prev,
        [tempMessageId]: creatorEarnings,
      }));
    }

    setSending(true);

    try {
      // Calculate message cost (existing logic)
      const costInfo = await calculateMessageCost(chatId, user.uid);

      // Check if this is a paid message (existing logic)
      if (costInfo.shouldCharge) {
        // Check if user has enough tokens
        const hasTokens = await hasEnoughTokens(user.uid, costInfo.cost);

        if (!hasTokens) {
          // Show purchase modal
          setSending(false);
          Alert.alert(
            'Insufficient Tokens',
            `You need ${costInfo.cost} tokens to send this message. Your current balance is ${tokenBalance} tokens.`,
            [
              {
                text: 'Buy Tokens',
                onPress: () => setShowPurchaseModal(true),
              },
              {
                text: 'Cancel',
                style: 'cancel',
              },
            ]
          );
          return;
        }
      }

      // Clear input immediately for better UX
      setInputText('');

      // Send the message
      await sendMessage(chatId, user.uid, messageText);
      
      // PACK 248: Analyze message for romance scam after sending
      // Generate a temporary message ID for tracking
      const tempMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const scamDetection = await analyzeMessageForScam(
        messageText,
        tempMessageId,
        chatId,
        user.uid,
        otherUserId
      );
      
      if (scamDetection) {
        setLastScamDetection(scamDetection);
        // Show subtle warning based on risk level
        const warning = getSubtleWarning(scamDetection.riskLevel);
        if (warning && scamDetection.riskLevel !== 'LOW') {
          setScamWarning(warning);
          // Auto-hide warning after 8 seconds
          setTimeout(() => setScamWarning(null), 8000);
        }
        
        // PACK 249: Store NSFW detection if flagged
        if (nsfwDetection) {
          setLastNSFWDetection(nsfwDetection);
        }
      }

      // Pack 33-15: Register challenge progress
      if (otherUserId) {
        // Register MESSAGE_SENT event
        await registerChallengeProgress(otherUserId, user.uid, 'MESSAGE_SENT');
        
        // Register FIRST_MESSAGE event if this is first message in chat
        if (messages.length === 0) {
          await registerChallengeProgress(otherUserId, user.uid, 'FIRST_MESSAGE');
        }
      }

      // Process transaction if this is a paid message (existing logic)
      if (costInfo.shouldCharge) {
        try {
          // Create a temporary message ID (this would be the actual message ID in production)
          const tempMessageId = `msg_${Date.now()}`;
          await processMessageTransaction(
            user.uid,
            otherUserId,
            chatId,
            tempMessageId,
            costInfo.cost
          );
        } catch (txError) {
          console.error('Error processing transaction:', txError);
          // Message was sent but transaction failed - log for admin review
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setInputText(messageText); // Restore text on error
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleVoiceCall = () => {
    if (!otherUserId) {
      Alert.alert('Błąd', 'Nie można rozpocząć połączenia');
      return;
    }
    setSelectedCallType('VOICE');
    setShowCallModal(true);
  };

  const handleVideoCall = () => {
    if (!otherUserId) {
      Alert.alert('Błąd', 'Nie można rozpocząć połączenia');
      return;
    }
    setSelectedCallType('VIDEO');
    setShowCallModal(true);
  };

  const handleBoostChat = () => {
    setShowBoostConfirmModal(true);
  };

  const handleConfirmBoost = async () => {
    if (!user?.uid || !otherUserId || !chatId) return;

    setShowBoostConfirmModal(false);

    // Check balance again
    if (tokenBalance < BOOST_CONFIG.chatRetarget.ping.tokens) {
      showToast('Za mało tokenów — doładuj portfel', 'error');
      setTimeout(() => setShowPurchaseModal(true), 500);
      return;
    }

    try {
      await createChatRetargetBoost(user.uid, chatId);
      showToast('Wysłano subtelne przypomnienie ✨', 'success');
      setCanShowBoostIcon(false); // Hide boost icon after use
    } catch (error: any) {
      console.error('Error creating chat retarget boost:', error);
      showToast(error.message || 'Nie udało się wykonać boosta. Spróbuj ponownie.', 'error');
    }
  };

  // PACK 249: Handle NSFW consent
  const handleNSFWConsent = async () => {
    if (!user?.uid || !otherUserId || !chatId) return;

    try {
      // Record consent
      await recordNSFWConsent(user.uid, chatId, otherUserId);
      
      // Update safe zone status
      const isActive = await checkNSFWSafeZone(chatId);
      setNsfwSafeZoneActive(isActive);
      
      // Close modal
      setShowNSFWConsentModal(false);
      
      // Send pending message if exists
      if (pendingExplicitMessage) {
        setInputText(pendingExplicitMessage);
        setPendingExplicitMessage(null);
        // Trigger send after state updates
        setTimeout(() => {
          handleSendMessage();
        }, 100);
      }
      
      // Show confirmation
      showToast('Private space activated. Keep it consensual and safe.', 'success');
    } catch (error) {
      console.error('[NSFW Shield] Error recording consent:', error);
      Alert.alert('Error', 'Failed to activate private space. Please try again.');
    }
  };

  // PACK 249: Handle NSFW consent decline
  const handleNSFWConsentDecline = () => {
    setShowNSFWConsentModal(false);
    setPendingExplicitMessage(null);
    showToast('Message not sent. Consent required for explicit content.', 'info');
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Please sign in to view messages</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{otherUserName}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, isVIPSubscriber && styles.headerTitleVIP]}>
            {otherUserName}
          </Text>
          {isVIPSubscriber && (
            <View style={styles.vipBadge}>
              <Text style={styles.vipBadgeText}>VIP</Text>
            </View>
          )}
        </View>
        
        {/* Call Icons */}
        <View style={styles.headerActions}>
          {/* PACK 248: Stop-Scam Report Button (Silent) */}
          <TouchableOpacity
            style={styles.reportButton}
            onPress={() => setShowStopScamModal(true)}
          >
            <Text style={styles.reportButtonIcon}>🛡️</Text>
          </TouchableOpacity>
          {/* Phase 33-2: Price setter button for creators */}
          {canSetPrice && (
            <TouchableOpacity
              style={styles.priceSetterButton}
              onPress={() => setShowPriceSetter(true)}
            >
              <Text style={styles.priceSetterButtonText}>
                {t('monetizedChat.setPriceButton')}
              </Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.callIconButton}
            onPress={handleVoiceCall}
          >
            <Text style={styles.callIconText}>📞</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.callIconButton}
            onPress={handleVideoCall}
          >
            <Text style={styles.callIconText}>📹</Text>
          </TouchableOpacity>

          {/* Chat Retarget Boost Icon */}
          {canShowBoostIcon && (
            <TouchableOpacity
              style={styles.boostIconButton}
              onPress={handleBoostChat}
            >
              <Text style={styles.boostIconText}>⚡</Text>
            </TouchableOpacity>
          )}
          
          <View style={styles.tokenBadge}>
            <Text style={styles.tokenIcon}>💰</Text>
            <Text style={styles.tokenText}>{tokenBalance}</Text>
          </View>
        </View>
      </View>

      {/* PACK 248: Subtle scam warning banner */}
      {scamWarning && (
        <View style={styles.scamWarningBanner}>
          <Text style={styles.scamWarningIcon}>💡</Text>
          <Text style={styles.scamWarningText}>{scamWarning}</Text>
          <TouchableOpacity onPress={() => setScamWarning(null)}>
            <Text style={styles.scamWarningClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Phase 33-3: VIP Room Entry Card (for subscribers) */}
      {isVIPSubscriber && otherUserId && (
        <VIPRoomEntryCard
          creatorId={otherUserId}
          creatorName={otherUserName}
          isSubscriber={true}
        />
      )}

      {/* PACK 249: NSFW warning banner */}
      {nsfwWarning && (
        <View style={styles.nsfwWarningBanner}>
          <Text style={styles.nsfwWarningIcon}>⚠️</Text>
          <Text style={styles.nsfwWarningText}>{nsfwWarning}</Text>
          <TouchableOpacity onPress={() => setNsfwWarning(null)}>
            <Text style={styles.nsfwWarningClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* PACK 249: Safe Zone indicator */}
      {nsfwSafeZoneActive && (
        <View style={styles.safeZoneIndicator}>
          <Text style={styles.safeZoneIcon}>🔒</Text>
          <Text style={styles.safeZoneText}>Private Space Active</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          // Convert timestamp for ChatBubble compatibility
          const timestamp = item.timestamp as any;
          
          return (
            <View>
              {/* PACK 42: Media message bubble */}
              {item.mediaType ? (
                <MediaBubble
                  message={item}
                  isSent={item.senderId === user.uid}
                  currentUserId={user.uid}
                  onUnlock={handleMediaUnlock}
                  tokenBalance={tokenBalance}
                />
              ) : (
                <ChatBubble
                  text={item.text}
                  isSent={item.senderId === user.uid}
                  timestamp={timestamp}
                  status={item.status} // PACK 45: Pass message status
                />
              )}
              {/* Phase 33-2: Show earnings indicator for received paid messages */}
              {item.senderId !== user.uid && chatPrice > 0 && messageEarnings[item.id] && (
                <MessageEarningIndicator
                  earned={messageEarnings[item.id]}
                  visible={true}
                  messagePrice={chatPrice}
                />
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => {
          if (flatListRef.current && messages.length > 0) {
            flatListRef.current.scrollToEnd({ animated: false });
          }
        }}
      />

      {/* Pack 33-6: Creator Offer CTA Bar */}
      {showOfferCTA && (
        <View style={styles.offerCTABar}>
          <Text style={styles.offerCTAIcon}>🎁</Text>
          <Text style={styles.offerCTAText}>
            {t('creatorOffers.cta_inChat') || 'Limited-time bundle from this creator'}
          </Text>
          <TouchableOpacity
            style={styles.offerCTAButton}
            onPress={handleOfferCTAPress}
          >
            <Text style={styles.offerCTAButtonText}>
              {t('creatorOffers.cta_inChat_button') || 'View'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pack 33-7: Creator Drop CTA Bar */}
      {showDropCTA && creatorDrop && (
        <View style={styles.dropCTABar}>
          <Text style={styles.dropCTAIcon}>💎</Text>
          <View style={styles.dropCTAContent}>
            <Text style={styles.dropCTAText}>
              {t('creatorDrops.limitedSeats') || 'Limited seats available'}
            </Text>
            <Text style={styles.dropCTASubtext}>
              {creatorDrop.seats - creatorDrop.purchasedBy.length} {t('creatorDrops.seatsLeft') || 'left'} • {creatorDrop.price} 💎
            </Text>
          </View>
          <TouchableOpacity
            style={styles.dropCTAButton}
            onPress={handleDropCTAPress}
          >
            <Text style={styles.dropCTAButtonText}>
              {t('creatorDrops.buyNow') || 'Buy'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Phase 33-2: Cost indicator above input */}
      <ChatSendCostIndicator
        tokensRequired={chatPrice}
        visible={chatPrice > 0}
      />

      <View style={styles.inputContainer}>
        {/* PACK 42: Media attachment button */}
        <TouchableOpacity
          style={styles.attachButton}
          onPress={() => setShowMediaModal(true)}
        >
          <Text style={styles.attachButtonIcon}>📎</Text>
        </TouchableOpacity>
        
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSendMessage}
          disabled={!inputText.trim() || sending}
        >
          <Text style={styles.sendButtonText}>
            {sending ? '...' : 'Send'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Token Purchase Modal */}
      <TokenPurchaseModal
        visible={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        onPurchase={(packId) => {
          console.log('Purchased pack:', packId);
          // Token balance will auto-update via subscription
        }}
        reason="You need more tokens to continue chatting"
      />
      
      {/* Call Preflight Modal */}
      {user?.uid && otherUserId && (
        <CallPreflightModal
          visible={showCallModal}
          onClose={() => setShowCallModal(false)}
          callType={selectedCallType}
          otherUserId={otherUserId}
          otherUserName={otherUserName}
          currentUserId={user.uid}
        />
      )}

      {/* Boost Confirmation Modal */}
      <Modal
        visible={showBoostConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBoostConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalIcon}>🔔</Text>
            <Text style={styles.modalTitle}>Powiadom tę osobę?</Text>
            <Text style={styles.modalText}>
              Ta funkcja subtelnie przypomni o rozmowie.
            </Text>
            <Text style={styles.modalCost}>
              Koszt: {BOOST_CONFIG.chatRetarget.ping.tokens} tokenów
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowBoostConfirmModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmBoost}
              >
                <Text style={styles.modalButtonTextConfirm}>Wyślij</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Phase 32-3: Welcome Message Picker */}
      {welcomeMessages && (
        <WelcomeMessagePicker
          visible={showWelcomePicker}
          messages={welcomeMessages}
          matchedName={otherUserName}
          onSelect={handleWelcomeMessageSelect}
          onCancel={handleWelcomePickerCancel}
        />
      )}

      {/* Phase 33-2: Message Price Setter Modal */}
      {canSetPrice && user?.uid && (
        <ChatMessagePriceSetter
          visible={showPriceSetter}
          onClose={() => setShowPriceSetter(false)}
          chatId={chatId as string}
          userId={user.uid}
          onPriceSet={(price) => {
            setChatPrice(price);
            showToast(
              t('monetizedChat.priceSetSuccess', { tokens: price }),
              'success'
            );
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
          onPurchaseSuccess={handleOfferPurchaseSuccess}
        />
      )}

      {/* Pack 33-7: Creator Drop Modal */}
      {user?.uid && creatorDrop && (
        <CreatorDropModal
          visible={showDropModal}
          drop={creatorDrop}
          viewerId={user.uid}
          isVip={isVIPSubscriber}
          onClose={() => {
            setShowDropModal(false);
          }}
          onPurchaseSuccess={handleDropPurchaseSuccess}
        />
      )}
      
      {/* PACK 42: Media Attachment Modal */}
      {user?.uid && otherUserId && (
        <MediaAttachmentModal
          visible={showMediaModal}
          onClose={() => setShowMediaModal(false)}
          onConfirm={handleMediaAttachment}
          senderId={user.uid}
          receiverId={otherUserId}
        />
      )}
      
      {/* PACK 248: Stop-Scam Report Modal */}
      <Modal
        visible={showStopScamModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStopScamModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalIcon}>🛡️</Text>
            <Text style={styles.modalTitle}>Report Financial Manipulation</Text>
            <Text style={styles.modalText}>
              If this person is pressuring you for money, gifts, or trying to manipulate you financially,
              you can report them confidentially. They won't know you reported them.
            </Text>
            <Text style={styles.modalSubtext}>
              This is for financial manipulation only. Romance, flirting, and dating are allowed on Avalo.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowStopScamModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonReport]}
                onPress={async () => {
                  if (!user?.uid || !otherUserId) return;
                  
                  try {
                    await submitStopScamReport(
                      user.uid,
                      otherUserId,
                      chatId as string,
                      lastScamDetection?.messageId,
                      'Financial manipulation suspected'
                    );
                    
                    setShowStopScamModal(false);
                    showToast('Report submitted confidentially. Thank you for helping keep Avalo safe.', 'success');
                  } catch (error) {
                    console.error('Error submitting scam report:', error);
                    Alert.alert('Error', 'Failed to submit report. Please try again.');
                  }
                }}
              >
                <Text style={styles.modalButtonTextConfirm}>Report Confidentially</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PACK 249: NSFW Consent Modal */}
      <NSFWConsentModal
        visible={showNSFWConsentModal}
        onConsent={handleNSFWConsent}
        onDecline={handleNSFWConsentDecline}
        partnerName={otherUserName}
      />
    </KeyboardAvoidingView>
  );
  
  // PACK 42: Handle media attachment
  async function handleMediaAttachment(
    mediaType: MediaType,
    mediaUri: string,
    price: number
  ) {
    if (!user?.uid || !otherUserId || !chatId) return;
    
    try {
      // Create media message
      const mediaMessage = createMediaMessage(
        user.uid,
        otherUserId,
        mediaType,
        mediaUri,
        price
      );
      
      // Save to local storage
      await saveChatMessage(chatId, mediaMessage);
      
      showToast(t('ppm.sendPaidMedia'), 'success');
      
      if (__DEV__) {
        console.log('[Chat] Media message sent:', mediaMessage);
      }
    } catch (error) {
      console.error('Error sending media:', error);
      Alert.alert(t('common.error'), 'Failed to send media');
    }
  }
  
  // PACK 42: Handle media unlock
  async function handleMediaUnlock(messageId: string) {
    if (!user?.uid || !chatId) return;
    
    const message = messages.find((m) => m.id === messageId);
    if (!message || !message.unlockPriceTokens) return;
    
    try {
      await unlockMedia(chatId, messageId, user.uid, message.unlockPriceTokens);
      showToast(t('ppm.unlockSuccess'), 'success');
      
      if (__DEV__) {
        console.log('[Chat] Media unlocked:', messageId);
      }
    } catch (error) {
      console.error('Error unlocking media:', error);
      throw error;
    }
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  backButtonText: {
    fontSize: 28,
    color: '#FF6B6B',
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerTitleVIP: {
    color: '#D4AF37',
  },
  vipBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  vipBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0F0F0F',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callIconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
  },
  callIconText: {
    fontSize: 18,
  },
  tokenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  tokenIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  tokenText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  boostIconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#40E0D0',
  },
  boostIconText: {
    fontSize: 18,
  },
  priceSetterButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#D4AF37',
  },
  priceSetterButtonText: {
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    alignItems: 'center',
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  modalCost: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F5F5F5',
  },
  modalButtonConfirm: {
    backgroundColor: '#40E0D0',
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  messagesList: {
    paddingVertical: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
    gap: 8,
  },
  attachButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#f8f8f8',
  },
  attachButtonIcon: {
    fontSize: 20,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#000',
  },
  sendButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  vipChatIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    gap: 6,
  },
  vipChatIcon: {
    fontSize: 14,
  },
  vipChatText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D4AF37',
  },
  offerCTABar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1610',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    gap: 10,
  },
  offerCTAIcon: {
    fontSize: 16,
  },
  offerCTAText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  offerCTAButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  offerCTAButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  dropCTABar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#40E0D0',
    gap: 10,
  },
  dropCTAIcon: {
    fontSize: 16,
  },
  dropCTAContent: {
    flex: 1,
  },
  dropCTAText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  dropCTASubtext: {
    fontSize: 11,
    fontWeight: '500',
    color: '#40E0D0',
  },
  dropCTAButton: {
    backgroundColor: '#40E0D0',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  dropCTAButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  // PACK 248: Romance scam protection styles
  reportButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
  },
  reportButtonIcon: {
    fontSize: 18,
  },
  scamWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
    gap: 10,
  },
  scamWarningIcon: {
    fontSize: 16,
  },
  scamWarningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#856404',
    lineHeight: 18,
  },
  scamWarningClose: {
    fontSize: 18,
    color: '#856404',
    fontWeight: 'bold',
  },
  modalSubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  modalButtonReport: {
    backgroundColor: '#FF6B6B',
  },
  // PACK 249: NSFW Shield styles
  nsfwWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9800',
    gap: 10,
  },
  nsfwWarningIcon: {
    fontSize: 16,
  },
  nsfwWarningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#E65100',
    lineHeight: 18,
  },
  nsfwWarningClose: {
    fontSize: 18,
    color: '#E65100',
    fontWeight: 'bold',
  },
  safeZoneIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    gap: 6,
  },
  safeZoneIcon: {
    fontSize: 12,
  },
  safeZoneText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4CAF50',
  },
});