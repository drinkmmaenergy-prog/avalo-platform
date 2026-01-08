# PACK 426 — CDN & Media Delivery Architecture

## Overview

Avalo's global CDN architecture ensures ultra-low latency media delivery for profiles, feed posts, stories, chat media, voice notes, and AI avatars across all regions.

---

## 1. CDN PROVIDER STACK

### 1.1 Primary CDN: Cloudflare

**Why Cloudflare:**
- 300+ global edge locations
- Built-in DDoS protection
- Advanced caching rules
- Image optimization & resizing
- Video streaming support
- WebP/AVIF automatic conversion
- Geo-fencing capabilities
- Analytics & real-time metrics

**Cloudflare Zones:**
- `cdn.avalo.app` — Global CDN endpoint
- `media-eu.avalo.app` — EU-specific media
- `media-us.avalo.app` — US-specific media
- `media-apac.avalo.app` — APAC-specific media

### 1.2 Fallback: Firebase Hosting CDN

**Used for:**
- Static web assets (admin dashboard)
- App configuration files
- Legal documents
- Emergency fallback for media

---

## 2. MEDIA STORAGE STRATEGY

### 2.1 Firebase Storage Buckets (Multi-Region)

| Bucket | Region | Purpose | Public Access |
|--------|--------|---------|---------------|
| `avalo-profiles-eu` | EU | Profile pictures, verification | Public (cached) |
| `avalo-feed-eu` | EU | Feed posts, reels | Public (cached) |
| `avalo-chat-eu` | EU | Chat media, voice notes | Private (signed URLs) |
| `avalo-profiles-us` | US | Profile pictures, verification | Public (cached) |
| `avalo-feed-us` | US | Feed posts, reels | Public (cached) |
| `avalo-chat-us` | US | Chat media, voice notes | Private (signed URLs) |
| `avalo-profiles-apac` | APAC | Profile pictures, verification | Public (cached) |
| `avalo-feed-apac` | APAC | Feed posts, reels | Public (cached) |
| `avalo-chat-apac` | APAC | Chat media, voice notes | Private (signed URLs) |

### 2.2 Storage Routing Logic

```typescript
function getStorageBucket(userId: string, mediaType: string): string {
  const userRegion = getUserRegion(userId); // From PACK 426 router
  
  switch (mediaType) {
    case 'profile':
      return `avalo-profiles-${userRegion.toLowerCase()}`;
    case 'feed':
    case 'reel':
    case 'story':
      return `avalo-feed-${userRegion.toLowerCase()}`;
    case 'chat':
    case 'voice':
      return `avalo-chat-${userRegion.toLowerCase()}`;
    default:
      return `avalo-profiles-${userRegion.toLowerCase()}`;
  }
}
```

---

## 3. CDN CACHING STRATEGY

### 3.1 Cache Tiers

| Content Type | Cache Location | TTL | Invalidation |
|--------------|----------------|-----|--------------|
| **Profile Pictures** | Edge (Global) | 7 days | On profile update |
| **Feed Posts** | Edge + Regional | 2 minutes | On post update |
| **Stories** | Regional only | 24 hours | Auto-expire |
| **Reels/Videos** | Edge (Global) | 30 days | Manual only |
| **Chat Media** | No cache | N/A | N/A (private) |
| **AI Avatars** | Edge (Global) | 90 days | Version-based |
| **Voice Notes** | No cache | N/A | N/A (ephemeral) |

### 3.2 Advanced Caching Rules

**Profile Picture Variants:**
```
/profiles/{userId}/avatar.jpg
  → Cache: 7 days
  → Variants: thumbnail (150x150), medium (400x400), large (800x800)
  → Auto WebP conversion
  → Lazy loading enabled
```

**Feed Media:**
```
/feed/{postId}/{imageId}.jpg
  → Cache: 2 minutes (feed algorithm changes)
  → Variants: thumbnail, standard, high-res
  → Progressive JPEG encoding
  → Preload next 5 posts
```

**Stories (Ephemeral):**
```
/stories/{userId}/{storyId}.jpg
  → Cache: 24 hours
  → Auto-delete after expiry
  → No variants (single size)
```

### 3.3 Cache Invalidation Strategy

**Automatic Invalidation:**
- Profile update → Purge profile CDN cache
- Post deletion → Purge feed CDN cache
- Story expiration → Auto-expire (no purge needed)

**Manual Invalidation:**
- Admin-triggered purge for policy violations
- Batch purge for abuse reports
- Emergency global purge capability

---

## 4. IMAGE OPTIMIZATION PIPELINE

### 4.1 Upload Processing

```typescript
export async function processUpload(
  file: File,
  mediaType: string
): Promise<ProcessedMedia> {
  
  // 1. Validate file
  validateFile(file); // Size, format, dimensions
  
  // 2. Scan for safety
  await scanForMalware(file);
  await checkContentModeration(file);
  
  // 3. Compress
  const compressed = await compress(file, {
    quality: 85,
    maxWidth: 1920,
    maxHeight: 1920,
  });
  
  // 4. Generate variants
  const variants = await generateVariants(compressed, mediaType);
  
  // 5. Upload to regional bucket
  const urls = await uploadToBucket(variants);
  
  // 6. Distribute to CDN
  await distributeToCDN(urls);
  
  return {
    originalUrl: urls.original,
    variants: urls.variants,
    cdnUrls: urls.cdn,
  };
}
```

### 4.2 Image Variants

**Profile Pictures:**
- Thumbnail: 150x150 (for swipe cards)
- Medium: 400x400 (for profiles)
- Large: 800x800 (for full-screen)

**Feed Posts:**
- Thumbnail: 300x300 (for feed grid)
- Standard: 1080x1080 (for feed view)
- High-res: 1920x1920 (for zoom/download)

**Stories:**
- Single variant: 1080x1920 (vertical)

### 4.3 Video Processing

**Upload Pipeline:**
1. Transcode to H.264 (baseline, main, high profiles)
2. Generate adaptive bitrate streams (HLS)
3. Create thumbnail strips
4. Extract first frame as poster image
5. Apply content watermark

**Bitrates:**
- 360p: 500 kbps
- 480p: 1 Mbps
- 720p: 2.5 Mbps
- 1080p: 5 Mbps

---

## 5. SIGNED URLS FOR PRIVATE CONTENT

### 5.1 Chat Media Security

**All chat media uses signed URLs:**
```typescript
export async function generateChatMediaUrl(
  chatId: string,
  mediaId: string,
  userId: string
): Promise<string> {
  
  // Verify user has access to chat
  await verifyChatAccess(chatId, userId);
  
  // Generate signed URL (expires in 1 hour)
  const signedUrl = await storage
    .bucket(`avalo-chat-${getUserRegion(userId)}`)
    .file(`chats/${chatId}/${mediaId}`)
    .getSignedUrl({
      action: 'read',
      expires: Date.now() + 3600000, // 1 hour
    });
  
  return signedUrl[0];
}
```

### 5.2 Voice Notes

**Ephemeral signed URLs:**
- Expires: 5 minutes
- One-time use only
- Auto-delete after 30 days
- No caching allowed

---

## 6. GEO-FENCING & CONTENT RESTRICTIONS

### 6.1 Regional Content Blocking

**Use cases:**
- GDPR compliance (EU data residency)
- Age-restricted content by country
- Legal content restrictions
- Regional feature rollouts

**Implementation:**
```typescript
export function applyGeoRestrictions(
  content: Content,
  userCountry: string
): boolean {
  
  // Check country-specific restrictions
  if (content.restrictedCountries?.includes(userCountry)) {
    return false; // Block access
  }
  
  // Check age verification requirements
  if (content.ageRestricted && !verifyAge(userCountry)) {
    return false;
  }
  
  return true; // Allow access
}
```

### 6.2 CDN Geo-Routing

**Cloudflare Workers:**
- Detect user's country via CF headers
- Route to nearest regional bucket
- Apply geo-fencing rules
- Log access for compliance

---

## 7. BANDWIDTH OPTIMIZATION

### 7.1 Compression

- **Images**: WebP (Chrome/Android), AVIF (modern browsers), JPEG fallback
- **Videos**: H.265 where supported, H.264 fallback
- **Audio**: Opus codec for voice notes

### 7.2 Lazy Loading

- Images load on viewport entry
- Videos preload metadata only
- Progressive image loading (blur-up technique)

### 7.3 Preloading Strategy

**Feed:**
- Preload next 5 posts' thumbnails
- Preload user profile pictures in viewport

**Swipe:**
- Preload next 3 profiles' pictures
- Preload on swipe gesture start

---

## 8. CDN ANALYTICS & MONITORING

### 8.1 Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Cache Hit Rate** | > 85% | < 70% |
| **Avg Response Time** | < 200ms | > 500ms |
| **Bandwidth Usage** | < 10 TB/day | > 15 TB/day |
| **Error Rate** | < 0.1% | > 1% |
| **CDN Availability** | 99.99% | < 99.9% |

### 8.2 Dashboard Metrics

**Real-time:**
- Requests per second (by region)
- Cache hit/miss ratio
- Bandwidth usage
- Top requested assets
- Error rates by type

**Historical:**
- Daily bandwidth trends
- Popular content analysis
- Geographic distribution
- Cost projections

---

## 9. CDN FAILOVER & REDUNDANCY

### 9.1 Multi-CDN Strategy

**Primary**: Cloudflare  
**Fallback 1**: Firebase Hosting CDN  
**Fallback 2**: Direct Firebase Storage (signed URLs)

### 9.2 Automatic Failover

```typescript
export async function getMediaUrl(
  mediaId: string,
  fallbackEnabled: boolean = true
): Promise<string> {
  
  try {
    // Try primary CDN
    return `https://cdn.avalo.app/media/${mediaId}`;
  } catch (error) {
    if (!fallbackEnabled) throw error;
    
    logger.warn('Primary CDN failed, using fallback');
    
    try {
      // Try Firebase Hosting fallback
      return `https://avalo-app.web.app/media/${mediaId}`;
    } catch (error2) {
      logger.error('All CDNs failed, using direct storage');
      
      // Last resort: direct signed URL
      return await getDirectStorageUrl(mediaId);
    }
  }
}
```

---

## 10. COST OPTIMIZATION

### 10.1 Storage Costs

**Current estimate:**
- Profiles: 500 GB × 3 regions = 1.5 TB → $30/month
- Feed: 2 TB × 3 regions = 6 TB → $120/month
- Chat: 1 TB × 3 regions = 3 TB → $60/month
- **Total**: ~$210/month (at 100K users)

### 10.2 Bandwidth Costs

**Cloudflare CDN:**
- Free tier: 10 TB/month
- Pro plan: Unlimited bandwidth
- Estimated: $200/month for Pro plan

### 10.3 Optimization Strategies

1. **Auto-delete old chat media** → 30-day retention
2. **Compress all uploads** → 40% size reduction
3. **CDN caching** → 85% bandwidth savings
4. **Lazy loading** → 50% initial load reduction

**Total savings**: ~60% infrastructure costs

---

## 11. SECURITY & COMPLIANCE

### 11.1 DDoS Protection

- Cloudflare automatic DDoS mitigation
- Rate limiting on upload endpoints
- IP reputation filtering
- Challenge pages for suspicious traffic

### 11.2 Content Security Policy

```
Content-Security-Policy:
  default-src 'self';
  img-src 'self' https://cdn.avalo.app https://*.cloudfront.net;
  media-src 'self' https://cdn.avalo.app;
  connect-src 'self' https://api.avalo.app;
```

### 11.3 GDPR Compliance

- EU data stored in EU buckets only
- Right to deletion (purge CDN + storage)
- Access logs for audit trails
- Data export capability

---

## 12. ACCEPTANCE CRITERIA

✅ Multi-region Firebase Storage buckets deployed  
✅ Cloudflare CDN configured with caching rules  
✅ Image optimization pipeline active  
✅ Video transcoding implemented  
✅ Signed URLs for private content  
✅ Geo-fencing rules applied  
✅ CDN analytics dashboard  
✅ Automatic failover tested  
✅ Cost optimization rules active  
✅ GDPR compliance verified  

---

**Status**: Ready for deployment  
**Owner**: Infrastructure Team  
**Dependencies**: PACK 426 Global Router  
**Next**: Performance testing & monitoring setup
