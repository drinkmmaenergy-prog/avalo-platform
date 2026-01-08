# PACK 113 — Avalo API Gateway Developer Guide

## Overview

The Avalo API Gateway provides secure, permissioned access for external developers to build integrations with the Avalo platform. This guide covers authentication, available endpoints, rate limits, and security requirements.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [API Scopes](#api-scopes)
4. [Available Endpoints](#available-endpoints)
5. [Rate Limits](#rate-limits)
6. [Webhooks](#webhooks)
7. [Security Requirements](#security-requirements)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)

---

## Getting Started

### Base URL

```
https://api.avalo.app/v1
```

### Register Your Application

1. Contact Avalo Developer Relations to register your application
2. Provide:
   - Application name
   - Description
   - Callback URLs for OAuth2
   - Requested scopes
3. Receive your `client_id` and `client_secret`

### Sandbox Environment

Test your integration in sandbox mode:
```
https://api-sandbox.avalo.app/v1
```

---

## Authentication

Avalo uses OAuth 2.0 for authentication.

### Step 1: Authorization Request

Direct users to:
```
https://avalo.app/oauth/authorize?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=YOUR_CALLBACK_URL&
  scope=PROFILE_READ%20ANALYTICS_READ&
  response_type=code&
  state=RANDOM_STATE
```

### Step 2: Exchange Authorization Code

```bash
POST /oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "AUTHORIZATION_CODE",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "redirect_uri": "YOUR_CALLBACK_URL"
}
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "PROFILE_READ ANALYTICS_READ"
}
```

### Step 3: Make Authenticated Requests

Include the access token in all API requests:

```bash
GET /api/v1/me/profile
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Refresh Token

When access token expires:

```bash
POST /oauth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "YOUR_REFRESH_TOKEN",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}
```

---

## API Scopes

### Profile Scopes

| Scope | Description | Risk Level |
|-------|-------------|------------|
| `PROFILE_READ` | Read creator's public profile | LOW |
| `PROFILE_UPDATE` | Update profile basics (bio, links, cover photo) | MEDIUM |

### Content Scopes

| Scope | Description | Risk Level |
|-------|-------------|------------|
| `POST_STORY` | Publish stories on creator's behalf | HIGH |
| `POST_FEED_CONTENT` | Publish feed posts | HIGH |
| `DELETE_OWN_CONTENT` | Delete creator's own content | MEDIUM |

### Analytics Scopes

| Scope | Description | Risk Level |
|-------|-------------|------------|
| `ANALYTICS_READ` | Read aggregated analytics data | LOW |
| `AUDIENCE_READ_AGGREGATE` | Read high-level audience demographics | LOW |

### Webhook Scopes

| Scope | Description | Risk Level |
|-------|-------------|------------|
| `WEBHOOK_CONTENT` | Subscribe to content events | LOW |
| `WEBHOOK_FOLLOWERS` | Subscribe to follower events | LOW |

### Forbidden Scopes

**The following scopes will NEVER be granted:**

- `MESSAGE_READ` / `MESSAGE_WRITE` - Privacy violation
- `TOKEN_READ` / `TOKEN_WRITE` - Economic security
- `PAYOUT_READ` / `PAYOUT_WRITE` - Financial compliance
- `DISCOVERY_BOOST` - Ranking manipulation
- `SUSPENSION_BYPASS` - Enforcement bypass

---

## Available Endpoints

### Profile Endpoints

#### Get Profile

```bash
GET /api/v1/me/profile
Authorization: Bearer {token}
```

**Required Scope:** `PROFILE_READ`

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user123",
    "username": "@creator",
    "displayName": "Creator Name",
    "bio": "Creator bio text",
    "avatarUrl": "https://...",
    "coverPhotoUrl": "https://...",
    "socialLinks": ["https://..."],
    "isVerified": true,
    "creatorMode": true,
    "joinedAt": "2024-01-01T00:00:00Z"
  },
  "meta": {
    "timestamp": "2024-11-26T22:00:00Z",
    "requestId": "req_123"
  }
}
```

#### Update Profile

```bash
PATCH /api/v1/me/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "bio": "Updated bio",
  "socialLinks": ["https://twitter.com/..."],
  "coverPhotoUrl": "https://..."
}
```

**Required Scope:** `PROFILE_UPDATE`

**Response:**
```json
{
  "success": true,
  "data": {
    "updated": true,
    "fields": ["bio", "socialLinks", "coverPhotoUrl"]
  }
}
```

### Content Endpoints

#### Post Story

```bash
POST /api/v1/me/stories
Authorization: Bearer {token}
Content-Type: application/json

{
  "mediaUrl": "https://cdn.avalo.app/media/...",
  "caption": "Story caption",
  "expiresInHours": 24
}
```

**Required Scope:** `POST_STORY`

**Response:**
```json
{
  "success": true,
  "data": {
    "storyId": "story_123",
    "expiresAt": "2024-11-27T22:00:00Z"
  }
}
```

#### Post Feed Content

```bash
POST /api/v1/me/posts
Authorization: Bearer {token}
Content-Type: application/json

{
  "content": "Post content text",
  "mediaUrls": ["https://cdn.avalo.app/media/..."]
}
```

**Required Scope:** `POST_FEED_CONTENT`

**Response:**
```json
{
  "success": true,
  "data": {
    "postId": "post_123"
  }
}
```

#### Delete Post

```bash
DELETE /api/v1/me/posts/:postId
Authorization: Bearer {token}
```

**Required Scope:** `DELETE_OWN_CONTENT`

### Analytics Endpoints

#### Get Analytics Overview

```bash
GET /api/v1/me/analytics/overview
Authorization: Bearer {token}
```

**Required Scope:** `ANALYTICS_READ`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalEarnings": 15000,
    "payingUsers": 150,
    "paidInteractions": 2500,
    "earningsBySource": {
      "GIFT": 8000,
      "PREMIUM_STORY": 5000,
      "PAID_MEDIA": 2000
    },
    "period": "last_30_days",
    "lastUpdated": "2024-11-26T22:00:00Z"
  }
}
```

#### Get Audience Demographics

```bash
GET /api/v1/me/audience/demographics
Authorization: Bearer {token}
```

**Required Scope:** `AUDIENCE_READ_AGGREGATE`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalFollowers": 5000,
    "topRegions": [
      {"region": "US", "percentage": 35},
      {"region": "UK", "percentage": 20}
    ],
    "topLanguages": [
      {"language": "en", "percentage": 60},
      {"language": "es", "percentage": 25}
    ],
    "growthRate": 0.15
  }
}
```

---

## Rate Limits

### Default Limits

| Window | GET Requests | POST Requests |
|--------|-------------|---------------|
| Per Minute | 100 | 10 |
| Per Hour | 1,000 | 50 |
| Per Day | 10,000 | 500 |

### Burst Control

Maximum 10 requests per second across all endpoints.

### Rate Limit Headers

All responses include:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1701043200
```

### Handling Rate Limits

**429 Response:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 60 seconds."
  }
}
```

**Best Practice:** Implement exponential backoff:
```javascript
async function makeRequest(url, retries = 3) {
  try {
    return await fetch(url);
  } catch (error) {
    if (error.status === 429 && retries > 0) {
      await sleep(Math.pow(2, 3 - retries) * 1000);
      return makeRequest(url, retries - 1);
    }
    throw error;
  }
}
```

---

## Webhooks

### Subscribe to Events

```bash
POST /webhooks/subscribe
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "CONTENT_PUBLISHED",
  "callbackUrl": "https://your-app.com/webhooks/avalo"
}
```

**Required Scope:** `WEBHOOK_CONTENT` or `WEBHOOK_FOLLOWERS`

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptionId": "sub_123",
    "secret": "whsec_...",
    "status": "created"
  }
}
```

⚠️ **Important:** Store the `secret` - you'll need it to verify webhook signatures.

### Available Events

| Event Type | Description | Required Scope |
|------------|-------------|----------------|
| `CONTENT_PUBLISHED` | New content posted | `WEBHOOK_CONTENT` |
| `CONTENT_DELETED` | Content removed | `WEBHOOK_CONTENT` |
| `NEW_FOLLOWER` | New follower gained | `WEBHOOK_FOLLOWERS` |
| `STORY_EXPIRED` | Story expired | `WEBHOOK_CONTENT` |

### Webhook Payload

```json
{
  "event": "content.published",
  "userId": "user123",
  "contentId": "post_123",
  "contentType": "post",
  "publishedAt": "2024-11-26T22:00:00Z"
}
```

### Verify Webhook Signature

**Required Headers:**
- `X-Avalo-Signature`: HMAC SHA256 signature
- `X-Avalo-Event`: Event type

**Verification:**
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Webhook Endpoint Requirements

1. **HTTPS only** - HTTP endpoints will be rejected
2. **Respond quickly** - Return 200 within 10 seconds
3. **Idempotency** - Handle duplicate deliveries gracefully
4. **Retry logic** - We retry failed deliveries 3 times with exponential backoff

### Auto-Disable

Webhooks are automatically disabled after 10 consecutive failures.

---

## Security Requirements

### HTTPS Only

All API requests must use HTTPS. HTTP requests will be rejected.

### Token Storage

**Never expose access tokens:**
- Store tokens server-side only
- Never commit tokens to version control
- Use environment variables
- Rotate tokens regularly

### IP Allowlisting

Optional: Configure IP allowlisting in your app settings to restrict API access to specific IPs.

### Scope Minimization

**Request only the scopes you need.** Users are more likely to authorize apps that request minimal permissions.

### Data Retention

- **Do not store** user data beyond what's necessary
- **Delete data** when users revoke access
- **Comply with GDPR/CCPA** - provide data export and deletion

### Audit Trail

All API activity is logged:
- Endpoint accessed
- Timestamp
- IP address (masked)
- Response code

Users can view this activity in their Connected Apps settings.

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {
      "field": "Additional context"
    }
  },
  "meta": {
    "timestamp": "2024-11-26T22:00:00Z",
    "requestId": "req_123"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_TOKEN` | 401 | Authorization header missing |
| `INVALID_TOKEN` | 401 | Token is invalid or expired |
| `UNAUTHORIZED` | 401 | Missing required scope |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INVALID_INPUT` | 400 | Request validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `FORBIDDEN` | 403 | Action not allowed |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Best Practices

### 1. Handle Token Expiration

```javascript
async function apiRequest(endpoint) {
  let response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (response.status === 401) {
    // Token expired, refresh it
    accessToken = await refreshAccessToken();
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }
  
  return response;
}
```

### 2. Implement Retry Logic

```javascript
async function retryableRequest(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return response;
      }
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        await sleep(retryAfter * 1000);
        continue;
      }
      
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

### 3. Cache Responses

```javascript
const cache = new Map();

async function getCachedProfile(userId) {
  const cacheKey = `profile:${userId}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < 300000) { // 5 min
    return cached.data;
  }
  
  const data = await fetchProfile(userId);
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
```

### 4. Batch Operations

When possible, batch multiple operations:

```javascript
// Instead of multiple single requests
for (const user of users) {
  await updateProfile(user.id, user.data);
}

// Batch them
await Promise.all(
  users.map(user => updateProfile(user.id, user.data))
);
```

### 5. Monitor Your Usage

Track your API usage:
- Request count per endpoint
- Error rates
- Average response times
- Rate limit hits

Set up alerts for unusual patterns.

---

## Support

### Developer Portal

Access the developer portal: https://developers.avalo.app

### Documentation

API Reference: https://docs.avalo.app/api

### Contact

- Email: developers@avalo.app
- Discord: https://discord.gg/avalo-developers
- Status Page: https://status.avalo.app

### Reporting Security Issues

Email: security@avalo.app (PGP key available)

---

## Changelog

### v1.0.0 (2024-11-26)

- Initial API Gateway release
- OAuth2 authentication
- Profile, content, and analytics endpoints
- Webhook support
- Rate limiting implementation

---

## Legal

### Terms of Service

By using the Avalo API, you agree to:
- Comply with Avalo's Terms of Service
- Respect user privacy and data protection laws
- Not abuse rate limits or attempt to bypass security measures
- Not use the API for spam, harassment, or illegal activities

### Data Protection

- All API data is subject to GDPR and CCPA
- Users can revoke access at any time
- Apps must delete user data upon revocation
- Implement appropriate security measures for stored data

---

**Last Updated:** November 26, 2024  
**API Version:** 1.0.0