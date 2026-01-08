# PACK 433 — Creator Marketplace Admin Dashboard

## Overview

This directory contains the admin dashboard screens for managing the Creator Marketplace.

## Screens

### 1. Dashboard (`dashboard.tsx`)
Main overview dashboard showing:
- Total creators & active creators
- Pending approvals requiring review
- Total revenue & payouts
- Average conversion rate
- Top performing creators table
- Fraud alerts & risk scores

### 2. Creator Overview (TODO)
- Individual creator profile details
- Performance metrics
- Active deals
- Fraud history
- Payout history

### 3. Deals Manager (TODO)
- Create new deals
- View all creator deals
- Edit deal terms
- Pause/Resume deals
- View deal performance

### 4. Attribution Panel (TODO)
- View all attributions
- Filter by creator/deal
- Track conversion funnel
- Identify high-performing sources

### 5. Fraud Signals Dashboard (TODO)
- Real-time fraud alerts
- Review pending signals
- View creator risk scores
- Manage blacklist/suspensions

### 6. Payout Control (TODO)
- Approve pending payouts
- View payout history
- Place fraud holds
- Generate tax reports

## Integration Guide

To integrate the Creator Dashboard into the admin panel:

1. Add route in admin router:
```typescript
import CreatorDashboard from './creators/dashboard';

// In router config
{
  path: '/creators',
  element: <CreatorDashboard />
}
```

2. Add navigation menu item:
```typescript
{
  title: 'Creator Marketplace',
  path: '/creators',
  icon: <PeopleIcon />
}
```

3. Ensure Firebase Cloud Functions are deployed with PACK 433 functions

4. Configure proper admin permissions for accessing creator data

## Required Permissions

- `admin.creators.view` - View creator data
- `admin.creators.approve` - Approve/reject creator applications
- `admin.deals.manage` - Create and manage deals
- `admin.payouts.manage` - Approve payouts
- `admin.fraud.review` - Review fraud signals

## API Integration

The dashboard integrates with these Cloud Functions:
- `discoverCreators` - Load creator list
- `getCreatorProfile` - Get individual creator details
- `approveCreator` - Approve pending applications
- `updateCreatorStatus` - Suspend/ban creators
- `getCreatorDeals` - Load creator deals
- `getCreatorFraudSignals` - Load fraud signals
- `getCreatorRiskScore` - Get risk assessment
- `processPayout` - Approve payout requests

## Development

```bash
cd admin-web
npm install
npm run dev
```

## Future Enhancements

- Real-time dashboard updates via Firestore listeners
- Advanced filtering & search
- Bulk operations (approve multiple creators, etc.)
- Export reports (CSV, PDF)
- Creator messaging system
- Automated deal recommendations
- A/B testing for deal terms
