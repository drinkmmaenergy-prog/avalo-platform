# Avalo Screenshot Generator

Automated screenshot generator for App Store and Google Play listings with gradient backgrounds, device frames, and localized captions.

## Installation

```bash
cd marketing/screenshots
npm install
```

## Usage

### Generate all screenshots (both platforms, both locales)
```bash
npm run generate
```

### Generate for specific platform
```bash
npm run generate:ios      # iOS only
npm run generate:android  # Android only
```

### Generate for specific locale
```bash
npm run generate:en       # English only
npm run generate:pl       # Polish only
```

### Custom combinations
```bash
node generate-screenshots.js --platform=ios --locale=pl
```

## Output

Screenshots are saved to `./output/` with naming convention:
```
avalo_[platform]_[screen-id]_[locale]_[dimensions].png
```

Examples:
- `avalo_ios_01_hero_en_1290x2796.png`
- `avalo_android_03_chat_pl_1080x2340.png`

## Screenshot Types

1. **Hero** - Welcome screen with gradient and tagline
2. **Discovery** - Feed with profile cards
3. **Chat** - Message interface with token indicator
4. **Wallet** - Balance and transaction history
5. **AI** - AI companion chat interface
6. **Profile** - User profile with verification badges
7. **Earnings** - Creator dashboard and earnings
8. **Safety** - Verification and safety features

Each screenshot is generated in both English and Polish with appropriate captions.

## Customization

Edit `generate-screenshots.js` to customize:
- Colors in `CONFIG.gradient`
- Dimensions in `CONFIG.ios` and `CONFIG.android`
- Screenshot content in generator functions
- Captions in `SCREENSHOTS` array

## Manual Alternative

If you prefer to capture actual app screens:

1. Run the app on simulator/emulator at target resolution
2. Navigate to each screen
3. Capture screenshots
4. Use Figma or Photoshop to add caption bars
5. Follow specs in `screenshot-specifications.md`

## Requirements

- Node.js 14+ with npm
- Canvas library (automatically installed)
- At least 100MB free disk space for output

## Troubleshooting

### Canvas installation fails
Install system dependencies:

**macOS:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

**Windows:**
No additional setup needed - canvas includes prebuilt binaries.

### Generated images look pixelated
This is expected behavior - increase canvas dimensions in CONFIG if needed. The generated screenshots are meant as mockups. For production, use actual app captures or design in Figma.

## License

Proprietary - Avalo Internal Use Only