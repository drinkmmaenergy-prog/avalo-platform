"use strict";
/**
 * System Configuration Constants
 * Based on AVALO_CORE_FULL_SPEC.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.containsBannedTerms = exports.BANNED_TERMS = exports.BookingStatus = exports.VerificationStatus = exports.TransactionType = exports.ChatStatus = exports.Gender = exports.TOKEN_PACKAGES = exports.getStripeConfig = exports.FUNCTIONS_REGION = exports.CALENDAR_VERIFICATION_TIMEOUT_MINUTES = exports.CALENDAR_VERIFICATION_GPS_RADIUS_METERS = exports.MAX_ACTIVE_CHATS_ROYAL = exports.MAX_ACTIVE_CHATS_DEFAULT = exports.AI_VOICE_TTS_SECONDS_PER_TOKEN = exports.AI_IMAGE_XXX_TOKENS = exports.AI_IMAGE_PG13_TOKENS = exports.AI_MESSAGES_PER_TOKEN = exports.VOICE_MESSAGE_SECONDS_PER_TOKEN = exports.CALENDAR_CANCEL_EARLY_CREATOR_PCT = exports.CALENDAR_CANCEL_EARLY_REFUND_PCT = exports.CALENDAR_CANCEL_EARLY_HOURS = exports.RATE_LIMIT_SWIPES_PER_HOUR = exports.RATE_LIMIT_MESSAGES_PER_HOUR = exports.ROYAL_QUALITY_SCORE_GRACE_DAYS = exports.ROYAL_QUALITY_SCORE_MIN = exports.ROYAL_MONTHLY_EARNINGS_MIN_TOKENS = exports.ROYAL_INSTAGRAM_FOLLOWERS_MIN = exports.CHAT_EXPIRY_MS = exports.CHAT_EXPIRY_HOURS = exports.AUTO_RELOAD_AMOUNT_TOKENS = exports.AUTO_RELOAD_THRESHOLD_TOKENS = exports.SUBSCRIPTION_CREATOR_PCT = exports.SUBSCRIPTION_PLATFORM_FEE_PCT = exports.TIP_CREATOR_PCT = exports.TIP_PLATFORM_FEE_PCT = exports.CALENDAR_ESCROW_PCT = exports.CALENDAR_PLATFORM_FEE_PCT = exports.CALENDAR_MIN_BOOKING_TOKENS = exports.CALL_BILLING_INTERVAL_SEC = exports.VIDEO_CALL_RATE = exports.VOICE_CALL_RATE_VIP_ROYAL = exports.VOICE_CALL_RATE_FREE = exports.WORDS_PER_TOKEN_ROYAL_EARNER = exports.WORDS_PER_TOKEN_STANDARD = exports.CHAT_ESCROW_PCT = exports.CHAT_PLATFORM_FEE_PCT = exports.CHAT_FREE_MESSAGES_PER_USER = exports.CHAT_INITIAL_DEPOSIT_TOKENS = exports.SETTLEMENT_RATE_PLN = void 0;
// Token Economy
exports.SETTLEMENT_RATE_PLN = 0.20; // 1 token = 0.20 PLN for all settlements
// Chat Configuration
exports.CHAT_INITIAL_DEPOSIT_TOKENS = 100;
exports.CHAT_FREE_MESSAGES_PER_USER = 3;
exports.CHAT_PLATFORM_FEE_PCT = 35; // 35% to Avalo, non-refundable
exports.CHAT_ESCROW_PCT = 65; // 65% to escrow for receiver
// Word to Token Conversion
exports.WORDS_PER_TOKEN_STANDARD = 11;
exports.WORDS_PER_TOKEN_ROYAL_EARNER = 7;
// Call Rates (tokens per minute)
exports.VOICE_CALL_RATE_FREE = 5;
exports.VOICE_CALL_RATE_VIP_ROYAL = 2;
exports.VIDEO_CALL_RATE = 10;
exports.CALL_BILLING_INTERVAL_SEC = 10; // Bill every 10 seconds
// Calendar Configuration
exports.CALENDAR_MIN_BOOKING_TOKENS = 100;
exports.CALENDAR_PLATFORM_FEE_PCT = 20; // 20% to Avalo, non-refundable
exports.CALENDAR_ESCROW_PCT = 80; // 80% to creator
// Tips and Subscriptions
exports.TIP_PLATFORM_FEE_PCT = 20;
exports.TIP_CREATOR_PCT = 80;
exports.SUBSCRIPTION_PLATFORM_FEE_PCT = 30;
exports.SUBSCRIPTION_CREATOR_PCT = 70;
// Auto-reload
exports.AUTO_RELOAD_THRESHOLD_TOKENS = 20;
exports.AUTO_RELOAD_AMOUNT_TOKENS = 100;
// Chat Expiry and Abandonment
exports.CHAT_EXPIRY_HOURS = 48;
exports.CHAT_EXPIRY_MS = exports.CHAT_EXPIRY_HOURS * 60 * 60 * 1000;
// Royal Club Eligibility
exports.ROYAL_INSTAGRAM_FOLLOWERS_MIN = 1000;
exports.ROYAL_MONTHLY_EARNINGS_MIN_TOKENS = 20000;
exports.ROYAL_QUALITY_SCORE_MIN = 70;
exports.ROYAL_QUALITY_SCORE_GRACE_DAYS = 30;
// Rate Limits
exports.RATE_LIMIT_MESSAGES_PER_HOUR = 50;
exports.RATE_LIMIT_SWIPES_PER_HOUR = 100;
// Calendar Cancellation Refund Rules
exports.CALENDAR_CANCEL_EARLY_HOURS = 24;
exports.CALENDAR_CANCEL_EARLY_REFUND_PCT = 50; // 50% to booker
exports.CALENDAR_CANCEL_EARLY_CREATOR_PCT = 30; // 30% to creator
// Platform always keeps 20% (non-refundable)
// Voice Message Pricing
exports.VOICE_MESSAGE_SECONDS_PER_TOKEN = 30;
// AI Pricing (per-use, if not subscribed)
exports.AI_MESSAGES_PER_TOKEN = 20;
exports.AI_IMAGE_PG13_TOKENS = 10;
exports.AI_IMAGE_XXX_TOKENS = 20;
exports.AI_VOICE_TTS_SECONDS_PER_TOKEN = 30;
// Max Active Chats
exports.MAX_ACTIVE_CHATS_DEFAULT = 50;
exports.MAX_ACTIVE_CHATS_ROYAL = 100;
// Verification
exports.CALENDAR_VERIFICATION_GPS_RADIUS_METERS = 30;
exports.CALENDAR_VERIFICATION_TIMEOUT_MINUTES = 30;
// Region
exports.FUNCTIONS_REGION = "europe-west3";
// Stripe Configuration (from environment)
const getStripeConfig = () => ({
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
});
exports.getStripeConfig = getStripeConfig;
// Token Packages (for Stripe product mapping)
exports.TOKEN_PACKAGES = {
    STARTER: { tokens: 100, pricePLN: 30 },
    VALUE: { tokens: 500, pricePLN: 125 },
    PRO: { tokens: 1000, pricePLN: 230 },
    ELITE: { tokens: 5000, pricePLN: 1000 },
};
// Gender and Seeking Values
var Gender;
(function (Gender) {
    Gender["MALE"] = "male";
    Gender["FEMALE"] = "female";
    Gender["NON_BINARY"] = "non-binary";
})(Gender || (exports.Gender = Gender = {}));
// Chat Status
var ChatStatus;
(function (ChatStatus) {
    ChatStatus["ACTIVE"] = "active";
    ChatStatus["EXPIRED"] = "expired";
    ChatStatus["CLOSED"] = "closed";
    ChatStatus["QUEUED"] = "queued";
})(ChatStatus || (exports.ChatStatus = ChatStatus = {}));
// Transaction Types
var TransactionType;
(function (TransactionType) {
    TransactionType["PURCHASE"] = "purchase";
    TransactionType["MESSAGE"] = "message";
    TransactionType["VOICE_CALL"] = "voice_call";
    TransactionType["VIDEO_CALL"] = "video_call";
    TransactionType["CALENDAR"] = "calendar_booking";
    TransactionType["TIP"] = "tip";
    TransactionType["SUBSCRIPTION"] = "subscription";
    TransactionType["REFUND"] = "refund";
    TransactionType["PAYOUT"] = "payout";
    TransactionType["AI_CHAT"] = "ai_chat";
    TransactionType["AI_IMAGE"] = "ai_image";
    TransactionType["AI_VOICE"] = "ai_voice";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
// Verification Status
var VerificationStatus;
(function (VerificationStatus) {
    VerificationStatus["PENDING"] = "pending";
    VerificationStatus["APPROVED"] = "approved";
    VerificationStatus["REJECTED"] = "rejected";
})(VerificationStatus || (exports.VerificationStatus = VerificationStatus = {}));
// Booking Status
var BookingStatus;
(function (BookingStatus) {
    BookingStatus["PENDING"] = "pending";
    BookingStatus["CONFIRMED"] = "confirmed";
    BookingStatus["IN_PROGRESS"] = "in_progress";
    BookingStatus["COMPLETED"] = "completed";
    BookingStatus["CANCELLED"] = "cancelled";
    BookingStatus["NO_SHOW"] = "no_show";
})(BookingStatus || (exports.BookingStatus = BookingStatus = {}));
// Banned Terms for Moderation (escorting, sex work)
exports.BANNED_TERMS = [
    "escort",
    "escorting",
    "prostitute",
    "prostitution",
    "sex work",
    "sex worker",
    "happy ending",
    "full service",
    "GFE",
    "girlfriend experience",
    "incall",
    "outcall",
    "donation",
    "roses",
    "sugar baby",
    "sugar daddy",
    "PPM",
    "pay per meet",
    "allowance",
    "arrangement",
    "mutually beneficial",
    "generous",
    "compensation",
    "financial support",
    // Polish equivalents
    "prostytucja",
    "prostytutka",
    "usługi seksualne",
    "sponsor",
    "sponsorka",
    "przelew za spotkanie",
];
// Export helper function to check for banned terms
const containsBannedTerms = (text) => {
    const lowerText = text.toLowerCase();
    return exports.BANNED_TERMS.some((term) => lowerText.includes(term.toLowerCase()));
};
exports.containsBannedTerms = containsBannedTerms;
//# sourceMappingURL=config.js.map