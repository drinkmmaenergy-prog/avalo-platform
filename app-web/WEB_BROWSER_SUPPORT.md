# Avalo Web Browser Support Matrix

**Last Updated:** 2025-11-28  
**Version:** 1.0

---

## Supported Browsers

Avalo Web is designed to work across modern browsers with full feature support. This document outlines the specific browser versions and features supported.

### Desktop Browsers ✅

| Browser | Minimum Version | Support Level | Notes |
|---------|----------------|---------------|-------|
| **Chrome** | 90+ | ✅ Full | Recommended browser |
| **Edge** | 90+ | ✅ Full | Chromium-based Edge |
| **Firefox** | 88+ | ✅ Full | Complete feature parity |
| **Safari** | 14+ | ✅ Full | macOS 11+ (Big Sur) |
| **Opera** | 76+ | ✅ Full | Chromium-based |
| **Brave** | 1.25+ | ✅ Full | Chromium-based |

### Mobile Browsers ✅

| Browser | Minimum Version | Support Level | Notes |
|---------|----------------|---------------|-------|
| **Chrome (Android)** | 90+ | ✅ Full | Recommended for Android |
| **Safari (iOS)** | 13+ | ✅ Full | iOS 13+ required |
| **Samsung Internet** | 14+ | ✅ Full | Samsung devices |
| **Firefox (Android)** | 88+ | ✅ Full | Full support |
| **Edge (Mobile)** | 90+ | ✅ Full | iOS/Android |

### Tablet Browsers ✅

| Device | Browser | Support Level | Notes |
|--------|---------|---------------|-------|
| **iPad** | Safari 13+ | ✅ Full | iPadOS 13+ |
| **Android Tablets** | Chrome 90+ | ✅ Full | Optimized layouts |
| **Surface** | Edge 90+ | ✅ Full | Windows tablets |

---

## Feature Support Matrix

### Core Web Technologies

| Feature | Chrome | Firefox | Safari | Edge | Notes |
|---------|--------|---------|--------|------|-------|
| **ES2020** | ✅ | ✅ | ✅ | ✅ | Required |
| **WebRTC** | ✅ | ✅ | ✅ | ✅ | Voice/video calls |
| **WebSockets** | ✅ | ✅ | ✅ | ✅ | Real-time chat |
| **Service Workers** | ✅ | ✅ | ✅ | ✅ | PWA support |
| **IndexedDB** | ✅ | ✅ | ✅ | ✅ | Offline storage |
| **WebP/AVIF** | ✅ | ✅ | ✅* | ✅ | *Safari 16+ for AVIF |
| **WebAuthn** | ✅ | ✅ | ✅ | ✅ | 2FA support |
| **Push Notifications** | ✅ | ✅ | ❌ | ✅ | Not on iOS Safari |

### Media Support

| Feature | Chrome | Firefox | Safari | Edge | Notes |
|---------|--------|---------|--------|------|-------|
| **MP4 Video** | ✅ | ✅ | ✅ | ✅ | H.264 codec |
| **WebM Video** | ✅ | ✅ | ❌ | ✅ | Fallback to MP4 |
| **HLS Streaming** | ✅* | ✅* | ✅ | ✅* | *Via hls.js library |
| **Audio API** | ✅ | ✅ | ✅ | ✅ | Voice calls |
| **MediaRecorder** | ✅ | ✅ | ✅ | ✅ | Recording |

### PWA Features

| Feature | Chrome | Firefox | Safari | Edge | Notes |
|---------|--------|---------|--------|------|-------|
| **Install Prompt** | ✅ | ✅ | ✅ | ✅ | Add to Home Screen |
| **Offline Mode** | ✅ | ✅ | ✅ | ✅ | Service worker cache |
| **App Shortcuts** | ✅ | ❌ | ❌ | ✅ | Chrome/Edge only |
| **Share Target** | ✅ | ❌ | ✅ | ✅ | Share to app |

---

## Browser-Specific Considerations

### Chrome/Chromium Browsers
- **Best Performance:** Optimized for V8 engine
- **Full WebRTC Support:** Recommended for video calls
- **PWA Features:** Complete implementation
- **Known Issues:** None

### Firefox
- **Complete Feature Parity:** All features supported
- **Privacy Focus:** Enhanced tracking protection
- **WebRTC Support:** Full implementation
- **Known Issues:** None

### Safari (macOS/iOS)
- **iOS Limitations:**
  - No push notifications on iOS (Apple restriction)
  - WebRTC requires user interaction to start
  - Service worker limitations on iOS
- **Desktop Safari:** Full support
- **Optimizations:** Specific polyfills for iOS Safari
- **Known Issues:**
  - WebRTC audio/video permissions require user gesture
  - IndexedDB storage limits may be lower

### Edge (Chromium)
- **Full Chrome Parity:** Chromium-based, same as Chrome
- **Windows Integration:** Native OS features
- **Known Issues:** None

---

## Performance Targets by Browser

### Desktop (Broadband Connection)

| Metric | Target | Chrome | Firefox | Safari | Edge |
|--------|--------|--------|---------|--------|------|
| **LCP** | < 2.5s | ✅ | ✅ | ✅ | ✅ |
| **FCP** | < 1.5s | ✅ | ✅ | ✅ | ✅ |
| **CLS** | < 0.1 | ✅ | ✅ | ✅ | ✅ |
| **TTI** | < 3.5s | ✅ | ✅ | ✅ | ✅ |

### Mobile (4G Connection)

| Metric | Target | Chrome | Firefox | Safari | Edge |
|--------|--------|--------|---------|--------|------|
| **LCP** | < 2.5s | ✅ | ✅ | ✅ | ✅ |
| **FCP** | < 1.8s | ✅ | ✅ | ✅ | ✅ |
| **CLS** | < 0.1 | ✅ | ✅ | ✅ | ✅ |
| **TTI** | < 4.0s | ✅ | ✅ | ✅ | ✅ |

---

## Unsupported Browsers

The following browsers are **not officially supported** and may have degraded functionality:

- Internet Explorer (all versions) - End of life
- Opera Mini - Limited JavaScript support
- UC Browser - Security concerns
- Outdated browser versions (3+ years old)

Users on unsupported browsers will see a warning banner suggesting they upgrade.

---

## Testing Coverage

We test on the following browser configurations:

### Automated Testing
- Chrome 90, 91, latest
- Firefox 88, 89, latest
- Safari 14, 15, latest (via BrowserStack)
- Edge 90, 91, latest

### Manual Testing
- Mobile Safari (iOS 13, 14, 15, latest)
- Chrome Android (latest 2 versions)
- Samsung Internet (latest)
- Tablet Safari (iPad)

### Continuous Integration
- Playwright tests run on Chrome, Firefox, WebKit (Safari)
- Visual regression tests on all major browsers
- Performance monitoring via Lighthouse CI

---

## Polyfills & Fallbacks

We use the following polyfills for wider browser support:

```javascript
// Automatically loaded based on browser detection
- core-js (ES2020 features for older browsers)
- fetch (XMLHttpRequest fallback)
- IntersectionObserver (scroll detection)
- ResizeObserver (layout detection)
```

---

## Accessibility Support

All supported browsers meet WCAG 2.1 Level AA standards:

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| **Screen Readers** | ✅ | ✅ | ✅ | ✅ |
| **Keyboard Navigation** | ✅ | ✅ | ✅ | ✅ |
| **High Contrast** | ✅ | ✅ | ✅ | ✅ |
| **Zoom (200%)** | ✅ | ✅ | ✅ | ✅ |

---

## Known Limitations

### iOS Safari Specific
1. **Push Notifications:** Not supported due to Apple restrictions
2. **Background Sync:** Limited service worker capabilities
3. **WebRTC:** Requires user gesture to start streams
4. **Storage Limits:** May be lower than other browsers

### Firefox Specific
1. **App Shortcuts:** Not yet implemented in Firefox

### All Browsers
1. **Third-Party Cookies:** May be blocked by privacy settings
2. **Storage Quotas:** Vary by browser and user settings
3. **WebRTC TURN:** May require TURN server for some network configurations

---

## Security Requirements

All supported browsers must support:

- TLS 1.2 or higher
- Modern crypto APIs (Web Crypto API)
- Content Security Policy (CSP)
- Subresource Integrity (SRI)
- HTTP Strict Transport Security (HSTS)

---

## Progressive Enhancement Strategy

Our app follows progressive enhancement principles:

1. **Core Functionality:** Works on all supported browsers
2. **Enhanced Features:** Available on modern browsers
3. **Graceful Degradation:** Fallbacks for missing features
4. **User Warnings:** Clear messaging for unsupported browsers

---

## Browser Detection

We detect browsers using:

```javascript
// User-agent parsing
// Feature detection
// Progressive enhancement
```

Users on unsupported browsers see:
- Warning banner with upgrade recommendation
- Limited functionality (read-only mode)
- Links to download supported browsers

---

## Update Policy

- **Major Browser Updates:** Tested within 1 week of release
- **Security Updates:** Immediate testing for critical issues
- **Minimum Version Updates:** Reviewed quarterly
- **End of Support:** 6 months notice for version deprecation

---

## Support Contact

For browser-specific issues:
- **Email:** support@avalo.app
- **Discord:** discord.gg/avalo
- **GitHub Issues:** github.com/avalo/web-app/issues

When reporting browser issues, please include:
- Browser name and version
- Operating system and version
- Screenshot or video of the issue
- Steps to reproduce
- Console error messages (if any)

---

**Document Version:** 1.0  
**Maintained By:** Avalo Web Team  
**Next Review:** 2025-02-28