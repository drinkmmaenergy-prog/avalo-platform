/**
 * PACK 435 — Global Events Engine: Creator & Fan Event Logic
 * 
 * Creator ticket tiers, tipping, merchandise, subscription cross-sell
 * Depends on: PACK 435 Event Types, PACK 277 Wallet, Creator Monetization features
 */

import * as admin from 'firebase-admin';
import { EventConfig, TicketTier } from './pack435-event-types';

// ============================================================================
// CREATOR EVENT INTERFACES
// ============================================================================

export interface CreatorEvent extends EventConfig {
  creatorId: string;
  creatorName: string;
  creatorVerified: boolean;
  
  // Event branding
  eventTheme: string;
  coverImage?: string;
  trailerVideo?: string;
  
  // Monetization features
  enableTipping: boolean;
  enableMerchSales: boolean;
  enableSubscriptionUpsell: boolean;
  
  // Creator content
  exclusiveContent?: string[]; // content IDs
  behindTheScenes?: string[]; // media URLs
  
  // Fan engagement
  meetAndGreetSlots?: MeetAndGreetSlot[];
  photoOpportunities: boolean;
  qaSessions: boolean;
  
  // Booth info (for offline events)
  highlightedBoothLocation?: string;
  boothNumber?: string;
  
  // Stats
  totalRevenue: number;
  creatorEarnings: number;
  fanAttendance: number;
  subscriptionConversions: number;
}

export interface MeetAndGreetSlot {
  slotId: string;
  startTime: admin.firestore.Timestamp;
  endTime: admin.firestore.Timestamp;
  duration: number; // minutes
  maxFans: number;
  bookedFans: string[]; // userIds
  isAvailable: boolean;
  ticketTierRequired: TicketTier;
}

export interface CreatorMerch {
  merchId: string;
  creatorId: string;
  eventId: string;
  
  // Product info
  type: 'digital' | 'physical';
  name: string;
  description: string;
  price: number;
  currency: string;
  
  // Digital merch
  digitalContent?: {
    type: 'photo' | 'video' | 'audio' | 'exclusive_content';
    url: string;
    downloadable: boolean;
  };
  
  // Physical merch (for in-person events)
  physicalProduct?: {
    category: string; // t-shirt, poster, signed_item, etc.
    sizes?: string[];
    limitedEdition: boolean;
    stockCount: number;
  };
  
  // Sales
  soldCount: number;
  revenue: number;
  
  // Availability
  availableAt: 'event_only' | 'online' | 'both';
  isActive: boolean;
}

export interface TippingTransaction {
  tipId: string;
  eventId: string;
  creatorId: string;
  fromUserId: string;
  
  amount: number;
  currency: string;
  
  // Context
  tippedDuring: 'event' | 'meet_and_greet' | 'performance' | 'qa_session';
  message?: string;
  isAnonymous: boolean;
  
  // Payment
  paymentMethod: 'wallet' | 'card' | 'tokens';
  transactionId: string;
  status: 'completed' | 'pending' | 'failed';
  
  // Metadata
  createdAt: admin.firestore.Timestamp;
}

export interface SubscriptionUpsell {
  upsellId: string;
  eventId: string;
  creatorId: string;
  userId: string;
  
  // Offer details
  subscriptionTier: string;
  discountPercent: number;
  offerPrice: number;
  regularPrice: number;
  
  // Validity
  offeredAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
  
  // Status
  status: 'offered' | 'accepted' | 'declined' | 'expired';
  convertedAt?: admin.firestore.Timestamp;
  
  // Attribution
  conversionSource: 'event_attendance';
}

// ============================================================================
// CREATOR EVENT CREATION
// ============================================================================

export async function createCreatorEvent(
  creatorId: string,
  eventData: Partial<CreatorEvent>
): Promise<string> {
  const db = admin.firestore();
  
  // Validate creator
  const creatorDoc = await db.collection('users').doc(creatorId).get();
  if (!creatorDoc.exists) {
    throw new Error('Creator not found');
  }
  
  const creator = creatorDoc.data();
  
  // Check if creator is verified or has creator status
  if (!creator?.isCreator && !creator?.verifiedBadge) {
    throw new Error('User is not a verified creator');
  }
  
  // Create event with creator-specific fields
  const eventRef = db.collection('events').doc();
  const eventId = eventRef.id;
  
  const creatorEvent: Partial<CreatorEvent> = {
    ...eventData,
    eventId,
    organizerId: creatorId,
    creatorId,
    creatorName: creator.displayName || 'Creator',
    creatorVerified: creator.verifiedBadge || false,
    type: 'creator_fan_event' as any,
    enableTipping: eventData.enableTipping !== false, // default true
    enableMerchSales: eventData.enableMerchSales !== false, // default true
    enableSubscriptionUpsell: eventData.enableSubscriptionUpsell !== false, // default true
    totalRevenue: 0,
    creatorEarnings: 0,
    fanAttendance: 0,
    subscriptionConversions: 0,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };
  
  await eventRef.set(creatorEvent);
  
  // Create meet & greet slots if specified
  if (eventData.meetAndGreetSlots) {
    for (const slot of eventData.meetAndGreetSlots) {
      await db.collection('meetAndGreetSlots').doc(slot.slotId).set({
        ...slot,
        eventId,
        creatorId,
      });
    }
  }
  
  return eventId;
}

// ============================================================================
// TICKET TIER MANAGEMENT
// ============================================================================

export async function addCreatorTicketTiers(
  eventId: string,
  tiers: {
    tier: TicketTier;
    name: string;
    pricePerSeat: number;
    maxSeats: number;
    benefits: string[];
  }[]
): Promise<boolean> {
  const db = admin.firestore();
  
  const eventRef = db.collection('events').doc(eventId);
  const eventDoc = await eventRef.get();
  
  if (!eventDoc.exists) {
    return false;
  }
  
  const tierConfigs = tiers.map(tier => ({
    ...tier,
    soldSeats: 0,
    isAvailable: true,
  }));
  
  await eventRef.update({
    'pricing.tiers': tierConfigs,
  });
  
  return true;
}

// ============================================================================
// MEET & GREET BOOKING
// ============================================================================

export async function bookMeetAndGreet(
  userId: string,
  eventId: string,
  slotId: string
): Promise<{ success: boolean; error?: string }> {
  const db = admin.firestore();
  
  try {
    // Get slot
    const slotDoc = await db.collection('meetAndGreetSlots').doc(slotId).get();
    if (!slotDoc.exists) {
      return { success: false, error: 'Slot not found' };
    }
    
    const slot = slotDoc.data() as MeetAndGreetSlot;
    
    // Check availability
    if (!slot.isAvailable || slot.bookedFans.length >= slot.maxFans) {
      return { success: false, error: 'Slot is full' };
    }
    
    // Check if user has required ticket tier
    const attendeeSnapshot = await db.collection('eventAttendees')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    
    if (attendeeSnapshot.empty) {
      return { success: false, error: 'Must be registered for event' };
    }
    
    const attendee = attendeeSnapshot.docs[0].data();
    
    // VIP or Meet & Greet tier required
    const validTiers = [TicketTier.VIP, TicketTier.MEET_AND_GREET];
    if (!validTiers.includes(attendee.ticketTier)) {
      return { success: false, error: 'Upgrade to VIP or Meet & Greet tier required' };
    }
    
    // Book the slot
    await db.collection('meetAndGreetSlots').doc(slotId).update({
      bookedFans: admin.firestore.FieldValue.arrayUnion(userId),
    });
    
    // Create booking record
    await db.collection('meetAndGreetBookings').add({
      userId,
      eventId,
      slotId,
      creatorId: slot.slotId.split('-')[0],
      bookedAt: admin.firestore.Timestamp.now(),
      status: 'confirmed',
    });
    
    // Notify user
    await db.collection('notifications').add({
      userId,
      type: 'meet_and_greet_confirmed',
      title: 'Meet & Greet Confirmed',
      body: `Your meet & greet slot has been confirmed`,
      data: { eventId, slotId },
      createdAt: admin.firestore.Timestamp.now(),
      read: false,
    });
    
    return { success: true };
    
  } catch (error) {
    console.error('Meet & greet booking error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Booking failed',
    };
  }
}

// ============================================================================
// TIPPING SYSTEM
// ============================================================================

export async function tipCreatorDuringEvent(
  fromUserId: string,
  creatorId: string,
  eventId: string,
  amount: number,
  context: TippingTransaction['tippedDuring'],
  message?: string,
  isAnonymous: boolean = false
): Promise<{ success: boolean; tipId?: string; error?: string }> {
  const db = admin.firestore();
  
  try {
    // Validate user has sufficient balance
    const userDoc = await db.collection('users').doc(fromUserId).get();
    const userBalance = userDoc.data()?.wallet?.balance || 0;
    
    if (userBalance < amount) {
      return { success: false, error: 'Insufficient balance' };
    }
    
    // Deduct from user wallet
    await db.collection('users').doc(fromUserId).update({
      'wallet.balance': admin.firestore.FieldValue.increment(-amount),
    });
    
    // Add to creator wallet (90% of tip, 10% platform fee)
    const creatorAmount = Math.floor(amount * 0.9);
    const platformFee = amount - creatorAmount;
    
    await db.collection('users').doc(creatorId).update({
      'wallet.balance': admin.firestore.FieldValue.increment(creatorAmount),
      'creatorStats.totalTipsReceived': admin.firestore.FieldValue.increment(creatorAmount),
    });
    
    // Create tip transaction
    const tipRef = await db.collection('tippingTransactions').add({
      eventId,
      creatorId,
      fromUserId: isAnonymous ? 'anonymous' : fromUserId,
      amount,
      currency: 'USD',
      tippedDuring: context,
      message,
      isAnonymous,
      paymentMethod: 'wallet',
      transactionId: '',
      status: 'completed',
      createdAt: admin.firestore.Timestamp.now(),
    } as TippingTransaction);
    
    // Update event stats
    await db.collection('events').doc(eventId).update({
      totalRevenue: admin.firestore.FieldValue.increment(amount),
      creatorEarnings: admin.firestore.FieldValue.increment(creatorAmount),
    });
    
    // Notify creator (unless anonymous)
    if (!isAnonymous) {
      await db.collection('notifications').add({
        userId: creatorId,
        type: 'tip_received',
        title: 'You received a tip!',
        body: `${userDoc.data()?.displayName || 'A fan'} tipped you $${amount} during your event`,
        data: { eventId, amount, tipId: tipRef.id },
        createdAt: admin.firestore.Timestamp.now(),
        read: false,
      });
    }
    
    return { success: true, tipId: tipRef.id };
    
  } catch (error) {
    console.error('Tipping error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tipping failed',
    };
  }
}

// ============================================================================
// MERCH SALES
// ============================================================================

export async function purchaseCreatorMerch(
  userId: string,
  merchId: string
): Promise<{ success: boolean; error?: string }> {
  const db = admin.firestore();
  
  try {
    // Get merch details
    const merchDoc = await db.collection('creatorMerch').doc(merchId).get();
    if (!merchDoc.exists) {
      return { success: false, error: 'Merch not found' };
    }
    
    const merch = merchDoc.data() as CreatorMerch;
    
    // Check availability
    if (!merch.isActive) {
      return { success: false, error: 'Merch not available' };
    }
    
    // Check stock for physical items
    if (merch.type === 'physical' && merch.physicalProduct) {
      if (merch.physicalProduct.stockCount <= 0) {
        return { success: false, error: 'Out of stock' };
      }
    }
    
    // Check user balance
    const userDoc = await db.collection('users').doc(userId).get();
    const userBalance = userDoc.data()?.wallet?.balance || 0;
    
    if (userBalance < merch.price) {
      return { success: false, error: 'Insufficient balance' };
    }
    
    // Process payment
    await db.collection('users').doc(userId).update({
      'wallet.balance': admin.firestore.FieldValue.increment(-merch.price),
    });
    
    // Credit creator (85% of sale, 15% platform fee)
    const creatorAmount = Math.floor(merch.price * 0.85);
    
    await db.collection('users').doc(merch.creatorId).update({
      'wallet.balance': admin.firestore.FieldValue.increment(creatorAmount),
      'creatorStats.merchRevenue': admin.firestore.FieldValue.increment(creatorAmount),
    });
    
    // Create purchase record
    await db.collection('merchPurchases').add({
      userId,
      merchId,
      creatorId: merch.creatorId,
      eventId: merch.eventId,
      amount: merch.price,
      currency: merch.currency,
      type: merch.type,
      status: 'completed',
      purchasedAt: admin.firestore.Timestamp.now(),
    });
    
    // Update merch stats
    await db.collection('creatorMerch').doc(merchId).update({
      soldCount: admin.firestore.FieldValue.increment(1),
      revenue: admin.firestore.FieldValue.increment(merch.price),
      ...(merch.type === 'physical' && {
        'physicalProduct.stockCount': admin.firestore.FieldValue.increment(-1),
      }),
    });
    
    // If digital, grant access
    if (merch.type === 'digital' && merch.digitalContent) {
      await db.collection('userPurchasedContent').add({
        userId,
        contentType: 'creator_merch',
        contentId: merchId,
        contentUrl: merch.digitalContent.url,
        downloadable: merch.digitalContent.downloadable,
        purchasedAt: admin.firestore.Timestamp.now(),
      });
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Merch purchase error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Purchase failed',
    };
  }
}

// ============================================================================
// SUBSCRIPTION CROSS-SELL
// ============================================================================

export async function offerSubscriptionUpsell(
  eventId: string,
  userId: string,
  creatorId: string,
  discountPercent: number = 20
): Promise<string> {
  const db = admin.firestore();
  
  // Get creator's subscription info
  const creatorDoc = await db.collection('users').doc(creatorId).get();
  const subscriptionTier = creatorDoc.data()?.creatorProfile?.subscriptionTier || 'standard';
  const regularPrice = creatorDoc.data()?.creatorProfile?.subscriptionPrice || 9.99;
  
  const offerPrice = regularPrice * (1 - discountPercent / 100);
  
  // Create upsell offer
  const upsellRef = await db.collection('subscriptionUpsells').add({
    eventId,
    creatorId,
    userId,
    subscriptionTier,
    discountPercent,
    offerPrice,
    regularPrice,
    offeredAt: admin.firestore.Timestamp.now(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    status: 'offered',
    conversionSource: 'event_attendance',
  } as SubscriptionUpsell);
  
  // Notify user
  await db.collection('notifications').add({
    userId,
    type: 'subscription_offer',
    title: `Special Offer: Subscribe to ${creatorDoc.data()?.displayName}`,
    body: `Get ${discountPercent}% off - Only $${offerPrice.toFixed(2)}/month!`,
    data: { upsellId: upsellRef.id, eventId, creatorId },
    createdAt: admin.firestore.Timestamp.now(),
    read: false,
  });
  
  return upsellRef.id;
}

export async function acceptSubscriptionUpsell(
  upsellId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const db = admin.firestore();
  
  try {
    // Get upsell offer
    const upsellDoc = await db.collection('subscriptionUpsells').doc(upsellId).get();
    if (!upsellDoc.exists) {
      return { success: false, error: 'Offer not found' };
    }
    
    const upsell = upsellDoc.data() as SubscriptionUpsell;
    
    // Check if expired
    if (upsell.expiresAt.toMillis() < Date.now()) {
      await db.collection('subscriptionUpsells').doc(upsellId).update({
        status: 'expired',
      });
      return { success: false, error: 'Offer expired' };
    }
    
    // Check if already accepted/declined
    if (upsell.status !== 'offered') {
      return { success: false, error: 'Offer already processed' };
    }
    
    // Check user balance
    const userDoc = await db.collection('users').doc(userId).get();
    const userBalance = userDoc.data()?.wallet?.balance || 0;
    
    if (userBalance < upsell.offerPrice) {
      return { success: false, error: 'Insufficient balance' };
    }
    
    // Process subscription purchase at discounted price
    // (Integration with subscription system from other PACKs)
    await db.collection('users').doc(userId).update({
      'wallet.balance': admin.firestore.FieldValue.increment(-upsell.offerPrice),
    });
    
    await db.collection('creatorSubscriptions').add({
      userId,
      creatorId: upsell.creatorId,
      tier: upsell.subscriptionTier,
      price: upsell.offerPrice,
      status: 'active',
      startDate: admin.firestore.Timestamp.now(),
      nextBillingDate: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      source: 'event_upsell',
      eventId: upsell.eventId,
    });
    
    // Update upsell status
    await db.collection('subscriptionUpsells').doc(upsellId).update({
      status: 'accepted',
      convertedAt: admin.firestore.Timestamp.now(),
    });
    
    // Update event conversion stats
    await db.collection('events').doc(upsell.eventId).update({
      subscriptionConversions: admin.firestore.FieldValue.increment(1),
    });
    
    return { success: true };
    
  } catch (error) {
    console.error('Subscription upsell acceptance error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Subscription failed',
    };
  }
}

// ============================================================================
// CREATOR BOOTH MANAGEMENT
// ============================================================================

export async function setupCreatorBooth(
  eventId: string,
  boothConfig: {
    location: string;
    boothNumber: string;
    decorations?: string[];
    signage?: string[];
    merchDisplay?: string[];
  }
): Promise<boolean> {
  const db = admin.firestore();
  
  await db.collection('events').doc(eventId).update({
    highlightedBoothLocation: boothConfig.location,
    boothNumber: boothConfig.boothNumber,
  });
  
  await db.collection('eventBooths').doc(`${eventId}_booth`).set({
    eventId,
    ...boothConfig,
    setupAt: admin.firestore.Timestamp.now(),
  });
  
  return true;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createCreatorEvent,
  addCreatorTicketTiers,
  bookMeetAndGreet,
  tipCreatorDuringEvent,
  purchaseCreatorMerch,
  offerSubscriptionUpsell,
  acceptSubscriptionUpsell,
  setupCreatorBooth,
};
