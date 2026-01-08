;
/**
 * Avalo Functions - Comprehensive Zod Validation Schemas
 * Enterprise-grade input validation for all API endpoints
 * @version 3.0.0
 */

;
;

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const uuidSchema = z.string().uuid('Invalid UUID format');
export const emailSchema = z.string().email('Invalid email format');
export const urlSchema = z.string().url('Invalid URL format');
export const timestampSchema = z.string().datetime('Invalid ISO 8601 timestamp');

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  deviceId: z.string().optional(),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number'),
  displayName: z.string().min(2).max(50).trim(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  gender: z.enum(['male', 'female', 'non-binary', 'other']),
  termsAccepted: z.boolean().refine(val => val === true, 'Must accept terms'),
});

export const kycSchema = z.object({
  fullName: z.string().min(2).max(100).trim(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.string().min(5).max(200).trim(),
  city: z.string().min(2).max(100).trim(),
  country: z.string().length(2, 'Must be 2-letter country code').toUpperCase(),
  postalCode: z.string().min(3).max(20).trim(),
  idType: z.enum(['passport', 'drivers_license', 'national_id']),
  idNumber: z.string().min(5).max(50).trim(),
  idFrontImage: urlSchema,
  idBackImage: urlSchema.optional(),
  selfieImage: urlSchema,
});

// ============================================================================
// PROFILE SCHEMAS
// ============================================================================

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).trim().optional(),
  bio: z.string().max(500).trim().optional(),
  interests: z.array(z.string().max(30)).max(20).optional(),
  location: z.object({
    city: z.string().max(100),
    country: z.string().length(2),
    coordinates: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }).optional(),
  }).optional(),
});

export const profileSettingsSchema = z.object({
  visibility: z.enum(['public', 'private', 'friends']).optional(),
  showLocation: z.boolean().optional(),
  showAge: z.boolean().optional(),
  allowMessages: z.boolean().optional(),
  messagePrice: z.number().min(0).max(1000).optional(),
  notificationsEnabled: z.boolean().optional(),
});

// ============================================================================
// FEED SCHEMAS
// ============================================================================

export const createPostSchema = z.object({
  type: z.enum(['text', 'image', 'video', 'story']),
  content: z.string().min(1).max(5000).trim(),
  mediaUrls: z.array(urlSchema).max(10).optional(),
  gated: z.boolean().default(false),
  unlockPrice: z.number().min(0).max(10000).optional(),
});

export const commentSchema = z.object({
  content: z.string().min(1).max(2000).trim(),
});

// ============================================================================
// CHAT SCHEMAS
// ============================================================================

export const sendMessageSchema = z.object({
  chatId: uuidSchema,
  content: z.string().min(1).max(2000).trim(),
  type: z.enum(['text', 'image', 'video', 'audio', 'gift']).default('text'),
  mediaUrl: urlSchema.optional(),
});

export const introMessageSchema = z.object({
  recipientId: uuidSchema,
  content: z.string().min(1).max(500).trim(),
});

export const chatPricingSchema = z.object({
  basePrice: z.number().min(0).max(1000),
  introMessagePrice: z.number().min(0).max(1000),
  mediaMessagePrice: z.number().min(0).max(1000),
  currency: z.string().length(3).toUpperCase().default('USD'),
});

// ============================================================================
// PAYMENT SCHEMAS
// ============================================================================

export const purchaseTokensSchema = z.object({
  packageId: uuidSchema,
  paymentMethodId: z.string().min(1).max(100),
  idempotencyKey: uuidSchema,
});

export const withdrawalSchema = z.object({
  amount: z.number().min(10).max(100000),
  method: z.enum(['bank_transfer', 'paypal', 'crypto']),
  destination: z.string().min(5).max(200).trim(),
});

export const paymentMethodSchema = z.object({
  type: z.enum(['card', 'bank_account', 'paypal']),
  token: z.string().min(10).max(200),
  default: z.boolean().optional(),
});

// ============================================================================
// AI SCHEMAS
// ============================================================================

export const aiMessageSchema = z.object({
  companionId: uuidSchema,
  content: z.string().min(1).max(2000).trim(),
});

export const moderationSchema = z.object({
  content: z.string().min(1).max(10000).trim(),
});

export const generateContentSchema = z.object({
  prompt: z.string().min(1).max(500).trim(),
  tone: z.enum(['professional', 'casual', 'flirty', 'friendly']).optional(),
  length: z.enum(['short', 'medium', 'long']).optional(),
  count: z.number().int().min(1).max(10).optional(),
});

// ============================================================================
// MATCHMAKING SCHEMAS
// ============================================================================

export const likeProfileSchema = z.object({
  userId: uuidSchema,
  superLike: z.boolean().default(false),
});

export const matchPreferencesSchema = z.object({
  ageRange: z.tuple([
    z.number().int().min(18).max(99),
    z.number().int().min(18).max(99)
  ]).refine(([min, max]) => min <= max, 'Invalid age range'),
  distance: z.number().int().min(1).max(500),
  gender: z.array(z.string()).min(1),
  interests: z.array(z.string()).max(30).optional(),
  verifiedOnly: z.boolean().default(false),
});

// ============================================================================
// ADMIN SCHEMAS
// ============================================================================

export const moderationActionSchema = z.object({
  targetType: z.enum(['user', 'post', 'message']),
  targetId: uuidSchema,
  action: z.enum(['warn', 'suspend', 'ban', 'delete']),
  reason: z.string().min(10).max(500).trim(),
  duration: z.number().int().min(1).max(365).optional(), // days
});

export const createAdminSchema = z.object({
  email: emailSchema,
  role: z.enum(['admin', 'moderator', 'support']),
  permissions: z.array(z.string()).min(1).max(50),
});

export const systemNotificationSchema = z.object({
  targetUsers: z.union([z.array(uuidSchema), z.literal('all')]),
  title: z.string().min(1).max(100).trim(),
  body: z.string().min(1).max(500).trim(),
  priority: z.enum(['low', 'medium', 'high']),
  actionUrl: urlSchema.optional(),
});

// ============================================================================
// WALLET SCHEMAS
// ============================================================================

export const walletAddressSchema = z.string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

export const connectWalletSchema = z.object({
  address: walletAddressSchema,
  signature: z.string().min(132).max(132), // Ethereum signature length
  message: z.string().min(1).max(500),
});

export const depositSchema = z.object({
  amount: z.string().regex(/^\d+\.?\d*$/, 'Invalid amount format'),
  currency: z.enum(['ETH', 'USDT', 'USDC']),
  fromAddress: walletAddressSchema,
});

export const withdrawalCryptoSchema = z.object({
  amount: z.string().regex(/^\d+\.?\d*$/),
  currency: z.enum(['ETH', 'USDT', 'USDC']),
  toAddress: walletAddressSchema,
  twoFactorCode: z.string().length(6).regex(/^\d{6}$/).optional(),
});

// ============================================================================
// NOTIFICATION SCHEMAS
// ============================================================================

export const pushTokenSchema = z.object({
  token: z.string().min(10).max(500),
  platform: z.enum(['ios', 'android', 'web']),
  deviceId: z.string().min(1).max(100),
});

export const notificationPreferencesSchema = z.object({
  messages: z.boolean().optional(),
  likes: z.boolean().optional(),
  comments: z.boolean().optional(),
  follows: z.boolean().optional(),
  matches: z.boolean().optional(),
  payments: z.boolean().optional(),
  marketing: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
});

// ============================================================================
// CREATOR SCHEMAS
// ============================================================================

export const subscriptionTierSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  price: z.number().min(1).max(10000),
  currency: z.string().length(3).toUpperCase().default('USD'),
  benefits: z.array(z.string().max(200)).min(1).max(10),
  duration: z.enum(['monthly', 'quarterly', 'yearly']),
});

export const schedulePostSchema = z.object({
  type: z.enum(['text', 'image', 'video']),
  content: z.string().min(1).max(5000).trim(),
  mediaUrls: z.array(urlSchema).max(10).optional(),
  scheduledFor: timestampSchema,
  gated: z.boolean().optional(),
  unlockPrice: z.number().min(0).max(10000).optional(),
});

// ============================================================================
// REPORT SCHEMAS
// ============================================================================

export const reportSchema = z.object({
  targetType: z.enum(['user', 'post', 'message', 'chat']),
  targetId: uuidSchema,
  reason: z.enum([
    'spam',
    'harassment',
    'inappropriate_content',
    'fraud',
    'impersonation',
    'copyright',
    'other'
  ]),
  details: z.string().max(1000).trim().optional(),
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sanitize user input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .slice(0, 10000); // Max length protection
}

/**
 * Validate and sanitize object against schema
 */
export async function validateAndSanitize<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<{ success: true; data: T } | { success: false; errors: string[] }> {
  try {
    const validated = await schema.parseAsync(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return { success: false, errors: ['Validation failed'] };
  }
}

/**
 * Rate limit key generator
 */
export function generateRateLimitKey(
  userId: string | undefined,
  ip: string,
  endpoint: string
): string {
  return userId ? `user:${userId}:${endpoint}` : `ip:${ip}:${endpoint}`;
}

