# Avalo Web App

Full-featured web application for Avalo with complete mobile feature parity.

## 🚀 Features

### Core Features
- ✅ **Authentication**: Email, Phone, Google, Apple Sign-In
- ✅ **Feed System**: Stories, Reels, Posts with full interaction
- ✅ **Paid Chat**: Token-based messaging with media unlock
- ✅ **WebRTC**: 1:1 and group video/audio calls
- ✅ **Creator Dashboard**: Performance analytics and management
- ✅ **Token System**: Purchase, billing, and transactions
- ✅ **Subscriptions**: Multi-tier creator subscriptions
- ✅ **AI Companions**: Full conversational interface
- ✅ **Events**: Offline and virtual event management
- ✅ **Digital Products**: Creator marketplace
- ✅ **Brand Challenges**: Sponsored content opportunities
- ✅ **Ads System**: Display ads with targeting
- ✅ **Team Accounts**: Collaborative creator management
- ✅ **Safety**: NSFW filtering and content moderation
- ✅ **2FA**: High-risk role authentication
- ✅ **Localization**: Multi-language support

### PWA Features
- 📱 Installable as desktop/mobile app
- 🔄 Offline capability with service worker
- 📲 Push notifications
- 🔗 Deep linking support
- 📤 Share target integration

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand + React Query
- **Backend**: Firebase (Firestore, Functions, Storage)
- **Real-time**: Firebase Realtime Database
- **WebRTC**: Simple-peer
- **Animations**: Framer Motion

## 📦 Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🌐 Environment Variables

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# API Configuration
NEXT_PUBLIC_API_URL=https://us-central1-your-project.cloudfunctions.net
NEXT_PUBLIC_API_GATEWAY_URL=https://api.avalo.app

# App Configuration
NEXT_PUBLIC_APP_URL=https://avalo.app
NEXT_PUBLIC_ENV=production
```

## 📁 Project Structure

```
app-web/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── auth/              # Authentication pages
│   │   ├── feed/              # Feed and stories
│   │   ├── messages/          # Chat system
│   │   ├── profile/           # User profiles
│   │   ├── creator/           # Creator dashboard
│   │   ├── events/            # Events management
│   │   ├── store/             # Digital products
│   │   ├── ai/                # AI Companions
│   │   └── settings/          # App settings
│   ├── components/            # Reusable components
│   │   ├── ui/               # UI primitives
│   │   ├── feed/             # Feed components
│   │   ├── chat/             # Chat components
│   │   ├── creator/          # Creator components
│   │   └── providers/        # Context providers
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Core libraries
│   │   ├── firebase.ts       # Firebase initialization
│   │   ├── sdk.ts            # Avalo SDK
│   │   └── webrtc.ts         # WebRTC utilities
│   ├── store/                 # State management
│   ├── types/                 # TypeScript types
│   └── utils/                 # Utility functions
├── public/                    # Static assets
│   ├── icons/                # App icons
│   ├── manifest.json         # PWA manifest
│   └── sw.js                 # Service worker
└── next.config.js            # Next.js configuration
```

## 🔐 Security Features

### Zero Tokenomics Changes
- ✅ Token price identical to mobile (65/35 split maintained)
- ✅ No web-exclusive discounts or bonuses
- ✅ No platform advantages in discovery/ranking

### Safety Enforcement
- ✅ NSFW content filtering by region
- ✅ Automatic content scanning on upload
- ✅ Real-time sync with mobile enforcement
- ✅ Ban evasion prevention across platforms

### Data Protection
- ✅ No buyer identity exposure
- ✅ Encrypted sensitive data
- ✅ 2FA for high-risk roles
- ✅ Secure token storage

## 📱 Responsive Design

- **Mobile**: 320px - 767px (optimized for touch)
- **Tablet**: 768px - 1023px (hybrid layout)
- **Desktop**: 1024px+ (full dashboard)

## 🔄 Real-time Sync

All data synchronizes in real-time between web and mobile:
- Read receipts
- Message history
- Token balances
- Story views
- Feed interactions
- Notifications

## 🚀 Deployment

### Vercel (Recommended)
```bash
npm install -g vercel
vercel --prod
```

### Docker
```bash
docker build -t avalo-web .
docker run -p 3000:3000 avalo-web
```

### Manual
```bash
npm run build
npm start
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run E2E tests
npm run test:e2e

# Run linting
npm run lint

# Type checking
npm run type-check
```

## 📊 Performance

- Lighthouse Score: 95+
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.0s
- Cumulative Layout Shift: < 0.1

## 🌍 Browser Support

- Chrome/Edge: Last 2 versions
- Firefox: Last 2 versions
- Safari: Last 2 versions
- Mobile: iOS 13+, Android 8+

## 📝 API Integration

All API calls use the unified SDK that connects to:
- Firebase Cloud Functions
- API Gateway (PACK 113)
- Real-time Database
- Cloud Storage

## 🔗 Related Packages

- **PACK 113**: API Gateway
- **PACK 119**: Agency SaaS Panel
- **PACK 122**: Localization
- **PACK 123**: Team Accounts

## 🤝 Contributing

1. Follow TypeScript strict mode
2. Use semantic component naming
3. Maintain accessibility standards
4. Write unit tests for utilities
5. Document complex logic

## 📄 License

Proprietary - Avalo Inc.

## 🆘 Support

- Email: support@avalo.app
- Discord: discord.gg/avalo
- Docs: docs.avalo.app