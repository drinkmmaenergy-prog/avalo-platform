/**
 * Monetization Configuration
 * Single source of truth for all monetization-related values in the Avalo app.
 *
 * @description This file contains all token costs, fees, and pricing tiers.
 * Edit these values to update monetization globally across the app.
 */
export interface TokenPack {
    packId: string;
    tokens: number;
    price: number;
    displayName: string;
    popular?: boolean;
    bonus?: number;
}
export declare const TOKEN_PACKS: TokenPack[];
export declare const MESSAGING_CONFIG: {
    /** Number of free messages per conversation */
    readonly FREE_MESSAGES_COUNT: 3;
    /** Cost per message after free messages (in tokens) */
    readonly MESSAGE_COST: 10;
    /** Avalo platform fee on message payments (as decimal, e.g., 0.30 = 30%) */
    readonly MESSAGE_FEE_PERCENTAGE: 0.3;
};
export declare const EARN_TO_CHAT_CONFIG: {
    /** Initial deposit required to start paid conversation (tokens) */
    readonly INITIAL_DEPOSIT: 100;
    /** Instant fee charged when first message is sent (tokens) */
    readonly INSTANT_FEE: 35;
    /** Average words per token for escrow billing */
    readonly WORDS_PER_TOKEN: 11;
    /** Creator earnings percentage from escrow (as decimal) */
    readonly CREATOR_SPLIT: 0.8;
    /** Avalo cut from escrow (as decimal) */
    readonly AVALO_CUT: 0.2;
    /** Minimum escrow balance before requiring new deposit (tokens) */
    readonly MIN_ESCROW_BALANCE: 10;
};
export declare const AI_CHAT_CONFIG: {
    /** Cost per basic AI message (tokens) */
    readonly BASIC_MESSAGE_COST: 1;
    /** Cost per premium AI message (tokens) */
    readonly PREMIUM_MESSAGE_COST: 2;
    /** Cost per NSFW AI message (tokens) */
    readonly NSFW_MESSAGE_COST: 4;
    /** Avalo keeps 100% of AI earnings */
    readonly AVALO_REVENUE_SHARE: 1;
};
export type AICompanionTier = 'basic' | 'premium' | 'nsfw';
export interface AICompanion {
    id: string;
    name: string;
    avatar: string;
    description: string;
    tier: AICompanionTier;
    personality: string;
}
export declare const DISCOVERY_CONFIG: {
    /** Cost to send a SuperLike (in tokens) */
    readonly SUPERLIKE_COST: 50;
    /** Cost for 30-minute profile boost (in tokens) */
    readonly BOOST_COST: 100;
    /** Duration of boost in minutes */
    readonly BOOST_DURATION_MINUTES: 30;
    /** Boost multiplier for discovery ranking (10x priority) */
    readonly BOOST_MULTIPLIER: 10;
};
export declare const REWIND_CONFIG: {
    /** Cost to rewind last swipe (in tokens) */
    readonly COST: 10;
    /** Maximum time after swipe to allow rewind (in minutes) */
    readonly MAX_REWIND_TIME_MINUTES: 5;
};
export declare const CONTENT_CONFIG: {
    /** Cost to unlock a single photo in feed (in tokens) */
    readonly FEED_PHOTO_UNLOCK_COST: 20;
    /** Cost to unlock a video in feed (in tokens) */
    readonly FEED_VIDEO_UNLOCK_COST: 50;
    /** Cost to send an icebreaker message (in tokens) */
    readonly ICEBREAKER_COST: 15;
    /** Creator earning percentage from content unlocks (as decimal) */
    readonly CONTENT_CREATOR_SPLIT: 0.7;
};
export declare const CHAT_ROOM_CONFIG: {
    /** Cost to enter a premium chat room (in tokens) */
    readonly ENTRY_COST: 50;
    /** Host earning percentage from entry fees (as decimal) */
    readonly HOST_SPLIT: 0.7;
};
export declare const TIPS_CONFIG: {
    /** Minimum tip amount (in tokens) */
    readonly MIN_TIP_AMOUNT: 5;
    /** Maximum tip amount (in tokens) */
    readonly MAX_TIP_AMOUNT: 10000;
    /** Creator earning percentage from tips (as decimal) */
    readonly CREATOR_SPLIT: 0.8;
    /** Avalo platform fee on tips (as decimal) */
    readonly TIP_FEE_PERCENTAGE: 0.2;
};
export declare const PAID_CONTENT_CONFIG: {
    /** Minimum price for paid photo (in tokens) */
    readonly MIN_PHOTO_PRICE: 20;
    /** Maximum price for paid photo (in tokens) */
    readonly MAX_PHOTO_PRICE: 500;
    /** Minimum price for paid video (in tokens) */
    readonly MIN_VIDEO_PRICE: 50;
    /** Maximum price for paid video (in tokens) */
    readonly MAX_VIDEO_PRICE: 1000;
    /** Creator earning percentage from paid content (as decimal) */
    readonly CREATOR_SPLIT: 0.7;
    /** Avalo platform fee on paid content (as decimal) */
    readonly CONTENT_FEE_PERCENTAGE: 0.3;
};
export declare const CALENDAR_CONFIG: {
    /** Minimum booking price (in tokens) */
    readonly MIN_BOOKING_PRICE: 100;
    /** Maximum booking price (in tokens) */
    readonly MAX_BOOKING_PRICE: 100000;
    /** Cancellation fee if cancelled within 24h (in tokens) */
    readonly CANCELLATION_FEE: 50;
    /** Host earning percentage from bookings (as decimal) */
    readonly HOST_SPLIT: 0.8;
    /** Avalo platform fee on bookings (as decimal) - applied instantly, non-refundable */
    readonly AVALO_FEE_PERCENT: 20;
    readonly BOOKING_FEE_PERCENTAGE: 0.2;
    /** Earner escrow percentage */
    readonly EARNER_ESCROW_PERCENT: 80;
    /** Booking requires VIP or Royal subscription */
    readonly BOOKING_REQUIRES_VIP_OR_ROYAL: true;
    /** Refund percentage if host cancels (as decimal) */
    readonly HOST_CANCELLATION_REFUND: 1;
    /** Refund percentage if guest cancels >24h before (as decimal) */
    readonly GUEST_CANCELLATION_REFUND: 0.5;
};
export declare const CALL_CONFIG: {
    readonly VOICE: {
        /** Tokens per minute for VIP members */
        readonly BASE_COST_VIP: 10;
        /** Tokens per minute for Royal members */
        readonly BASE_COST_ROYAL: 6;
        /** Tokens per minute for standard (non-VIP/Royal) users */
        readonly BASE_COST_STANDARD: 10;
        /** Avalo platform fee percentage */
        readonly AVALO_CUT_PERCENT: 20;
        /** Earner revenue percentage */
        readonly EARNER_CUT_PERCENT: 80;
    };
    readonly VIDEO: {
        /** Tokens per minute for VIP members */
        readonly BASE_COST_VIP: 15;
        /** Tokens per minute for Royal members */
        readonly BASE_COST_ROYAL: 10;
        /** Tokens per minute for standard (non-VIP/Royal) users */
        readonly BASE_COST_STANDARD: 15;
        /** Avalo platform fee percentage */
        readonly AVALO_CUT_PERCENT: 20;
        /** Earner revenue percentage */
        readonly EARNER_CUT_PERCENT: 80;
    };
    /** Auto-disconnect call if no activity for this many minutes */
    readonly AUTO_DISCONNECT_IDLE_MINUTES: 6;
};
export type CallType = 'VOICE' | 'VIDEO';
export type UserStatus = 'STANDARD' | 'VIP' | 'ROYAL';
export declare const LIVESTREAM_CONFIG: {
    /** Entry fee for paid livestreams (in tokens) */
    readonly ENTRY_FEE: 50;
    /** Minimum tip during livestream (in tokens) */
    readonly MIN_LIVESTREAM_TIP: 10;
    /** Maximum tip during livestream (in tokens) */
    readonly MAX_LIVESTREAM_TIP: 5000;
    /** Streamer earning percentage from entry fees (as decimal) */
    readonly STREAMER_ENTRY_SPLIT: 0.7;
    /** Streamer earning percentage from tips (as decimal) */
    readonly STREAMER_TIP_SPLIT: 0.85;
    /** Avalo platform fee on livestream entry (as decimal) */
    readonly ENTRY_FEE_PERCENTAGE: 0.3;
    /** Avalo platform fee on livestream tips (as decimal) */
    readonly TIP_FEE_PERCENTAGE: 0.15;
};
export interface Gift {
    id: string;
    name: string;
    tokenCost: number;
    iconKey: string;
    displayName: string;
}
export declare const LIVE_ROOM_CONFIG: {
    /** Minimum gift amount (in tokens) */
    readonly MIN_GIFT_AMOUNT: 5;
    /** Maximum gift amount (in tokens) */
    readonly MAX_GIFT_AMOUNT: 1000;
    /** Creator earning percentage from gifts (as decimal) */
    readonly CREATOR_SPLIT: 0.8;
    /** Avalo platform fee on gifts (as decimal) */
    readonly GIFT_FEE_PERCENTAGE: 0.2;
    /** Room sponsorship revenue (100% Avalo for now) */
    readonly SPONSORSHIP_REVENUE_SHARE: 1;
};
export declare const AVAILABLE_GIFTS: Gift[];
export declare const CREATOR_SUBSCRIPTIONS: {
    /** Minimum subscription price (USD) */
    readonly MIN_PRICE_USD: 5;
    /** Maximum subscription price (USD) */
    readonly MAX_PRICE_USD: 100;
    /** Creator earning percentage (as decimal) */
    readonly CREATOR_SPLIT: 0.7;
    /** Avalo platform fee (as decimal) */
    readonly AVALO_FEE_PERCENTAGE: 0.3;
    /** Payment processor (web only) */
    readonly PAYMENT_METHOD: "stripe";
};
export declare const CREATOR_PPV: {
    /** Minimum pay-per-view price (USD) */
    readonly MIN_PRICE_USD: 5;
    /** Maximum pay-per-view price (USD) */
    readonly MAX_PRICE_USD: 200;
    /** Creator earning percentage (as decimal) */
    readonly CREATOR_SPLIT: 0.7;
    /** Avalo platform fee (as decimal) */
    readonly AVALO_FEE_PERCENTAGE: 0.3;
    /** Payment processor (web only) */
    readonly PAYMENT_METHOD: "stripe";
};
export declare const CREATOR_CUSTOM_REQUESTS: {
    /** Minimum custom request price (USD) */
    readonly MIN_PRICE_USD: 50;
    /** Maximum custom request price (USD) */
    readonly MAX_PRICE_USD: 500;
    /** Creator earning percentage (as decimal) */
    readonly CREATOR_SPLIT: 0.7;
    /** Avalo platform fee (as decimal) */
    readonly AVALO_FEE_PERCENTAGE: 0.3;
    /** Payment processor (web only) */
    readonly PAYMENT_METHOD: "stripe";
};
export declare const AI_AVATAR_CONFIG: {
    /** Cost to generate one AI avatar (in tokens) */
    readonly AVATAR_GENERATION_COST: 50;
    /** Avalo revenue share (100% for AI services) */
    readonly AVALO_REVENUE_SHARE: 1;
    /** NSFW generation (WEB_ONLY - not implemented in mobile) */
    readonly NSFW_IMAGE_COST: 20;
    /** Available avatar styles */
    readonly AVAILABLE_STYLES: readonly ["casual", "elegant", "sporty", "fantasy"];
    /** Available genders */
    readonly AVAILABLE_GENDERS: readonly ["male", "female", "androgynous"];
};
export type AvatarStyle = typeof AI_AVATAR_CONFIG.AVAILABLE_STYLES[number];
export type AvatarGender = typeof AI_AVATAR_CONFIG.AVAILABLE_GENDERS[number];
export declare const ADS_AND_SPONSORSHIP_CONFIG: {
    /** Sponsored profile CPM estimate (for analytics) */
    readonly SPONSORED_PROFILE_CPM_ESTIMATE: 25;
    /** Native feed ads baseline CPM */
    readonly NATIVE_FEED_ADS_BASELINE_CPM: 15;
    /** Task-based ad rewards (tokens per ad watched) */
    readonly TASK_REWARD_TOKENS: 5;
    /** Rewarded video ad tokens */
    readonly REWARDED_AD_TOKENS: 10;
    /** All ad revenue goes to Avalo */
    readonly AVALO_REVENUE_SHARE: 1;
    /** Sponsored profiles visibility multiplier */
    readonly SPONSORED_VISIBILITY_MULTIPLIER: 3;
};
export type MembershipType = 'none' | 'vip' | 'royal';
/** VIP Monthly pricing (placeholder - actual pricing via Stripe web) */
export declare const VIP_MONTHLY_PRICE = 19.99;
/** Royal Monthly pricing (placeholder - actual pricing via Stripe web) */
export declare const ROYAL_MONTHLY_PRICE = 49.99;
export interface VIPTier {
    tierId: string;
    name: string;
    duration: 'monthly' | 'quarterly' | 'yearly';
    price: number;
    displayPrice: string;
    features: string[];
    popular?: boolean;
    discount?: number;
}
export declare const VIP_TIERS: VIPTier[];
export declare const VIP_BENEFITS: {
    /** Free SuperLikes per day */
    readonly SUPERLIKES_PER_DAY: 1;
    /** Free Rewinds per day */
    readonly REWINDS_PER_DAY: 5;
    /** Discount on video/voice calls */
    readonly VIDEO_VOICE_DISCOUNT: 0.5;
    /** Priority multiplier in discovery */
    readonly DISCOVERY_PRIORITY_MULTIPLIER: 2;
    /** Can see who liked them */
    readonly CAN_SEE_LIKES: true;
};
export declare const ROYAL_BENEFITS: {
    /** Unlimited SuperLikes */
    readonly SUPERLIKES_UNLIMITED: true;
    /** Unlimited Rewinds */
    readonly REWINDS_UNLIMITED: true;
    /** All VIP benefits */
    readonly INCLUDES_VIP: true;
    /** Earn-to-Chat bonus (words per token) */
    readonly EARN_TO_CHAT_WORDS_PER_TOKEN: 15;
    /** Priority multiplier in discovery (additional to VIP) */
    readonly DISCOVERY_PRIORITY_MULTIPLIER: 5;
    /** Discount on video/voice calls */
    readonly VIDEO_VOICE_DISCOUNT: 0.5;
};
/**
 * Default Avalo platform fee applied to most transactions
 * Individual features may override this with specific fees
 */
export declare const AVALO_PLATFORM_FEE = 0.3;
export declare const CREATOR_CONFIG: {
    /** Default creator earning percentage (as decimal) */
    readonly DEFAULT_CREATOR_SPLIT: 0.7;
    /** Minimum tokens required to become a creator */
    readonly MIN_TOKENS_TO_WITHDRAW: 100;
    /** Verification required for creator features */
    readonly REQUIRES_VERIFICATION: true;
};
/**
 * Calculate Avalo fee amount from total
 */
export declare function calculateAvaloFee(totalAmount: number, feePercentage?: number): number;
/**
 * Calculate creator/receiver amount after Avalo fee
 */
export declare function calculateCreatorAmount(totalAmount: number, creatorSplit: number): number;
/**
 * Get total tokens including bonus for a pack
 */
export declare function getTotalTokensForPack(pack: TokenPack): number;
/**
 * Calculate cost after free messages
 */
export declare function calculateMessageCostInfo(messageNumber: number): {
    shouldCharge: boolean;
    cost: number;
    isFreeMessage: boolean;
};
/**
 * Calculate AI message cost based on tier
 */
export declare function getAIMessageCost(tier: AICompanionTier): number;
/**
 * Calculate escrow deduction based on word count
 * Uses Math.round for fair billing: ~11 words = 1 token
 * Examples: 5 words = 0 tokens, 11 words = 1 token, 16 words = 1 token, 22 words = 2 tokens
 */
export declare function calculateEscrowDeduction(wordCount: number): number;
/**
 * Calculate tokens needed after instant fee
 */
export declare function calculateInitialEscrowDeposit(): {
    totalRequired: number;
    instantFee: number;
    escrowAmount: number;
};
/**
 * Split escrow tokens between creator and Avalo
 */
export declare function splitEscrowTokens(totalTokens: number): {
    creatorAmount: number;
    avaloAmount: number;
};
declare const _default: {
    TOKEN_PACKS: TokenPack[];
    MESSAGING_CONFIG: {
        /** Number of free messages per conversation */
        readonly FREE_MESSAGES_COUNT: 3;
        /** Cost per message after free messages (in tokens) */
        readonly MESSAGE_COST: 10;
        /** Avalo platform fee on message payments (as decimal, e.g., 0.30 = 30%) */
        readonly MESSAGE_FEE_PERCENTAGE: 0.3;
    };
    EARN_TO_CHAT_CONFIG: {
        /** Initial deposit required to start paid conversation (tokens) */
        readonly INITIAL_DEPOSIT: 100;
        /** Instant fee charged when first message is sent (tokens) */
        readonly INSTANT_FEE: 35;
        /** Average words per token for escrow billing */
        readonly WORDS_PER_TOKEN: 11;
        /** Creator earnings percentage from escrow (as decimal) */
        readonly CREATOR_SPLIT: 0.8;
        /** Avalo cut from escrow (as decimal) */
        readonly AVALO_CUT: 0.2;
        /** Minimum escrow balance before requiring new deposit (tokens) */
        readonly MIN_ESCROW_BALANCE: 10;
    };
    AI_CHAT_CONFIG: {
        /** Cost per basic AI message (tokens) */
        readonly BASIC_MESSAGE_COST: 1;
        /** Cost per premium AI message (tokens) */
        readonly PREMIUM_MESSAGE_COST: 2;
        /** Cost per NSFW AI message (tokens) */
        readonly NSFW_MESSAGE_COST: 4;
        /** Avalo keeps 100% of AI earnings */
        readonly AVALO_REVENUE_SHARE: 1;
    };
    DISCOVERY_CONFIG: {
        /** Cost to send a SuperLike (in tokens) */
        readonly SUPERLIKE_COST: 50;
        /** Cost for 30-minute profile boost (in tokens) */
        readonly BOOST_COST: 100;
        /** Duration of boost in minutes */
        readonly BOOST_DURATION_MINUTES: 30;
        /** Boost multiplier for discovery ranking (10x priority) */
        readonly BOOST_MULTIPLIER: 10;
    };
    REWIND_CONFIG: {
        /** Cost to rewind last swipe (in tokens) */
        readonly COST: 10;
        /** Maximum time after swipe to allow rewind (in minutes) */
        readonly MAX_REWIND_TIME_MINUTES: 5;
    };
    CONTENT_CONFIG: {
        /** Cost to unlock a single photo in feed (in tokens) */
        readonly FEED_PHOTO_UNLOCK_COST: 20;
        /** Cost to unlock a video in feed (in tokens) */
        readonly FEED_VIDEO_UNLOCK_COST: 50;
        /** Cost to send an icebreaker message (in tokens) */
        readonly ICEBREAKER_COST: 15;
        /** Creator earning percentage from content unlocks (as decimal) */
        readonly CONTENT_CREATOR_SPLIT: 0.7;
    };
    CHAT_ROOM_CONFIG: {
        /** Cost to enter a premium chat room (in tokens) */
        readonly ENTRY_COST: 50;
        /** Host earning percentage from entry fees (as decimal) */
        readonly HOST_SPLIT: 0.7;
    };
    TIPS_CONFIG: {
        /** Minimum tip amount (in tokens) */
        readonly MIN_TIP_AMOUNT: 5;
        /** Maximum tip amount (in tokens) */
        readonly MAX_TIP_AMOUNT: 10000;
        /** Creator earning percentage from tips (as decimal) */
        readonly CREATOR_SPLIT: 0.8;
        /** Avalo platform fee on tips (as decimal) */
        readonly TIP_FEE_PERCENTAGE: 0.2;
    };
    PAID_CONTENT_CONFIG: {
        /** Minimum price for paid photo (in tokens) */
        readonly MIN_PHOTO_PRICE: 20;
        /** Maximum price for paid photo (in tokens) */
        readonly MAX_PHOTO_PRICE: 500;
        /** Minimum price for paid video (in tokens) */
        readonly MIN_VIDEO_PRICE: 50;
        /** Maximum price for paid video (in tokens) */
        readonly MAX_VIDEO_PRICE: 1000;
        /** Creator earning percentage from paid content (as decimal) */
        readonly CREATOR_SPLIT: 0.7;
        /** Avalo platform fee on paid content (as decimal) */
        readonly CONTENT_FEE_PERCENTAGE: 0.3;
    };
    CALENDAR_CONFIG: {
        /** Minimum booking price (in tokens) */
        readonly MIN_BOOKING_PRICE: 100;
        /** Maximum booking price (in tokens) */
        readonly MAX_BOOKING_PRICE: 100000;
        /** Cancellation fee if cancelled within 24h (in tokens) */
        readonly CANCELLATION_FEE: 50;
        /** Host earning percentage from bookings (as decimal) */
        readonly HOST_SPLIT: 0.8;
        /** Avalo platform fee on bookings (as decimal) - applied instantly, non-refundable */
        readonly AVALO_FEE_PERCENT: 20;
        readonly BOOKING_FEE_PERCENTAGE: 0.2;
        /** Earner escrow percentage */
        readonly EARNER_ESCROW_PERCENT: 80;
        /** Booking requires VIP or Royal subscription */
        readonly BOOKING_REQUIRES_VIP_OR_ROYAL: true;
        /** Refund percentage if host cancels (as decimal) */
        readonly HOST_CANCELLATION_REFUND: 1;
        /** Refund percentage if guest cancels >24h before (as decimal) */
        readonly GUEST_CANCELLATION_REFUND: 0.5;
    };
    CALL_CONFIG: {
        readonly VOICE: {
            /** Tokens per minute for VIP members */
            readonly BASE_COST_VIP: 10;
            /** Tokens per minute for Royal members */
            readonly BASE_COST_ROYAL: 6;
            /** Tokens per minute for standard (non-VIP/Royal) users */
            readonly BASE_COST_STANDARD: 10;
            /** Avalo platform fee percentage */
            readonly AVALO_CUT_PERCENT: 20;
            /** Earner revenue percentage */
            readonly EARNER_CUT_PERCENT: 80;
        };
        readonly VIDEO: {
            /** Tokens per minute for VIP members */
            readonly BASE_COST_VIP: 15;
            /** Tokens per minute for Royal members */
            readonly BASE_COST_ROYAL: 10;
            /** Tokens per minute for standard (non-VIP/Royal) users */
            readonly BASE_COST_STANDARD: 15;
            /** Avalo platform fee percentage */
            readonly AVALO_CUT_PERCENT: 20;
            /** Earner revenue percentage */
            readonly EARNER_CUT_PERCENT: 80;
        };
        /** Auto-disconnect call if no activity for this many minutes */
        readonly AUTO_DISCONNECT_IDLE_MINUTES: 6;
    };
    LIVESTREAM_CONFIG: {
        /** Entry fee for paid livestreams (in tokens) */
        readonly ENTRY_FEE: 50;
        /** Minimum tip during livestream (in tokens) */
        readonly MIN_LIVESTREAM_TIP: 10;
        /** Maximum tip during livestream (in tokens) */
        readonly MAX_LIVESTREAM_TIP: 5000;
        /** Streamer earning percentage from entry fees (as decimal) */
        readonly STREAMER_ENTRY_SPLIT: 0.7;
        /** Streamer earning percentage from tips (as decimal) */
        readonly STREAMER_TIP_SPLIT: 0.85;
        /** Avalo platform fee on livestream entry (as decimal) */
        readonly ENTRY_FEE_PERCENTAGE: 0.3;
        /** Avalo platform fee on livestream tips (as decimal) */
        readonly TIP_FEE_PERCENTAGE: 0.15;
    };
    VIP_TIERS: VIPTier[];
    VIP_BENEFITS: {
        /** Free SuperLikes per day */
        readonly SUPERLIKES_PER_DAY: 1;
        /** Free Rewinds per day */
        readonly REWINDS_PER_DAY: 5;
        /** Discount on video/voice calls */
        readonly VIDEO_VOICE_DISCOUNT: 0.5;
        /** Priority multiplier in discovery */
        readonly DISCOVERY_PRIORITY_MULTIPLIER: 2;
        /** Can see who liked them */
        readonly CAN_SEE_LIKES: true;
    };
    ROYAL_BENEFITS: {
        /** Unlimited SuperLikes */
        readonly SUPERLIKES_UNLIMITED: true;
        /** Unlimited Rewinds */
        readonly REWINDS_UNLIMITED: true;
        /** All VIP benefits */
        readonly INCLUDES_VIP: true;
        /** Earn-to-Chat bonus (words per token) */
        readonly EARN_TO_CHAT_WORDS_PER_TOKEN: 15;
        /** Priority multiplier in discovery (additional to VIP) */
        readonly DISCOVERY_PRIORITY_MULTIPLIER: 5;
        /** Discount on video/voice calls */
        readonly VIDEO_VOICE_DISCOUNT: 0.5;
    };
    VIP_MONTHLY_PRICE: number;
    ROYAL_MONTHLY_PRICE: number;
    AVALO_PLATFORM_FEE: number;
    CREATOR_CONFIG: {
        /** Default creator earning percentage (as decimal) */
        readonly DEFAULT_CREATOR_SPLIT: 0.7;
        /** Minimum tokens required to become a creator */
        readonly MIN_TOKENS_TO_WITHDRAW: 100;
        /** Verification required for creator features */
        readonly REQUIRES_VERIFICATION: true;
    };
    LIVE_ROOM_CONFIG: {
        /** Minimum gift amount (in tokens) */
        readonly MIN_GIFT_AMOUNT: 5;
        /** Maximum gift amount (in tokens) */
        readonly MAX_GIFT_AMOUNT: 1000;
        /** Creator earning percentage from gifts (as decimal) */
        readonly CREATOR_SPLIT: 0.8;
        /** Avalo platform fee on gifts (as decimal) */
        readonly GIFT_FEE_PERCENTAGE: 0.2;
        /** Room sponsorship revenue (100% Avalo for now) */
        readonly SPONSORSHIP_REVENUE_SHARE: 1;
    };
    AVAILABLE_GIFTS: Gift[];
    CREATOR_SUBSCRIPTIONS: {
        /** Minimum subscription price (USD) */
        readonly MIN_PRICE_USD: 5;
        /** Maximum subscription price (USD) */
        readonly MAX_PRICE_USD: 100;
        /** Creator earning percentage (as decimal) */
        readonly CREATOR_SPLIT: 0.7;
        /** Avalo platform fee (as decimal) */
        readonly AVALO_FEE_PERCENTAGE: 0.3;
        /** Payment processor (web only) */
        readonly PAYMENT_METHOD: "stripe";
    };
    CREATOR_PPV: {
        /** Minimum pay-per-view price (USD) */
        readonly MIN_PRICE_USD: 5;
        /** Maximum pay-per-view price (USD) */
        readonly MAX_PRICE_USD: 200;
        /** Creator earning percentage (as decimal) */
        readonly CREATOR_SPLIT: 0.7;
        /** Avalo platform fee (as decimal) */
        readonly AVALO_FEE_PERCENTAGE: 0.3;
        /** Payment processor (web only) */
        readonly PAYMENT_METHOD: "stripe";
    };
    CREATOR_CUSTOM_REQUESTS: {
        /** Minimum custom request price (USD) */
        readonly MIN_PRICE_USD: 50;
        /** Maximum custom request price (USD) */
        readonly MAX_PRICE_USD: 500;
        /** Creator earning percentage (as decimal) */
        readonly CREATOR_SPLIT: 0.7;
        /** Avalo platform fee (as decimal) */
        readonly AVALO_FEE_PERCENTAGE: 0.3;
        /** Payment processor (web only) */
        readonly PAYMENT_METHOD: "stripe";
    };
    AI_AVATAR_CONFIG: {
        /** Cost to generate one AI avatar (in tokens) */
        readonly AVATAR_GENERATION_COST: 50;
        /** Avalo revenue share (100% for AI services) */
        readonly AVALO_REVENUE_SHARE: 1;
        /** NSFW generation (WEB_ONLY - not implemented in mobile) */
        readonly NSFW_IMAGE_COST: 20;
        /** Available avatar styles */
        readonly AVAILABLE_STYLES: readonly ["casual", "elegant", "sporty", "fantasy"];
        /** Available genders */
        readonly AVAILABLE_GENDERS: readonly ["male", "female", "androgynous"];
    };
    ADS_AND_SPONSORSHIP_CONFIG: {
        /** Sponsored profile CPM estimate (for analytics) */
        readonly SPONSORED_PROFILE_CPM_ESTIMATE: 25;
        /** Native feed ads baseline CPM */
        readonly NATIVE_FEED_ADS_BASELINE_CPM: 15;
        /** Task-based ad rewards (tokens per ad watched) */
        readonly TASK_REWARD_TOKENS: 5;
        /** Rewarded video ad tokens */
        readonly REWARDED_AD_TOKENS: 10;
        /** All ad revenue goes to Avalo */
        readonly AVALO_REVENUE_SHARE: 1;
        /** Sponsored profiles visibility multiplier */
        readonly SPONSORED_VISIBILITY_MULTIPLIER: 3;
    };
    calculateAvaloFee: typeof calculateAvaloFee;
    calculateCreatorAmount: typeof calculateCreatorAmount;
    getTotalTokensForPack: typeof getTotalTokensForPack;
    calculateMessageCostInfo: typeof calculateMessageCostInfo;
    getAIMessageCost: typeof getAIMessageCost;
    calculateEscrowDeduction: typeof calculateEscrowDeduction;
    calculateInitialEscrowDeposit: typeof calculateInitialEscrowDeposit;
    splitEscrowTokens: typeof splitEscrowTokens;
};
export default _default;
