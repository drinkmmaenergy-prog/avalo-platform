# Avalo Marketing Landing Page Components

Complete set of React components for the Avalo marketing website with English/Polish internationalization.

## Components Overview

### 1. LocaleProvider
Provides i18n context with locale switching functionality.

### 2. MarketingHero
Full-screen hero section with gradient background, app title, CTA buttons, and store badges.

### 3. FeaturesSection
Grid of 6 key features with icons, titles, and descriptions.

### 4. SafetySection
Security and verification features with trust badges.

### 5. CreatorSection
Creator monetization benefits with stats and earnings breakdown.

### 6. DownloadSection
Final CTA with store badges and QR code placeholder.

### 7. MarketingFooter
Complete footer with navigation, legal links, social media, and language switcher.

---

## Installation

### 1. Copy Files to Next.js Project

```bash
# From marketing/web-assets/, copy to web/src/
cp -r components/* ../web/src/components/
cp landing-copy.json ../web/src/data/
```

### 2. Install Dependencies

All components use standard React and Next.js - no additional packages needed beyond your existing setup.

---

## Usage

### Basic Integration

Update your `web/src/app/page.tsx`:

```tsx
'use client';

import { LocaleProvider } from '../components/LocaleProvider';
import { MarketingHero } from '../components/MarketingHero';
import { FeaturesSection } from '../components/FeaturesSection';
import { SafetySection } from '../components/SafetySection';
import { CreatorSection } from '../components/CreatorSection';
import { DownloadSection } from '../components/DownloadSection';
import { MarketingFooter } from '../components/MarketingFooter';

export default function HomePage() {
  return (
    <LocaleProvider>
      <MarketingHero />
      <FeaturesSection />
      <SafetySection />
      <CreatorSection />
      <DownloadSection />
      <MarketingFooter />
    </LocaleProvider>
  );
}
```

### App Layout Integration

Wrap your root layout with LocaleProvider:

```tsx
// web/src/app/layout.tsx
import { LocaleProvider } from '../components/LocaleProvider';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
```

---

## Internationalization (i18n)

### Language Switching

Users can switch between English and Polish using the toggle in the footer. The selected locale is stored in localStorage.

### Adding New Languages

1. Edit `landing-copy.json`
2. Add new locale object (e.g., `"de"`)
3. Update `LocaleProvider.tsx` type definition
4. Add language button in footer

Example:

```json
{
  "en": { ... },
  "pl": { ... },
  "de": {
    "hero": {
      "title": "Wo authentische Verbindungen sich auszahlen",
      ...
    }
  }
}
```

### Using Translations in Custom Components

```tsx
import { useLocale } from '../components/LocaleProvider';

function MyComponent() {
  const { t, locale, setLocale } = useLocale();
  
  return <h1>{t.hero.title}</h1>;
}
```

---

## Customization

### Colors

All gradient colors use Avalo brand palette:
- Start: `#FF6B00` (Orange)
- Middle: `#FF3C8E` (Pink)
- End: `#7B2EFF` (Purple)

Update in Tailwind config if needed:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'avalo-orange': '#FF6B00',
        'avalo-pink': '#FF3C8E',
        'avalo-purple': '#7B2EFF',
      },
    },
  },
};
```

### Typography

Components use default Tailwind typography classes. Customize in `tailwind.config.js`:

```js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
```

### Spacing

All components follow 8px grid system. Adjust using Tailwind spacing utilities.

---

## Store Badges

### Required Assets

Place these in `web/public/badges/`:

1. `app-store-badge.svg` - Apple App Store badge
2. `google-play-badge.svg` - Google Play badge

Download official badges:
- [Apple App Store Marketing Guidelines](https://developer.apple.com/app-store/marketing/guidelines/)
- [Google Play Badge Generator](https://play.google.com/intl/en_us/badges/)

### Store URLs

Update in components or create environment variables:

```env
NEXT_PUBLIC_APP_STORE_URL=https://apps.apple.com/app/avalo
NEXT_PUBLIC_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.avalo.app
```

---

## QR Code

### Generate QR Code

For the DownloadSection, generate a QR code pointing to your landing page:

```bash
# Using qrencode
qrencode -o public/qr-code.png "https://avalo.app"

# Or online tools:
# - QR Code Generator (https://www.qr-code-generator.com/)
# - QRCode Monkey (https://www.qrcode-monkey.com/)
```

Update `DownloadSection.tsx`:

```tsx
<img 
  src="/qr-code.png" 
  alt="Download Avalo" 
  className="w-64 h-64 rounded-2xl"
/>
```

---

## Social Media Links

Update social media URLs in `MarketingFooter.tsx`:

```tsx
const socialLinks = {
  twitter: 'https://twitter.com/avaloapp',
  instagram: 'https://instagram.com/avaloapp',
  facebook: 'https://facebook.com/avaloapp',
  linkedin: 'https://linkedin.com/company/avaloapp',
};
```

---

## SEO & Meta Tags

Add to your layout or page:

```tsx
export const metadata = {
  title: 'Avalo – Where Authentic Connections Pay Off',
  description: 'Experience the next generation of social networking with AI companions, creator monetization, and quality conversations.',
  keywords: 'social, chat, dating, AI, creators, tokens, tips, earn',
  openGraph: {
    title: 'Avalo – Social, Chat & AI',
    description: 'Meet, Chat & Earn with Avalo',
    images: ['/og-cover.png'],
    locale: 'en_US',
    alternateLocale: ['pl_PL'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Avalo – Social, Chat & AI',
    description: 'Meet, Chat & Earn with Avalo',
    images: ['/og-cover.png'],
  },
};
```

---

## Performance Optimization

### Images

Use Next.js Image component for store badges:

```tsx
import Image from 'next/image';

<Image 
  src="/badges/app-store-badge.svg"
  alt="Download on App Store"
  width={180}
  height={60}
  priority
/>
```

### Code Splitting

Components are client-side only (`'use client'`). Consider splitting large sections:

```tsx
import dynamic from 'next/dynamic';

const CreatorSection = dynamic(() => import('../components/CreatorSection'), {
  loading: () => <div>Loading...</div>,
});
```

### Analytics

Add tracking to CTA buttons:

```tsx
onClick={() => {
  gtag('event', 'download_click', {
    platform: 'ios',
    location: 'hero',
  });
}}
```

---

## Accessibility

All components follow WCAG 2.1 AA standards:
- ✅ Semantic HTML
- ✅ ARIA labels on links
- ✅ Keyboard navigation
- ✅ Focus indicators
- ✅ Sufficient color contrast
- ✅ Alt text on images

### Testing

```bash
# Install axe-core
npm install --save-dev @axe-core/react

# Run accessibility tests
npm run test:a11y
```

---

## Browser Support

Tested and working on:
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

### Fallbacks

For older browsers, add:

```css
/* Add to globals.css */
@supports not (backdrop-filter: blur(20px)) {
  .backdrop-blur-md {
    background-color: rgba(255, 255, 255, 0.95);
  }
}
```

---

## Testing

### Manual Testing Checklist

- [ ] Hero section displays correctly
- [ ] All sections visible without scrolling issues
- [ ] Language switcher works (EN ↔ PL)
- [ ] Store badges link to correct URLs
- [ ] Footer links navigate properly
- [ ] Responsive on mobile (375px width)
- [ ] Responsive on tablet (768px width)
- [ ] Responsive on desktop (1920px width)
- [ ] Dark mode works (if enabled)
- [ ] All text is readable
- [ ] Gradients render smoothly
- [ ] Animations perform well

### Automated Testing

```tsx
// __tests__/MarketingHero.test.tsx
import { render, screen } from '@testing-library/react';
import { MarketingHero } from '../components/MarketingHero';
import { LocaleProvider } from '../components/LocaleProvider';

test('renders hero title', () => {
  render(
    <LocaleProvider>
      <MarketingHero />
    </LocaleProvider>
  );
  
  expect(screen.getByText(/AVALO/i)).toBeInTheDocument();
});
```

---

## Deployment

### Build

```bash
cd web
npm run build
```

### Environment Variables

```env
# .env.production
NEXT_PUBLIC_SITE_URL=https://avalo.app
NEXT_PUBLIC_APP_STORE_URL=...
NEXT_PUBLIC_PLAY_STORE_URL=...
```

### Vercel Deployment

```bash
vercel --prod
```

### Custom Server

```bash
npm run build
npm run start
```

---

## Troubleshooting

### Issue: Gradient not showing

**Solution:** Ensure Tailwind is configured for arbitrary values:

```js
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  safelist: [
    'from-[#FF6B00]',
    'via-[#FF3C8E]',
    'to-[#7B2EFF]',
  ],
};
```

### Issue: Locale not persisting

**Solution:** Check localStorage is enabled and not blocked by browser.

### Issue: Store badges not clickable

**Solution:** Verify URLs are correct and links have proper `href` attributes.

---

## Support

For issues or questions:
- Email: dev@avalo.app
- Internal: #marketing Slack channel
- Docs: https://docs.avalo.app

---

## License

Proprietary - Avalo Internal Use Only

© 2024 Avalo. All rights reserved.