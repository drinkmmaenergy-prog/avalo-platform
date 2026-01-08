# Web Onboarding Implementation — PACK 205A

**Version:** 205A  
**Effective Date:** 2025-12-01  
**Platform:** Web Application

---

## Implementation Overview

This document provides implementation guidelines for web onboarding screens using PACK 205A messaging.

---

## Translation Keys

### Required Keys in i18n Files

```typescript
// Onboarding Steps
onboarding.step1Title = "Meet people you like. Build chemistry."
onboarding.step1Description = "Dating should feel exciting — not stressful."

onboarding.step2Title = "Flirting and romance are welcome here."
onboarding.step2Description = "Safety, consent and respect are non-negotiable."

onboarding.step3Title = "Creators can earn from their time, attention and presence."
onboarding.step3Description = "Sexual services and explicit content are strictly prohibited."

// Safety Step
onboarding.safetyStep.title = "Safety & Respect"
onboarding.safetyStep.line1 = "Romance and attraction are allowed."
onboarding.safetyStep.line2 = "Nudity and sexual services are not allowed."
onboarding.safetyStep.line3 = "Age 18+ only. Identity verification is required to protect all users."
onboarding.safetyStep.agreeButton = "I Agree & Continue"

// Brand Identity
brandIdentity.attraction.title = "Attraction"
brandIdentity.attraction.description = "chemistry, desire, connection"

brandIdentity.lifestyle.title = "Lifestyle"
brandIdentity.lifestyle.description = "nightlife, travel, restaurants, fun"

brandIdentity.freedom.title = "Freedom"
brandIdentity.freedom.description = "self-expression and autonomy"

brandIdentity.premium.title = "Premium"
brandIdentity.premium.description = "aesthetic, confident, elegant"

brandIdentity.community.title = "Community"
brandIdentity.community.description = "belonging and social discovery"

brandIdentity.safety.title = "Safety"
brandIdentity.safety.description = "consent, report, verification"
```

---

## Component Structure

### Onboarding Flow

```typescript
// app-web/app/onboarding/page.tsx

import { useTranslation } from 'next-i18next';
import { useState } from 'react';

export default function OnboardingPage() {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: t('onboarding.step1Title'),
      description: t('onboarding.step1Description'),
    },
    {
      title: t('onboarding.step2Title'),
      description: t('onboarding.step2Description'),
    },
    {
      title: t('onboarding.step3Title'),
      description: t('onboarding.step3Description'),
    },
  ];

  return (
    <div className="onboarding-container">
      <div className="onboarding-progress">
        {steps.map((_, index) => (
          <div
            key={index}
            className={`progress-dot ${index === currentStep ? 'active' : ''}`}
          />
        ))}
      </div>

      <div className="onboarding-content">
        <h1 className="onboarding-title">{steps[currentStep].title}</h1>
        <p className="onboarding-description">{steps[currentStep].description}</p>
      </div>

      <div className="onboarding-actions">
        {currentStep > 0 && (
          <button onClick={() => setCurrentStep(currentStep - 1)}>
            {t('common.back')}
          </button>
        )}
        <button onClick={() => setCurrentStep(currentStep + 1)}>
          {currentStep === steps.length - 1 ? t('common.continue') : t('common.next')}
        </button>
      </div>
    </div>
  );
}
```

### Safety Step Component

```typescript
// app-web/app/onboarding/safety-step.tsx

import { useTranslation } from 'next-i18next';

export default function SafetyStep({ onAccept }: { onAccept: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="safety-step">
      <h2 className="safety-title">{t('onboarding.safetyStep.title')}</h2>
      
      <div className="safety-content">
        <p className="safety-line">{t('onboarding.safetyStep.line1')}</p>
        <p className="safety-line">{t('onboarding.safetyStep.line2')}</p>
        <p className="safety-line">{t('onboarding.safetyStep.line3')}</p>
      </div>

      <button className="safety-button" onClick={onAccept}>
        {t('onboarding.safetyStep.agreeButton')}
      </button>
    </div>
  );
}
```

---

## Styling Guidelines

### CSS Variables (Tailwind Config)

```typescript
// tailwind.config.ts

module.exports = {
  theme: {
    extend: {
      colors: {
        'avalo-pink': '#FF69B4',
        'avalo-purple': '#6B46C1',
        'avalo-navy': '#1E3A8A',
        'avalo-gold': '#FFD700',
        'avalo-emerald': '#059669',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
```

### Component Styles

```css
/* app-web/styles/onboarding.css */

.onboarding-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
}

.onboarding-progress {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 3rem;
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #e0e0e0;
  transition: all 0.3s ease;
}

.progress-dot.active {
  width: 24px;
  background-color: #FF69B4;
  border-radius: 4px;
}

.onboarding-content {
  max-width: 600px;
  text-align: center;
  margin-bottom: 3rem;
}

.onboarding-title {
  font-size: 2rem;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 1rem;
  line-height: 1.2;
}

.onboarding-description {
  font-size: 1.125rem;
  color: #4a4a4a;
  line-height: 1.6;
}

.onboarding-actions {
  display: flex;
  gap: 1rem;
  width: 100%;
  max-width: 400px;
}

.onboarding-actions button {
  flex: 1;
  padding: 1rem;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.onboarding-actions button:first-child {
  background-color: #f5f5f5;
  color: #1a1a1a;
  border: none;
}

.onboarding-actions button:last-child {
  background-color: #FF69B4;
  color: white;
  border: none;
}

.onboarding-actions button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Safety Step Styles */

.safety-step {
  max-width: 600px;
  padding: 2rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.safety-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 1.5rem;
  text-align: center;
}

.safety-content {
  margin-bottom: 2rem;
}

.safety-line {
  font-size: 1rem;
  color: #4a4a4a;
  line-height: 1.6;
  margin-bottom: 1rem;
  padding-left: 1.5rem;
  position: relative;
}

.safety-line::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: #059669;
  font-weight: 700;
}

.safety-button {
  width: 100%;
  padding: 1rem;
  background-color: #FF69B4;
  color: white;
  border: none;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.safety-button:hover {
  background-color: #FF1493;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 105, 180, 0.3);
}
```

---

## Static Pages

### About Page

```typescript
// app-web/app/about/page.tsx

import { useTranslation } from 'next-i18next';

export default function AboutPage() {
  const { t } = useTranslation();

  const brandPillars = [
    'attraction',
    'lifestyle',
    'freedom',
    'premium',
    'community',
    'safety',
  ];

  return (
    <div className="about-page">
      <section className="hero">
        <h1>{t('messages.welcome.title')}</h1>
        <p>{t('messages.welcome.subtitle')}</p>
      </section>

      <section className="brand-pillars">
        <h2>What Makes Avalo Different</h2>
        <div className="pillars-grid">
          {brandPillars.map((pillar) => (
            <div key={pillar} className="pillar-card">
              <h3>{t(`brandIdentity.${pillar}.title`)}</h3>
              <p>{t(`brandIdentity.${pillar}.description`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

### Footer Links

```typescript
// app-web/components/Footer.tsx

import Link from 'next/link';
import { useTranslation } from 'next-i18next';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="site-footer">
      <div className="footer-links">
        <Link href="/legal/terms">{t('settings.termsOfService')}</Link>
        <Link href="/legal/privacy">{t('settings.privacyPolicy')}</Link>
        <Link href="/legal/safety">{t('legal.safety')}</Link>
        <Link href="/about">{t('settings.about')}</Link>
      </div>
      <div className="footer-copyright">
        © 2025 Avalo. All rights reserved.
      </div>
    </footer>
  );
}
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] All translation keys added to i18n files
- [ ] Onboarding components created
- [ ] Safety step implemented
- [ ] Static pages updated
- [ ] Footer links verified
- [ ] Styles applied and tested
- [ ] Mobile responsiveness verified

### Testing
- [ ] Onboarding flow tested in all browsers
- [ ] Translation switching tested
- [ ] Safety step acceptance tracked
- [ ] Analytics events firing correctly
- [ ] Error states handled
- [ ] Loading states implemented

### Legal Compliance
- [ ] ToS linked and accessible
- [ ] Privacy policy linked and accessible
- [ ] Safety policy linked and accessible
- [ ] Age gate implemented (18+)
- [ ] Identity verification flow ready

### Brand Consistency
- [ ] Messaging matches PACK 205A
- [ ] Visual identity consistent
- [ ] Tone and voice aligned
- [ ] No prohibited content references
- [ ] All pillars represented

---

## Analytics Events

```typescript
// Track onboarding progress

analytics.track('onboarding_step_viewed', {
  step_number: currentStep,
  step_name: steps[currentStep].title,
});

analytics.track('safety_step_accepted', {
  timestamp: new Date().toISOString(),
});

analytics.track('onboarding_completed', {
  total_time_seconds: completionTime,
});
```

---

## Notes

1. **No Hardcoded English:** All text must use translation keys
2. **Mobile-First:** Design for mobile, enhance for desktop
3. **Accessibility:** Ensure WCAG 2.1 AA compliance
4. **Performance:** Lazy load images, optimize bundle size
5. **SEO:** Use semantic HTML, meta tags for social sharing

---

**Implementation Status:** Reference Document  
**Last Updated:** 2025-12-01  
**Document Version:** 205A