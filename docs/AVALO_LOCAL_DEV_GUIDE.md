# Avalo Local Development Guide

## Quick Start

### Prerequisites
- Node.js 20+
- Firebase CLI
- Git
- VS Code (recommended)

### Initial Setup

```bash
# Clone repository
git clone https://github.com/avalo/avaloapp.git
cd avaloapp

# Install dependencies
npm install
cd functions && npm install && cd ..
cd app && npm install && cd ..

# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Setup emulators
firebase init emulators
```

### Configuration

Create `.env` files:

**Root `.env`:**
```env
FIREBASE_PROJECT_ID=avalo-dev
NODE_ENV=development
```

**`functions/.env`:**
```env
OPENAI_API_KEY=sk-test-xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

**`app/.env`:**
```env
EXPO_PUBLIC_FIREBASE_API_KEY=xxx
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=avalo-dev.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=avalo-dev
```

## Running Locally

### Start All Services

```bash
# Start Firebase emulators + mock services
npm run dev:sync
```

This starts:
- Firebase Auth Emulator (port 9099)
- Firestore Emulator (port 8080)
- Functions Emulator (port 5001)
- Storage Emulator (port 9199)
- Emulator UI (port 4000)
- Mock AI Service (port 7001)
- Mock Payments Service (port 7002)
- Mock Wallet Service (port 7003)
- Debug Dashboard (port 7777)

### Individual Services

```bash
# Backend only
npm run dev:backend

# Frontend only (mobile)
cd app && npm start

# Frontend only (web)
cd web && npm run dev

# Mock services only
npm run dev:mocks
```

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/new-feature

# Start dev environment
npm run dev:sync

# Make changes
# Functions hot-reload automatically

# Test locally
npm test

# Commit when ready
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature
```

### 2. Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:unit
npm run test:integration
npm run test:e2e

# Test with emulators
npm run test:emulator

# Test specific function
cd functions
npm test -- auth.test.ts
```

### 3. Debugging

**VS Code Configuration** (`.vscode/launch.json`):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Functions",
      "port": 9229,
      "restart": true
    }
  ]
}
```

**Start debugging:**
```bash
# Start functions in debug mode
npm run debug:functions

# Attach VS Code debugger (F5)
```

### 4. Database Management

```bash
# Import test data
firebase emulators:exec "npm run seed:data"

# Export data
firebase emulators:export ./emulator-data

# Import data
firebase emulators:start --import ./emulator-data

# Clear all data
firebase emulators:exec "npm run clear:data"
```

## Mock Services

### Mock AI Service

Simulates OpenAI API at `http://localhost:7001`

**Features:**
- Instant responses
- Configurable latency
- Error simulation
- Multiple personalities

**Configuration:**
```env
MOCK_AI_PORT=7001
MOCK_AI_LATENCY=200
MOCK_AI_ERROR_RATE=0.02
```

### Mock Payments Service

Simulates Stripe API at `http://localhost:7002`

**Features:**
- Payment intents
- Subscriptions
- Refunds
- Webhooks

**Test Cards:**
```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Insufficient: 4000 0000 0000 9995
```

### Mock Wallet Service

Simulates wallet operations at `http://localhost:7003`

**Features:**
- Balance management
- Transaction history
- No real money

## Debug Dashboard

Access at `http://localhost:7777/debug`

**Features:**
- Service health status
- Emulator status
- Environment variables
- Function logs
- Request inspector

## Common Tasks

### Add New Function

```typescript
// functions/src/myNewFunction.ts
import { onRequest } from 'firebase-functions/v2/https';

export const myNewFunction = onRequest(async (req, res) => {
  res.json({ message: 'Hello from my function!' });
});
```

```typescript
// functions/src/index.ts
export { myNewFunction } from './myNewFunction';
```

### Update Firestore Rules

```bash
# Edit firestore.rules
# Deploy to emulator (automatic with dev:sync)

# Test rules
firebase emulators:exec "npm run test:rules"
```

### Add Test Data

```typescript
// Create seed script
async function seedUsers() {
  const db = admin.firestore();
  
  for (let i = 0; i < 10; i++) {
    await db.collection('users').add({
      displayName: `User ${i}`,
      email: `user${i}@test.com`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}
```

```bash
# Run seed script
npm run seed:users
```

## Troubleshooting

### Emulators Won't Start

```bash
# Kill existing processes
npx kill-port 4000 5001 8080 9099

# Clear emulator data
rm -rf .firebase/emulators

# Restart
firebase emulators:start
```

### Functions Not Updating

```bash
# Clear function cache
rm -rf functions/lib
rm -rf functions/node_modules/.cache

# Rebuild
cd functions && npm run build

# Restart emulators
firebase emulators:start
```

### Database Connection Issues

```bash
# Check Firestore emulator
curl http://localhost:8080

# Reinitialize
firebase setup:emulators:firestore

# Check firestore.rules syntax
firebase deploy --only firestore:rules --dry-run
```

### Port Already in Use

```bash
# Find process using port
netstat -ano | findstr :5001

# Kill process (Windows)
taskkill /PID {pid} /F

# Kill process (Mac/Linux)
kill -9 {pid}
```

## Performance Testing

### Load Testing

```bash
# Run load tests
cd tests/load
npm run load:test

# Custom load
npm run load:test -- --users=1000 --duration=60s
```

### Profiling

```bash
# Profile functions
NODE_ENV=development node --prof functions/lib/index.js

# Analyze profile
node --prof-process isolate-xxx-v8.log > profile.txt
```

## Best Practices

### Do's
✅ Use emulators for all development
✅ Test with realistic data
✅ Clear data between test runs
✅ Use debug dashboard
✅ Keep mocks updated
✅ Run tests before committing

### Don'ts
❌ Don't commit `.env` files
❌ Don't use production credentials
❌ Don't skip tests
❌ Don't develop against production
❌ Don't commit debug code

## VS Code Extensions

Recommended:
- Firebase (Firebase)
- ESLint (Microsoft)
- Prettier (Prettier)
- TypeScript (Microsoft)
- GitLens (GitKraken)

## Keyboard Shortcuts

- `Ctrl+Shift+P`: Command palette
- `F5`: Start debugging
- `Ctrl+C`: Stop process
- `Ctrl+Shift+`: New terminal

## Resources

- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [React Native Debugging](https://reactnative.dev/docs/debugging)
- [Next.js Development](https://nextjs.org/docs)