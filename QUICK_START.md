# Avalo UI - Quick Start Guide

## Prerequisites

- Node.js 18+ installed
- npm or pnpm installed
- Expo CLI (will be installed with dependencies)
- Firebase CLI installed: `npm install -g firebase-tools`

## 1. Install Dependencies

```bash
# Install root dependencies (Expo mobile app)
npm install

# Install web dependencies
cd web
npm install
cd ..
```

## 2. Start Development

### Option A: Run Everything Together

```bash
npm run dev
```

This starts:
- ✅ Firebase emulators (Firestore, Auth, Functions)
- ✅ Expo development server (Mobile app)
- ✅ Next.js development server (Web app)

### Option B: Run Individually

**Mobile only:**
```bash
npm start
# Then press 'i' for iOS simulator or 'a' for Android emulator
```

**Web only:**
```bash
npm run web:dev
# Opens at http://localhost:3000
```

**Firebase emulators only:**
```bash
npm run emulators
# Emulators at http://localhost:4000
```

## 3. View Your Apps

### Mobile (Expo)
- iOS Simulator: Press `i` in the terminal
- Android Emulator: Press `a` in the terminal
- Physical Device: Scan QR code with Expo Go app

### Web (Next.js)
- Open browser: http://localhost:3000

### Firebase UI
- Emulator UI: http://localhost:4000

## 4. Project Structure

```
avaloapp/
├── packages/ui/          # Shared design system
├── app/                  # Expo mobile app
│   ├── theme/           # Theme bindings
│   ├── components/      # Reusable components
│   └── (tabs)/          # App screens
├── web/                  # Next.js website
│   └── src/
│       ├── app/         # Pages
│       └── components/  # React components
└── functions/            # Firebase Cloud Functions
```

## 5. Key Features Implemented

### Mobile (Expo)
✅ Gradient backgrounds with animations
✅ Glass effect cards
✅ Gradient buttons with press effects
✅ Avatar rings with spinning gradients
✅ Dark mode support
✅ Animated feed cards

### Web (Next.js)
✅ Marketing homepage
✅ Download page with QR code
✅ Privacy & Terms pages
✅ System status page
✅ Responsive navigation
✅ Dark mode toggle
✅ SEO optimizations

## 6. Common Commands

```bash
# Development
npm start              # Start Expo
npm run web:dev        # Start Next.js
npm run dev            # Start everything

# Type checking
npm run typecheck      # Check TypeScript

# Code quality
npm run lint           # Run ESLint
npm run format         # Format with Prettier

# Building
npm run web:build      # Build Next.js for production
npm run mobile:build:android   # Build Android APK/AAB
npm run mobile:build:ios      # Build iOS IPA

# Deployment
npm run deploy         # Deploy to Firebase
```

## 7. Design System Usage

### In Expo (Mobile)

```tsx
import { GradientBackground } from '../components/GradientBackground';
import { GradientButton } from '../components/GradientButton';
import { GlassCard } from '../components/GlassCard';
import { useThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/theme';

function MyScreen() {
  const colors = useThemeColors();
  
  return (
    <>
      <GradientBackground variant="primary" animate />
      <GlassCard>
        <Text style={{ color: colors.text, ...typography.h3 }}>
          Hello Avalo!
        </Text>
        <GradientButton 
          title="Get Started"
          onPress={() => {}}
          variant="primary"
        />
      </GlassCard>
    </>
  );
}
```

### In Next.js (Web)

```tsx
import { GradientSection } from '@/components/GradientSection';
import { CTAButton } from '@/components/CTAButton';
import { GlassCard } from '@/components/GlassCard';

export default function Page() {
  return (
    <>
      <GradientSection variant="primary" animate>
        <h1 className="text-5xl font-bold text-white">
          Hello Avalo!
        </h1>
        <CTAButton href="/download">Get Started</CTAButton>
      </GradientSection>
      
      <GlassCard>
        <p>Glass effect content</p>
      </GlassCard>
    </>
  );
}
```

## 8. Environment Setup

Create `.env.local` in root (if not exists):
```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=avalo-c8c46.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=avalo-c8c46
```

Create `web/.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=avalo-c8c46.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=avalo-c8c46
```

## 9. Customizing the Design

### Change Colors
Edit `packages/ui/src/tokens/colors.ts`

### Change Typography
Edit `packages/ui/src/tokens/typography.ts`

### Change Spacing
Edit `packages/ui/src/tokens/spacing.ts`

Changes will automatically apply to both mobile and web!

## 10. Troubleshooting

**Clear Expo cache:**
```bash
expo start -c
```

**Clear Next.js cache:**
```bash
cd web && rm -rf .next && npm run dev
```

**Reinstall dependencies:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**TypeScript errors:**
```bash
npm run typecheck
```

## 11. Next Steps

1. ✅ Install dependencies
2. ✅ Start development servers
3. ✅ View mobile app in simulator/emulator
4. ✅ View web app in browser
5. 📝 Customize colors and branding
6. 📝 Generate app icons and splash screens
7. 📝 Configure deep links
8. 📝 Build and test production apps
9. 📝 Deploy to Firebase
10. 📝 Submit to App Store and Play Store

## Need Help?

Check the full documentation: [`AVALO_UI_IMPLEMENTATION.md`](./AVALO_UI_IMPLEMENTATION.md)

---

**You're ready to build! 🚀**