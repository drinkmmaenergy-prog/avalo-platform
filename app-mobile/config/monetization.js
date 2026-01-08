"use strict";
/**
 * Monetization Configuration
 * Single source of truth for all monetization-related values in the Avalo app.
 *
 * @description This file contains all token costs, fees, and pricing tiers.
 * Edit these values to update monetization globally across the app.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREATOR_CONFIG = exports.AVALO_PLATFORM_FEE = exports.ROYAL_BENEFITS = exports.VIP_BENEFITS = exports.VIP_TIERS = exports.ROYAL_MONTHLY_PRICE = exports.VIP_MONTHLY_PRICE = exports.ADS_AND_SPONSORSHIP_CONFIG = exports.AI_AVATAR_CONFIG = exports.CREATOR_CUSTOM_REQUESTS = exports.CREATOR_PPV = exports.CREATOR_SUBSCRIPTIONS = exports.AVAILABLE_GIFTS = exports.LIVE_ROOM_CONFIG = exports.LIVESTREAM_CONFIG = exports.CALL_CONFIG = exports.CALENDAR_CONFIG = exports.PAID_CONTENT_CONFIG = exports.TIPS_CONFIG = exports.CHAT_ROOM_CONFIG = exports.CONTENT_CONFIG = exports.REWIND_CONFIG = exports.DISCOVERY_CONFIG = exports.AI_CHAT_CONFIG = exports.EARN_TO_CHAT_CONFIG = exports.MESSAGING_CONFIG = exports.TOKEN_PACKS = void 0;
exports.calculateAvaloFee = calculateAvaloFee;
exports.calculateCreatorAmount = calculateCreatorAmount;
exports.getTotalTokensForPack = getTotalTokensForPack;
exports.calculateMessageCostInfo = calculateMessageCostInfo;
exports.getAIMessageCost = getAIMessageCost;
exports.calculateEscrowDeduction = calculateEscrowDeduction;
exports.calculateInitialEscrowDeposit = calculateInitialEscrowDeposit;
exports.splitEscrowTokens = splitEscrowTokens;
exports.TOKEN_PACKS = [
    {
        packId: 'starter',
        tokens: 50,
        price: 4.99,
        displayName: '50 Tokens',
        bonus: 0,
    },
    {
        packId: 'popular',
        tokens: 200,
        price: 14.99,
        displayName: '200 Tokens',
        popular: true,
        bonus: 20, // 220 total
    },
    {
        packId: 'value',
        tokens: 500,
        price: 29.99,
        displayName: '500 Tokens',
        bonus: 50, // 550 total
    },
    {
        packId: 'premium',
        tokens: 1000,
        price: 49.99,
        displayName: '1000 Tokens',
        bonus: 150, // 1150 total
    },
];
// ============================================================================
// MESSAGING COSTS
// ============================================================================
exports.MESSAGING_CONFIG = {
    /** Number of free messages per conversation */
    FREE_MESSAGES_COUNT: 3,
    /** Cost per message after free messages (in tokens) */
    MESSAGE_COST: 10,
    /** Avalo platform fee on message payments (as decimal, e.g., 0.30 = 30%) */
    MESSAGE_FEE_PERCENTAGE: 0.30,
};
// ============================================================================
// EARN-TO-CHAT (Human-to-Human Paid Messaging)
// ============================================================================
exports.EARN_TO_CHAT_CONFIG = {
    /** Initial deposit required to start paid conversation (tokens) */
    INITIAL_DEPOSIT: 100,
    /** Instant fee charged when first message is sent (tokens) */
    INSTANT_FEE: 35,
    /** Average words per token for escrow billing */
    WORDS_PER_TOKEN: 11,
    /** Creator earnings percentage from escrow (as decimal) */
    CREATOR_SPLIT: 0.80, // 80% to creator
    /** Avalo cut from escrow (as decimal) */
    AVALO_CUT: 0.20, // 20% to Avalo
    /** Minimum escrow balance before requiring new deposit (tokens) */
    MIN_ESCROW_BALANCE: 10,
};
// ============================================================================
// AI CHAT (Companions)
// ============================================================================
exports.AI_CHAT_CONFIG = {
    /** Cost per basic AI message (tokens) */
    BASIC_MESSAGE_COST: 1,
    /** Cost per premium AI message (tokens) */
    PREMIUM_MESSAGE_COST: 2,
    /** Cost per NSFW AI message (tokens) */
    NSFW_MESSAGE_COST: 4,
    /** Avalo keeps 100% of AI earnings */
    AVALO_REVENUE_SHARE: 1.0,
};
// ============================================================================
// DISCOVERY & MATCHING FEATURES
// ============================================================================
exports.DISCOVERY_CONFIG = {
    /** Cost to send a SuperLike (in tokens) */
    SUPERLIKE_COST: 50,
    /** Cost for 30-minute profile boost (in tokens) */
    BOOST_COST: 100,
    /** Duration of boost in minutes */
    BOOST_DURATION_MINUTES: 30,
    /** Boost multiplier for discovery ranking (10x priority) */
    BOOST_MULTIPLIER: 10,
};
exports.REWIND_CONFIG = {
    /** Cost to rewind last swipe (in tokens) */
    COST: 10,
    /** Maximum time after swipe to allow rewind (in minutes) */
    MAX_REWIND_TIME_MINUTES: 5,
};
// ============================================================================
// FEED & CONTENT
// ============================================================================
exports.CONTENT_CONFIG = {
    /** Cost to unlock a single photo in feed (in tokens) */
    FEED_PHOTO_UNLOCK_COST: 20,
    /** Cost to unlock a video in feed (in tokens) */
    FEED_VIDEO_UNLOCK_COST: 50,
    /** Cost to send an icebreaker message (in tokens) */
    ICEBREAKER_COST: 15,
    /** Creator earning percentage from content unlocks (as decimal) */
    CONTENT_CREATOR_SPLIT: 0.70, // 70% to creator, 30% to Avalo
};
// ============================================================================
// CHAT ROOMS
// ============================================================================
exports.CHAT_ROOM_CONFIG = {
    /** Cost to enter a premium chat room (in tokens) */
    ENTRY_COST: 50,
    /** Host earning percentage from entry fees (as decimal) */
    HOST_SPLIT: 0.70, // 70% to host, 30% to Avalo
};
// ============================================================================
// TIPS & DONATIONS
// ============================================================================
exports.TIPS_CONFIG = {
    /** Minimum tip amount (in tokens) */
    MIN_TIP_AMOUNT: 5,
    /** Maximum tip amount (in tokens) */
    MAX_TIP_AMOUNT: 10000,
    /** Creator earning percentage from tips (as decimal) */
    CREATOR_SPLIT: 0.80, // 80% to creator, 20% to Avalo
    /** Avalo platform fee on tips (as decimal) */
    TIP_FEE_PERCENTAGE: 0.20,
};
// ============================================================================
// PAID CONTENT (Photos/Videos)
// ============================================================================
exports.PAID_CONTENT_CONFIG = {
    /** Minimum price for paid photo (in tokens) */
    MIN_PHOTO_PRICE: 20,
    /** Maximum price for paid photo (in tokens) */
    MAX_PHOTO_PRICE: 500,
    /** Minimum price for paid video (in tokens) */
    MIN_VIDEO_PRICE: 50,
    /** Maximum price for paid video (in tokens) */
    MAX_VIDEO_PRICE: 1000,
    /** Creator earning percentage from paid content (as decimal) */
    CREATOR_SPLIT: 0.70, // 70% to creator, 30% to Avalo
    /** Avalo platform fee on paid content (as decimal) */
    CONTENT_FEE_PERCENTAGE: 0.30,
};
// ============================================================================
// CALENDAR & MEETUPS
// ============================================================================
exports.CALENDAR_CONFIG = {
    /** Minimum booking price (in tokens) */
    MIN_BOOKING_PRICE: 100,
    /** Maximum booking price (in tokens) */
    MAX_BOOKING_PRICE: 100000,
    /** Cancellation fee if cancelled within 24h (in tokens) */
    CANCELLATION_FEE: 50,
    /** Host earning percentage from bookings (as decimal) */
    HOST_SPLIT: 0.80, // 80% to host, 20% to Avalo
    /** Avalo platform fee on bookings (as decimal) - applied instantly, non-refundable */
    AVALO_FEE_PERCENT: 20,
    BOOKING_FEE_PERCENTAGE: 0.20,
    /** Earner escrow percentage */
    EARNER_ESCROW_PERCENT: 80,
    /** Booking requires VIP or Royal subscription */
    BOOKING_REQUIRES_VIP_OR_ROYAL: true,
    /** Refund percentage if host cancels (as decimal) */
    HOST_CANCELLATION_REFUND: 1.00, // 100% refund (Avalo keeps its 20%)
    /** Refund percentage if guest cancels >24h before (as decimal) */
    GUEST_CANCELLATION_REFUND: 0.50, // 50% refund
};
// ============================================================================
// VOICE & VIDEO CALLS
// ============================================================================
exports.CALL_CONFIG = {
    VOICE: {
        /** Tokens per minute for VIP members */
        BASE_COST_VIP: 10,
        /** Tokens per minute for Royal members */
        BASE_COST_ROYAL: 6,
        /** Tokens per minute for standard (non-VIP/Royal) users */
        BASE_COST_STANDARD: 10,
        /** Avalo platform fee percentage */
        AVALO_CUT_PERCENT: 20,
        /** Earner revenue percentage */
        EARNER_CUT_PERCENT: 80,
    },
    VIDEO: {
        /** Tokens per minute for VIP members */
        BASE_COST_VIP: 15,
        /** Tokens per minute for Royal members */
        BASE_COST_ROYAL: 10,
        /** Tokens per minute for standard (non-VIP/Royal) users */
        BASE_COST_STANDARD: 15,
        /** Avalo platform fee percentage */
        AVALO_CUT_PERCENT: 20,
        /** Earner revenue percentage */
        EARNER_CUT_PERCENT: 80,
    },
    /** Auto-disconnect call if no activity for this many minutes */
    AUTO_DISCONNECT_IDLE_MINUTES: 6,
};
// ============================================================================
// LIVESTREAM
// ============================================================================
exports.LIVESTREAM_CONFIG = {
    /** Entry fee for paid livestreams (in tokens) */
    ENTRY_FEE: 50,
    /** Minimum tip during livestream (in tokens) */
    MIN_LIVESTREAM_TIP: 10,
    /** Maximum tip during livestream (in tokens) */
    MAX_LIVESTREAM_TIP: 5000,
    /** Streamer earning percentage from entry fees (as decimal) */
    STREAMER_ENTRY_SPLIT: 0.70, // 70% to streamer, 30% to Avalo
    /** Streamer earning percentage from tips (as decimal) */
    STREAMER_TIP_SPLIT: 0.85, // 85% to streamer, 15% to Avalo
    /** Avalo platform fee on livestream entry (as decimal) */
    ENTRY_FEE_PERCENTAGE: 0.30,
    /** Avalo platform fee on livestream tips (as decimal) */
    TIP_FEE_PERCENTAGE: 0.15,
};
exports.LIVE_ROOM_CONFIG = {
    /** Minimum gift amount (in tokens) */
    MIN_GIFT_AMOUNT: 5,
    /** Maximum gift amount (in tokens) */
    MAX_GIFT_AMOUNT: 1000,
    /** Creator earning percentage from gifts (as decimal) */
    CREATOR_SPLIT: 0.80, // 80% to creator, 20% to Avalo
    /** Avalo platform fee on gifts (as decimal) */
    GIFT_FEE_PERCENTAGE: 0.20,
    /** Room sponsorship revenue (100% Avalo for now) */
    SPONSORSHIP_REVENUE_SHARE: 1.0,
};
exports.AVAILABLE_GIFTS = [
    { id: 'rose', name: 'Rose', tokenCost: 5, iconKey: '🌹', displayName: 'Rose (5 tokens)' },
    { id: 'heart', name: 'Heart', tokenCost: 10, iconKey: '❤️', displayName: 'Heart (10 tokens)' },
    { id: 'star', name: 'Star', tokenCost: 25, iconKey: '⭐', displayName: 'Star (25 tokens)' },
    { id: 'diamond', name: 'Diamond', tokenCost: 50, iconKey: '💎', displayName: 'Diamond (50 tokens)' },
    { id: 'crown', name: 'Crown', tokenCost: 100, iconKey: '👑', displayName: 'Crown (100 tokens)' },
    { id: 'fire', name: 'Fire', tokenCost: 250, iconKey: '🔥', displayName: 'Fire (250 tokens)' },
    { id: 'rocket', name: 'Rocket', tokenCost: 500, iconKey: '🚀', displayName: 'Rocket (500 tokens)' },
    { id: 'trophy', name: 'Trophy', tokenCost: 1000, iconKey: '🏆', displayName: 'Trophy (1000 tokens)' },
];
// ============================================================================
// CREATOR STORE (Phase 4 - Web-first)
// ============================================================================
exports.CREATOR_SUBSCRIPTIONS = {
    /** Minimum subscription price (USD) */
    MIN_PRICE_USD: 5,
    /** Maximum subscription price (USD) */
    MAX_PRICE_USD: 100,
    /** Creator earning percentage (as decimal) */
    CREATOR_SPLIT: 0.70, // 70% to creator, 30% to Avalo
    /** Avalo platform fee (as decimal) */
    AVALO_FEE_PERCENTAGE: 0.30,
    /** Payment processor (web only) */
    PAYMENT_METHOD: 'stripe', // Web-based Stripe
};
exports.CREATOR_PPV = {
    /** Minimum pay-per-view price (USD) */
    MIN_PRICE_USD: 5,
    /** Maximum pay-per-view price (USD) */
    MAX_PRICE_USD: 200,
    /** Creator earning percentage (as decimal) */
    CREATOR_SPLIT: 0.70, // 70% to creator, 30% to Avalo
    /** Avalo platform fee (as decimal) */
    AVALO_FEE_PERCENTAGE: 0.30,
    /** Payment processor (web only) */
    PAYMENT_METHOD: 'stripe',
};
exports.CREATOR_CUSTOM_REQUESTS = {
    /** Minimum custom request price (USD) */
    MIN_PRICE_USD: 50,
    /** Maximum custom request price (USD) */
    MAX_PRICE_USD: 500,
    /** Creator earning percentage (as decimal) */
    CREATOR_SPLIT: 0.70, // 70% to creator, 30% to Avalo
    /** Avalo platform fee (as decimal) */
    AVALO_FEE_PERCENTAGE: 0.30,
    /** Payment processor (web only) */
    PAYMENT_METHOD: 'stripe',
};
// ============================================================================
// AI AVATAR STUDIO (Phase 4 - SFW only)
// ============================================================================
exports.AI_AVATAR_CONFIG = {
    /** Cost to generate one AI avatar (in tokens) */
    AVATAR_GENERATION_COST: 50,
    /** Avalo revenue share (100% for AI services) */
    AVALO_REVENUE_SHARE: 1.0,
    /** NSFW generation (WEB_ONLY - not implemented in mobile) */
    NSFW_IMAGE_COST: 20, // WEB_ONLY
    /** Available avatar styles */
    AVAILABLE_STYLES: ['casual', 'elegant', 'sporty', 'fantasy'],
    /** Available genders */
    AVAILABLE_GENDERS: ['male', 'female', 'androgynous'],
};
// ============================================================================
// ADS & SPONSORSHIP (Phase 4)
// ============================================================================
exports.ADS_AND_SPONSORSHIP_CONFIG = {
    /** Sponsored profile CPM estimate (for analytics) */
    SPONSORED_PROFILE_CPM_ESTIMATE: 25.0, // $25 CPM
    /** Native feed ads baseline CPM */
    NATIVE_FEED_ADS_BASELINE_CPM: 15.0, // $15 CPM
    /** Task-based ad rewards (tokens per ad watched) */
    TASK_REWARD_TOKENS: 5,
    /** Rewarded video ad tokens */
    REWARDED_AD_TOKENS: 10,
    /** All ad revenue goes to Avalo */
    AVALO_REVENUE_SHARE: 1.0,
    /** Sponsored profiles visibility multiplier */
    SPONSORED_VISIBILITY_MULTIPLIER: 3,
};
/** VIP Monthly pricing (placeholder - actual pricing via Stripe web) */
exports.VIP_MONTHLY_PRICE = 19.99; // USD
/** Royal Monthly pricing (placeholder - actual pricing via Stripe web) */
exports.ROYAL_MONTHLY_PRICE = 49.99; // USD
exports.VIP_TIERS = [
    {
        tierId: 'vip_monthly',
        name: 'VIP Monthly',
        duration: 'monthly',
        price: 19.99,
        displayPrice: '$19.99/month',
        features: [
            'Unlimited likes',
            '5 SuperLikes per day',
            '5 Rewinds per day',
            'See who liked you',
            '50% discount on Video/Voice calls',
            'Priority in discovery',
            'VIP badge displayed',
        ],
    },
    {
        tierId: 'vip_quarterly',
        name: 'VIP Quarterly',
        duration: 'quarterly',
        price: 49.99, // ~$16.66/month
        displayPrice: '$49.99/3 months',
        popular: true,
        discount: 17, // 17% discount
        features: [
            'All Monthly features',
            '10 SuperLikes per day',
            'Boost once per week',
            'Advanced filters',
            'No ads',
        ],
    },
    {
        tierId: 'vip_yearly',
        name: 'VIP Yearly',
        duration: 'yearly',
        price: 149.99, // ~$12.50/month
        displayPrice: '$149.99/year',
        discount: 38, // 38% discount
        features: [
            'All Quarterly features',
            'Unlimited SuperLikes',
            'Unlimited boosts',
            'Exclusive VIP badge',
            'Early access to new features',
            'Free monthly token bonus',
        ],
    },
];
// ============================================================================
// MEMBERSHIP BENEFITS
// ============================================================================
exports.VIP_BENEFITS = {
    /** Free SuperLikes per day */
    SUPERLIKES_PER_DAY: 1,
    /** Free Rewinds per day */
    REWINDS_PER_DAY: 5,
    /** Discount on video/voice calls */
    VIDEO_VOICE_DISCOUNT: 0.50, // 50% discount
    /** Priority multiplier in discovery */
    DISCOVERY_PRIORITY_MULTIPLIER: 2,
    /** Can see who liked them */
    CAN_SEE_LIKES: true,
};
exports.ROYAL_BENEFITS = {
    /** Unlimited SuperLikes */
    SUPERLIKES_UNLIMITED: true,
    /** Unlimited Rewinds */
    REWINDS_UNLIMITED: true,
    /** All VIP benefits */
    INCLUDES_VIP: true,
    /** Earn-to-Chat bonus (words per token) */
    EARN_TO_CHAT_WORDS_PER_TOKEN: 15, // 43% bonus (11 * 1.43 ≈ 15)
    /** Priority multiplier in discovery (additional to VIP) */
    DISCOVERY_PRIORITY_MULTIPLIER: 5, // +5x on top of VIP
    /** Discount on video/voice calls */
    VIDEO_VOICE_DISCOUNT: 0.50, // 50% discount
};
// ============================================================================
// GLOBAL PLATFORM FEE
// ============================================================================
/**
 * Default Avalo platform fee applied to most transactions
 * Individual features may override this with specific fees
 */
exports.AVALO_PLATFORM_FEE = 0.30; // 30%
// ============================================================================
// CREATOR ECONOMY
// ============================================================================
exports.CREATOR_CONFIG = {
    /** Default creator earning percentage (as decimal) */
    DEFAULT_CREATOR_SPLIT: 0.70, // 70% to creator, 30% to Avalo
    /** Minimum tokens required to become a creator */
    MIN_TOKENS_TO_WITHDRAW: 100,
    /** Verification required for creator features */
    REQUIRES_VERIFICATION: true,
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Calculate Avalo fee amount from total
 */
function calculateAvaloFee(totalAmount, feePercentage = exports.AVALO_PLATFORM_FEE) {
    return Math.floor(totalAmount * feePercentage);
}
/**
 * Calculate creator/receiver amount after Avalo fee
 */
function calculateCreatorAmount(totalAmount, creatorSplit) {
    return Math.floor(totalAmount * creatorSplit);
}
/**
 * Get total tokens including bonus for a pack
 */
function getTotalTokensForPack(pack) {
    return pack.tokens + (pack.bonus || 0);
}
/**
 * Calculate cost after free messages
 */
function calculateMessageCostInfo(messageNumber) {
    if (messageNumber <= exports.MESSAGING_CONFIG.FREE_MESSAGES_COUNT) {
        return {
            shouldCharge: false,
            cost: 0,
            isFreeMessage: true,
        };
    }
    return {
        shouldCharge: true,
        cost: exports.MESSAGING_CONFIG.MESSAGE_COST,
        isFreeMessage: false,
    };
}
/**
 * Calculate AI message cost based on tier
 */
function getAIMessageCost(tier) {
    switch (tier) {
        case 'basic':
            return exports.AI_CHAT_CONFIG.BASIC_MESSAGE_COST;
        case 'premium':
            return exports.AI_CHAT_CONFIG.PREMIUM_MESSAGE_COST;
        case 'nsfw':
            return exports.AI_CHAT_CONFIG.NSFW_MESSAGE_COST;
        default:
            return exports.AI_CHAT_CONFIG.BASIC_MESSAGE_COST;
    }
}
/**
 * Calculate escrow deduction based on word count
 * Uses Math.round for fair billing: ~11 words = 1 token
 * Examples: 5 words = 0 tokens, 11 words = 1 token, 16 words = 1 token, 22 words = 2 tokens
 */
function calculateEscrowDeduction(wordCount) {
    // Round to nearest token for fairness (prevents overcharging on short messages)
    return Math.round(wordCount / exports.EARN_TO_CHAT_CONFIG.WORDS_PER_TOKEN);
}
/**
 * Calculate tokens needed after instant fee
 */
function calculateInitialEscrowDeposit() {
    return {
        totalRequired: exports.EARN_TO_CHAT_CONFIG.INITIAL_DEPOSIT,
        instantFee: exports.EARN_TO_CHAT_CONFIG.INSTANT_FEE,
        escrowAmount: exports.EARN_TO_CHAT_CONFIG.INITIAL_DEPOSIT - exports.EARN_TO_CHAT_CONFIG.INSTANT_FEE,
    };
}
/**
 * Split escrow tokens between creator and Avalo
 */
function splitEscrowTokens(totalTokens) {
    const creatorAmount = Math.floor(totalTokens * exports.EARN_TO_CHAT_CONFIG.CREATOR_SPLIT);
    const avaloAmount = totalTokens - creatorAmount;
    return {
        creatorAmount,
        avaloAmount,
    };
}
// ============================================================================
// EXPORT ALL CONFIGS
// ============================================================================
exports.default = {
    TOKEN_PACKS: exports.TOKEN_PACKS,
    MESSAGING_CONFIG: exports.MESSAGING_CONFIG,
    EARN_TO_CHAT_CONFIG: exports.EARN_TO_CHAT_CONFIG,
    AI_CHAT_CONFIG: exports.AI_CHAT_CONFIG,
    DISCOVERY_CONFIG: exports.DISCOVERY_CONFIG,
    REWIND_CONFIG: exports.REWIND_CONFIG,
    CONTENT_CONFIG: exports.CONTENT_CONFIG,
    CHAT_ROOM_CONFIG: exports.CHAT_ROOM_CONFIG,
    TIPS_CONFIG: exports.TIPS_CONFIG,
    PAID_CONTENT_CONFIG: exports.PAID_CONTENT_CONFIG,
    CALENDAR_CONFIG: exports.CALENDAR_CONFIG,
    CALL_CONFIG: exports.CALL_CONFIG,
    LIVESTREAM_CONFIG: exports.LIVESTREAM_CONFIG,
    VIP_TIERS: exports.VIP_TIERS,
    VIP_BENEFITS: exports.VIP_BENEFITS,
    ROYAL_BENEFITS: exports.ROYAL_BENEFITS,
    VIP_MONTHLY_PRICE: exports.VIP_MONTHLY_PRICE,
    ROYAL_MONTHLY_PRICE: exports.ROYAL_MONTHLY_PRICE,
    AVALO_PLATFORM_FEE: exports.AVALO_PLATFORM_FEE,
    CREATOR_CONFIG: exports.CREATOR_CONFIG,
    // Phase 4 configs
    LIVE_ROOM_CONFIG: exports.LIVE_ROOM_CONFIG,
    AVAILABLE_GIFTS: exports.AVAILABLE_GIFTS,
    CREATOR_SUBSCRIPTIONS: exports.CREATOR_SUBSCRIPTIONS,
    CREATOR_PPV: exports.CREATOR_PPV,
    CREATOR_CUSTOM_REQUESTS: exports.CREATOR_CUSTOM_REQUESTS,
    AI_AVATAR_CONFIG: exports.AI_AVATAR_CONFIG,
    ADS_AND_SPONSORSHIP_CONFIG: exports.ADS_AND_SPONSORSHIP_CONFIG,
    // Helper functions
    calculateAvaloFee,
    calculateCreatorAmount,
    getTotalTokensForPack,
    calculateMessageCostInfo,
    getAIMessageCost,
    calculateEscrowDeduction,
    calculateInitialEscrowDeposit,
    splitEscrowTokens,
};
