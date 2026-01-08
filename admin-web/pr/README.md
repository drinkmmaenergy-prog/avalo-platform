# PACK 380 — PR & Influencer Management Admin Dashboard

## Overview

This module contains the admin web interface for managing PR campaigns, influencers, brand assets, and global expansion.

## Pages Structure

### PR Management
- **`/pr/campaigns`** - PR campaign overview and management
- **`/pr/releases`** - Press release creation and distribution
- **`/pr/contacts`** - Media contact management
- **`/pr/mentions`** - Press mentions and sentiment tracking
- **`/pr/analytics`** - PR performance analytics dashboard

### Influencer Management
- **`/influencers/applications`** - Review influencer applications
- **`/influencers/profiles`** - Manage active influencers
- **`/influencers/performance`** - Track influencer performance
- **`/influencers/payouts`** - Manage payouts and earnings
- **`/influencers/contracts`** - Contract management

### Brand Management
- **`/brand/assets`** - Brand asset library
- **`/brand/guidelines`** - Brand guidelines editor
- **`/brand/audit`** - Brand compliance audit history
- **`/brand/style-guide`** - Interactive style guide

### Localization & Expansion
- **`/localization/packs`** - Localized press packs
- **`/localization/regions`** - Region configuration
- **`/localization/glossary`** - Translation glossary
- **`/localization/analysis`** - Market expansion analysis

## Technology Stack

- **Framework**: React (or Next.js for server-side rendering)
- **State Management**: Redux or Context API
- **UI Library**: Material-UI or Ant Design
- **Charts**: Recharts or Chart.js
- **Firebase**: Firebase SDK for backend integration

## Installation

```bash
cd admin-web/pr
npm install
npm run dev
```

## Environment Variables

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
```

## Authentication

All admin pages require authentication with one of these roles:
- `admin` - Full access to all features
- `pr_manager` - Access to PR features
- `influencer_manager` - Access to influencer features
- `brand_manager` - Access to brand features
- `localization_manager` - Access to localization features

## Key Features

### PR Campaign Management
- Create and manage PR campaigns
- Generate press releases with templates
- Distribute to media contacts
- Track coverage and sentiment

### Influencer Dashboard
- Review applications with background checks
- Assign tier levels (Bronze, Silver, Gold, Royal Ambassador)
- Track performance metrics in real-time
- Process payouts automatically

### Brand Compliance
- Automated brand guideline checking
- Asset library with version control
- Compliance audit trail
- Style guide enforcement

### Global Expansion
- Multi-language support (42+ languages)
- Region-specific configurations
- Market opportunity analysis
- Localized content generation

## API Integration

All pages integrate with PACK 380 Cloud Functions:

### PR Functions
- `createPressRelease()`
- `distributePressRelease()`
- `addPressMention()`
- `addPressContact()`

### Influencer Functions
- `submitInfluencerApplication()`
- `reviewInfluencerApplication()`
- `trackInfluencerEvent()`
- `getInfluencerDashboard()`
- `updateInfluencerTier()`

### Brand Functions
- `uploadBrandAsset()`
- `getBrandAssets()`
- `scanBrandCompliance()`
- `createBrandGuideline()`
- `getBrandStyleGuide()`

### Localization Functions
- `createLocalizedPressPack()`
- `getLocalizedCreatorMaterials()`
- `createLocalizedPitchDeck()`
- `initializeRegionConfig()`
- `getMarketExpansionAnalysis()`

## Development Guidelines

1. **Authentication First**: Always check user role before rendering admin features
2. **Real-time Updates**: Use Firestore listeners for live data
3. **Responsive Design**: Ensure all dashboards work on tablet and desktop
4. **Accessibility**: Follow WCAG 2.1 AA standards
5. **Performance**: Lazy load heavy components and images
6. **Error Handling**: Provide clear error messages and fallbacks

## Component Examples

### PR Campaign Card
```typescript
interface PRCampaignCardProps {
  campaign: PRCampaign;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}
```

### Influencer Performance Chart
```typescript
interface InfluencerPerformanceChartProps {
  influencerId: string;
  period: string;
  metrics: ['installs', 'signups', 'revenue'];
}
```

### Brand Compliance Scanner
```typescript
interface BrandComplianceScannerProps {
  content: any;
  sourceType: string;
  onScanComplete: (result: ScanResult) => void;
}
```

## Deployment

Production build:
```bash
npm run build
npm run start
```

Deploy to Firebase Hosting:
```bash
firebase deploy --only hosting:admin
```

## Security

- All API calls require authentication tokens
- Role-based access control enforced at Firebase level
- Audit logs for all admin actions
- Rate limiting on sensitive operations

## Support

For technical support, contact the Avalo engineering team or refer to:
- [PACK_380_GLOBAL_PR_AND_INFLUENCER_ENGINE.md](../../PACK_380_GLOBAL_PR_AND_INFLUENCER_ENGINE.md)
- Firebase Functions documentation
- Internal Avalo API documentation
