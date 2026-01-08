# Avalo Desktop App

High-productivity desktop environment for creators and moderators using Electron + React.

## Features

### Core Features
- ✅ Full web app parity - All mobile/web features available
- ✅ Secure Electron wrapper with sandboxing
- ✅ Native desktop notifications
- ✅ Drag & drop file uploads
- ✅ Batch media uploader
- ✅ Video editing timeline
- ✅ Multi-account switching for teams
- ✅ Offline queue syncing
- ✅ Split-window layouts for moderators
- ✅ Auto-update system
- ✅ Device fingerprinting for security

### Desktop-Exclusive UX Improvements
- Drag & drop uploads with progress tracking
- Batch media uploader for creators
- System-level notifications
- Video editor with timeline
- Virtual event host panel
- Split-window workspace for teams

## Architecture

```
app-desktop/
├── src/
│   ├── electron/          # Main process
│   │   ├── main.ts        # Entry point
│   │   ├── window-manager.ts
│   │   ├── security/
│   │   │   └── security-manager.ts
│   │   ├── ipc/
│   │   │   ├── secure-bridge.ts
│   │   │   └── validators.ts
│   │   └── services/
│   │       ├── auto-updater.ts
│   │       ├── device-fingerprint.ts
│   │       ├── notifications.ts
│   │       └── offline-queue.ts
│   ├── preload/           # Preload scripts
│   │   └── index.ts
│   └── shared/            # Shared types
│       └── types.ts
├── dist/                  # Build output
├── release/               # Packaged apps
└── build/                 # Build resources
```

## Security

### Implemented Security Layers

1. **Content Security Policy (CSP)**
   - Blocks external scripts
   - Prevents XSS attacks
   - Whitelisted domains only

2. **Sandbox Mode**
   - Full Chromium sandbox enabled
   - No Node.js in renderer
   - Context isolation enforced

3. **IPC Security**
   - Whitelist-based channel access
   - Input validation and sanitization
   - Rate limiting on sensitive operations

4. **Device Fingerprinting**
   - Hardware-based device ID
   - Risk scoring system
   - Suspicious activity detection

5. **Certificate Validation**
   - Custom certificate pinning
   - Domain whitelist enforcement
   - Development mode exceptions

## Development

### Prerequisites
```bash
Node.js >= 18.0.0
npm or pnpm
```

### Install Dependencies
```bash
cd app-desktop
npm install
```

### Development Mode
```bash
# Run both Electron and Web app
npm run dev

# Run Electron only (requires web app on port 3000)
npm run dev:electron
```

### Build
```bash
# Build for current platform
npm run build
npm run package

# Build for specific platforms
npm run package:win    # Windows
npm run package:mac    # macOS
npm run package:linux  # Linux
```

## Usage

### Using Desktop API in Web App

The desktop app exposes APIs through `window.electronAPI`:

```typescript
// Check if running in desktop
if (window.electronAPI) {
  // Desktop-specific features available
}

// Upload files
const result = await window.electronAPI.uploadFiles(files);

// Batch upload
const batch = await window.electronAPI.batchUpload(files);

// Show notification
await window.electronAPI.showNotification({
  title: 'New Message',
  body: 'You have a new message from Alice'
});

// Switch account (team mode)
await window.electronAPI.switchAccount(accountId);

// Export video
await window.electronAPI.exportVideo({
  format: 'mp4',
  quality: '1080p'
});

// Get offline queue
const queue = await window.electronAPI.getOfflineQueue();

// Check for updates
const update = await window.electronAPI.checkForUpdates();
```

### IPC Channels

Available IPC channels:

```typescript
// Ping (no auth required)
'desktop:ping'

// Device info (requires auth)
'desktop:getDeviceInfo'

// File operations (requires auth, rate limited)
'desktop:uploadFiles'
'desktop:batchUpload'

// Offline queue (requires auth)
'desktop:getOfflineQueue'
'desktop:addToOfflineQueue'
'desktop:processOfflineQueue'

// Notifications (requires auth)
'desktop:showNotification'

// Account management (requires auth)
'desktop:switchAccount'
'desktop:getAccounts'

// Split view (requires auth)
'desktop:openSplitView'
'desktop:closeSplitView'

// Video editing (requires auth, rate limited)
'desktop:exportVideo'

// Updates (no auth required)
'desktop:checkForUpdates'
```

## Token Economy Parity

**IMPORTANT**: Desktop app maintains 100% parity with mobile/web:

- ❌ No exclusive monetization features
- ❌ No visibility or ranking boosts
- ❌ No token discounts or bonuses
- ❌ No cheaper purchases
- ✅ Same 65/35 split (creator/Avalo)
- ✅ Same token prices
- ✅ Same moderation pipeline
- ✅ All payments through Avalo infrastructure

Desktop is a **convenience surface**, not a new business model.

## Configuration

### Environment Variables

```env
NODE_ENV=development|production
STORE_ENCRYPTION_KEY=your-encryption-key
```

### Electron Builder

Configuration in `package.json`:

```json
{
  "build": {
    "appId": "com.avalo.desktop",
    "productName": "Avalo",
    "directories": {
      "buildResources": "build",
      "output": "release"
    },
    "files": ["dist/**/*", "package.json"],
    "mac": {
      "category": "public.app-category.social-networking",
      "target": ["dmg", "zip"]
    },
    "win": {
      "target": ["nsis", "portable"]
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Network"
    }
  }
}
```

## Offline Mode

### Supported Offline Operations
- ✅ Media creation & editing
- ✅ Draft content preparation
- ✅ Queue management

### Requires Online
- ❌ Messaging
- ❌ Content posting
- ❌ Token transactions
- ❌ Profile updates
- ❌ Moderation actions

Offline content waits in queue until connection resumes.

## Auto-Updates

Auto-update system checks every 4 hours in production:

```typescript
// Manual check
await window.electronAPI.checkForUpdates();

// Listen for updates
window.electronAPI.on('update:available', (info) => {
  console.log('Update available:', info.version);
});

window.electronAPI.on('update:downloaded', () => {
  console.log('Update ready to install');
});
```

## Team Accounts

Multi-account switching for team management:

```typescript
// Get all accounts
const accounts = await window.electronAPI.getAccounts();

// Switch to different creator
await window.electronAPI.switchAccount(accountId);

// Open split view for monitoring
await window.electronAPI.openSplitView({
  layout: 'horizontal',
  panels: [
    { type: 'feed', url: '/feed' },
    { type: 'analytics', url: '/analytics' }
  ]
});
```

## Troubleshooting

### App won't start
- Check Node.js version >= 18.0.0
- Delete `node_modules` and reinstall
- Check console for errors

### Updates failing
- Check internet connection
- Verify update server accessibility
- Check firewall settings

### Upload errors
- Check file size limits (100MB max)
- Verify file types allowed
- Check available disk space

### Performance issues
- Enable hardware acceleration in settings
- Close unnecessary split views
- Clear cache and restart

## Contributing

See main Avalo project README for contribution guidelines.

## License

UNLICENSED - Private/Proprietary

## Support

For issues specific to desktop app:
- Check GitHub issues
- Contact support@avalo.com
- See documentation at docs.avalo.com