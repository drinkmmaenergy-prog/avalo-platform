# Avalo SDK Complete Reference

## Overview

The Avalo SDK provides a comprehensive TypeScript interface for all Avalo Platform APIs. This reference documents all modules, methods, and types.

## Installation

```bash
npm install @avalo/sdk
```

## Quick Start

```typescript
import { AvaloSDK } from '@avalo/sdk';

const sdk = new AvaloSDK({
  apiEndpoint: 'https://api.avalo.app',
  env: 'production'
});

// Authenticate
await sdk.auth.login({ email, password });

// Use any module
const feed = await sdk.feed.getFeed({ limit: 20 });
```

## Modules

### Auth Module

Complete authentication and session management.

**Methods:**
- `login(credentials)` - Email/password login
- `register(data)` - Create new account
- `logout()` - End session
- `refreshToken()` - Refresh access token
- `getCurrentUser()` - Get authenticated user
- `submitKYC(data)` - Submit KYC verification
- `enable2FA()` - Enable two-factor auth
- `loginWithOAuth(provider, token)` - OAuth login

### Profiles Module

User profile management and social features.

**Methods:**
- `getProfile(userId)` - Get user profile
- `updateProfile(data)` - Update own profile
- `uploadProfilePhoto(file)` - Upload avatar
- `followUser(userId)` - Follow user
- `getFollowers(userId)` - Get followers list
- `becomeCreator()` - Enable creator mode
- `createSubscriptionTier(tier)` - Create subscription

### Feed Module

Content creation and consumption.

**Methods:**
- `getFeed(options)` - Get personalized feed
- `createPost(post)` - Create new post
- `likePost(postId)` - Like a post
- `commentOnPost(postId, content)` - Add comment
- `createStory(story)` - Create 24h story
- `unlockPost(postId)` - Purchase gated content

### Chat Module

Messaging with pricing engine.

**Methods:**
- `getChats()` - List all chats
- `sendMessage(draft)` - Send message
- `sendIntroMessage(recipientId, content)` - First message
- `markAsRead(chatId, messageIds)` - Mark read
- `setTyping(chatId, typing)` - Typing indicator
- `subscribeToMessages(chatId, callback)` - Real-time

### Payments Module

Wallet and transaction management.

**Methods:**
- `getWallet()` - Get wallet balance
- `purchaseTokens(request)` - Buy tokens
- `requestWithdrawal(request)` - Cash out
- `sendTip(recipientId, amount)` - Send tip
- `getEarningsSummary(period)` - Creator earnings

### AI Module

AI companions and moderation.

**Methods:**
- `getCompanions(options)` - List AI companions
- `startChat(companionId)` - Start AI chat
- `sendMessage(chatId, content)` - Chat with AI
- `moderateContent(content)` - Check content safety
- `enableNSFW(chatId)` - Enable adult mode

### Creator Module

Creator analytics and tools.

**Methods:**
- `getStats(period)` - Dashboard stats
- `getRevenueBreakdown(start, end)` - Revenue details
- `getSubscriberAnalytics()` - Subscriber metrics
- `setContentPricing(pricing)` - Set prices
- `scheduleContent(data)` - Schedule posts

### Matchmaking Module

Dating and matching features.

**Methods:**
- `getSuggestions()` - Get match suggestions
- `likeProfile(userId, superLike)` - Like/super like
- `getMatches(options)` - Get matches
- `updatePreferences(prefs)` - Set preferences
- `getFreeMessagesStatus(matchId)` - Check free msgs

### Notifications Module

Push and in-app notifications.

**Methods:**
- `getNotifications(options)` - List notifications
- `markAsRead(notificationId)` - Mark read
- `registerPushToken(data)` - Register device
- `updatePreferences(prefs)` - Set preferences
- `subscribeToNotifications(callback)` - Real-time

### Admin Module

Admin and moderation tools.

**Methods:**
- `getDashboardStats()` - System stats
- `getUsers(options)` - List users
- `suspendUser(userId, reason)` - Suspend user
- `getModerationQueue()` - Pending reports
- `moderateContent(action)` - Take action
-`getRevenueAnalytics(period)` - Revenue stats

## Type Definitions

### User Profile

```typescript
interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  bio?: string;
  age: number;
  isCreator: boolean;
  isVerified: boolean;
}
```

### Post

```typescript
interface Post {
  id: string;
  authorId: string;
  content: string;
  mediaUrls?: string[];
  gated: boolean;
  unlockPrice?: number;
  likes: number;
  comments: number;
  createdAt: string;
}
```

### Message

```typescript
interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  price?: number;
  paid: boolean;
  read: boolean;
  createdAt: string;
}
```

## Error Handling

All methods return `ApiResponse<T>`:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    statusCode?: number;
  };
}
```

Handle errors:

```typescript
const response = await sdk.auth.login({ email, password });

if (!response.success) {
  console.error(response.error?.message);
  // Handle error
} else {
  console.log(response.data);
  // Success
}
```

## Rate Limiting

Built-in rate limiting: 100 requests/minute per SDK instance.

## Retry Logic

Automatic retry with exponential backoff for:
- Network errors
- 5xx server errors  
- 429 rate limit errors

Default: 3 attempts, configurable via `retryAttempts`.

## TypeScript Support

Full type definitions included. Import types:

```typescript
import type { 
  UserProfile, 
  Post, 
  Message 
} from '@avalo/sdk';
```

## Support

- Documentation: https://docs.avalo.app
- API Reference: https://api.avalo.app/docs
- GitHub: https://github.com/avalo/sdk
- Email: support@avalo.app