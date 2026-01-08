# Avalo – Icon & Banner Specifications

Complete specifications for app icon, feature graphics, promotional artwork, and web assets.

---

## 1. App Icon (1024×1024)

### Requirements

**iOS App Store:**
- Size: 1024 × 1024 pixels
- Format: PNG (no transparency)
- Color Space: sRGB or P3
- No alpha channel
- No rounded corners (iOS applies mask automatically)
- Safe area: Keep important elements within 820×820px center

**Google Play Store:**
- Size: 512 × 512 pixels (uploaded at 1024×1024, downscaled automatically)
- Format: PNG (32-bit)
- Can include transparency
- No rounded corners (Android applies mask automatically)
- Safe area: Keep important elements within 410×410px center

### Design Specifications

**Base Source:** `assets/icon.png` (current project icon)

**Recommended Design:**
```
┌─────────────────────────┐
│                         │
│    [Gradient BG]        │
│                         │
│      ╭─────╮            │
│      │  A  │            │  <- White 'A' monogram
│      ╰─────╯            │     with subtle shadow
│                         │
│    #FF6B00 → #7B2EFF   │  <- Brand gradient
│                         │
└─────────────────────────┘
```

### Design Elements

1. **Background:**
   - Full gradient: #FF6B00 → #FF3C8E → #7B2EFF (135° diagonal)
   - Smooth blend across entire icon
   - No textures or patterns

2. **Foreground:**
   - Option A: White "A" letterform (bold, modern sans-serif)
   - Option B: Abstract symbol representing connection (nodes/lines)
   - Option C: Chat bubble + sparkle combination
   - Size: 60% of icon size
   - Position: Centered
   - Color: #FFFFFF with 10% black shadow
   - Shadow: 0 4px 12px rgba(0,0,0,0.15)

3. **Details:**
   - Minimal design for scalability
   - High contrast for visibility at small sizes
   - No small text or fine details
   - Recognizable from 40×40px to 1024×1024px

### Export Settings

**From Figma/Sketch:**
- Export at 3x scale (3072×3072px) then downscale to 1024×1024px
- Use bicubic interpolation for downscaling
- Apply slight sharpen filter (radius: 0.5px)

**From Photoshop:**
- Create at 1024×1024px, 72 DPI
- Use RGB color mode
- Export as PNG-24
- Disable transparency (flatten to white)
- Metadata: None

**Color Profile:**
- sRGB IEC61966-2.1 (standard)
- OR Display P3 (if available, better for iOS)

### Testing Checklist

- [ ] Looks good at 1024×1024px (full size)
- [ ] Legible at 180×180px (iPhone App Library)
- [ ] Recognizable at 120×120px (Home screen)
- [ ] Distinct at 60×60px (Settings)
- [ ] Clear at 40×40px (Spotlight)
- [ ] Works in light and dark mode contexts
- [ ] Matches brand colors exactly
- [ ] No aliasing or compression artifacts
- [ ] File size under 1MB
- [ ] Passes App Store validation tool

---

## 2. Google Play Feature Graphic (1024×500)

### Requirements
- Dimensions: 1024 × 500 pixels
- Format: PNG or JPEG
- Max file size: 1 MB
- Displayed at top of Play Store listing

### Design Specifications

```
┌──────────────────────────────────────────────────┐
│  [Gradient Background]                           │
│                                                  │
│  AVALO                    [Phone Mockup]        │ ← Logo + Hero
│  Meet, Chat & Earn            📱                │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Layout

**Left Side (60%):**
- Avalo logo (white, 200px wide)
- Tagline: "Meet, Chat & Earn with Avalo"
- Typography: Bold 72pt / Regular 36pt
- Color: White with subtle shadow
- Padding: 80px from left edge

**Right Side (40%):**
- Phone mockup showing app interface
- Slight 3D rotation (15° Y-axis)
- Screen shows discovery feed or chat
- Device frame optional (can be frameless screenshot)

**Background:**
- Full gradient: #FF6B00 → #FF3C8E → #7B2EFF
- Apply subtle texture or mesh gradient for depth
- No distracting elements

### Export Settings
- PNG-24 or JPEG at 95% quality
- Optimize for file size (must be under 1MB)
- Test visibility on different devices

---

## 3. App Store Promotional Artwork (4320×1080) - Optional

### Requirements
- Dimensions: 4320 × 1080 pixels (4:1 aspect ratio)
- Format: PNG or JPEG
- Only for App Store (iOS 11+)
- Shown in Featured sections

### Design Specifications

Ultra-wide banner with three key selling points:

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│    💬 Smart Chat      🎨 Creator Tools     🔒 Safe & Verified │
│    Easy to earn       Real monetization    Trust first        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Layout:**
- Three equal sections (1440px each)
- Each section: Icon (200×200) + Headline + Subtext
- Gradient background spanning full width
- Typography: 96pt headlines, 48pt body
- Colors: White text on gradient

**Export:**
- PNG or JPEG, under 2MB
- High quality (95+ for JPEG)

---

## 4. Adaptive Icon (Android) - Optional Enhancements

### Additional Layers

**Foreground Layer:**
- The main "A" logo or symbol
- Transparent PNG
- 108 × 108 dp grid
- Safe area: 66 × 66 dp center

**Background Layer:**
- Gradient fill
- Can be color or image
- Must extend to full 108 × 108 dp (no safe area)

**Configuration:**
Update `app.json`:
```json
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/adaptive-icon.png",
    "backgroundColor": "#FF6B00"
  }
}
```

---

## 5. Web OG Image (1200×630)

### Requirements
- Dimensions: 1200 × 630 pixels (1.91:1 aspect ratio)
- Format: PNG or JPEG
- Max file size: 8 MB (recommend under 300 KB)
- Used for social media sharing (Facebook, Twitter, LinkedIn)

### Design Specifications

```
┌────────────────────────────────────────────────┐
│  [Gradient Background]                         │
│                                                │
│  AVALO.APP                                     │
│  Where Authentic Connections Pay Off           │
│                                                │
│  [App Interface Preview]                       │
│                                                │
└────────────────────────────────────────────────┘
```

**Layout:**
- Logo at top (centered or left-aligned)
- Tagline below logo
- Preview of app interface or key feature
- Gradient background
- High contrast for readability

**Typography:**
- Headline: 96pt bold
- Tagline: 48pt regular
- URL: 36pt medium (if included)

**Safe Areas:**
- Keep text and important elements in center 1000×470px
- Some platforms crop edges differently

**File Location:**
`web/public/og-cover.png`

**HTML Meta Tag:**
```html
<meta property="og:image" content="https://avalo.app/og-cover.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://avalo.app/og-cover.png" />
```

---

## 6. Additional Assets

### Favicon (Web)
- Size: 32×32, 64×64, 128×128, 256×256 pixels
- Format: ICO (multi-size) or PNG
- Simple, recognizable version of main icon
- Location: `web/public/favicon.ico`

### Apple Touch Icon (Web)
- Size: 180×180 pixels
- Format: PNG
- Used when users add website to home screen
- Location: `web/public/apple-touch-icon.png`

### Android Chrome Icon (Web)
- Sizes: 192×192 and 512×512 pixels
- Format: PNG
- Used for PWA installation
- Location: `web/public/android-chrome-*.png`

**Manifest Configuration:**
```json
{
  "name": "Avalo",
  "short_name": "Avalo",
  "icons": [
    {
      "src": "/android-chrome-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/android-chrome-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 7. Brand Assets Archive

### Recommended Structure
```
marketing/icons/
├── app-icon-1024.png          # Main app icon (iOS/Android)
├── app-icon-source.fig        # Figma source file
├── feature-graphic-1024x500.png
├── promo-artwork-4320x1080.png (optional)
├── og-image-1200x630.png
├── favicon/
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── favicon-64x64.png
│   └── favicon.ico
├── web-icons/
│   ├── apple-touch-icon-180x180.png
│   ├── android-chrome-192x192.png
│   └── android-chrome-512x512.png
└── versions/
    ├── app-icon-v1.0.png
    ├── app-icon-v1.1.png
    └── ...
```

---

## 8. Design Resources

### Color Codes (Copy-Paste Ready)
```
Primary Gradient:
#FF6B00 (Orange start)
#FF3C8E (Pink middle)
#7B2EFF (Purple end)

Text Colors:
#FFFFFF (White, primary text on gradient)
#111111 (Dark, for light backgrounds)

Background:
#0E0E10 (Dark mode)
#FFFFFF (Light mode)
```

### Gradient CSS
```css
background: linear-gradient(135deg, #FF6B00 0%, #FF3C8E 50%, #7B2EFF 100%);
```

### Gradient SVG
```xml
<linearGradient id="avaloGrad" gradientTransform="rotate(135)">
  <stop offset="0%" stop-color="#FF6B00" />
  <stop offset="50%" stop-color="#FF3C8E" />
  <stop offset="100%" stop-color="#7B2EFF" />
</linearGradient>
```

---

## 9. Quality Checklist

Before submitting any icon or banner:

### Visual Quality
- [ ] Colors match brand exactly (#FF6B00, #FF3C8E, #7B2EFF)
- [ ] No color banding in gradients
- [ ] High resolution, no pixelation
- [ ] Proper anti-aliasing on all edges
- [ ] No compression artifacts

### Technical Requirements
- [ ] Correct dimensions for each platform
- [ ] Proper file format (PNG for icons)
- [ ] File size within limits
- [ ] Color space: sRGB (or P3 for iOS)
- [ ] No transparency in iOS icon
- [ ] No alpha channel issues

### Brand Consistency
- [ ] Matches overall Avalo design system
- [ ] Typography consistent with app
- [ ] Recognizable and distinctive
- [ ] Works at all sizes
- [ ] Appropriate for target audience

### Platform Compliance
- [ ] Passes App Store validation
- [ ] Meets Google Play requirements
- [ ] No trademark violations
- [ ] No misleading imagery
- [ ] Appropriate content (no explicit imagery)

---

## 10. Update Schedule

**When to Update Icons:**
- Major rebrand or design refresh
- App name change
- Significant feature updates (show in promo artwork)
- Seasonal variations (optional, for special events)
- A/B testing different designs

**Version Control:**
- Keep all versions in `versions/` folder
- Name with date: `app-icon-2024-11-04.png`
- Document changes in changelog
- Export new versions for all sizes when updating

---

## 11. Export Automation Script

Create a batch export script for all sizes:

```bash
#!/bin/bash
# Export all icon sizes from source

SOURCE="app-icon-source.png"

# App Store
sips -z 1024 1024 $SOURCE --out app-icon-1024.png

# Google Play
sips -z 512 512 $SOURCE --out app-icon-512.png

# Favicons
sips -z 16 16 $SOURCE --out favicon/favicon-16x16.png
sips -z 32 32 $SOURCE --out favicon/favicon-32x32.png
sips -z 64 64 $SOURCE --out favicon/favicon-64x64.png

# Web icons
sips -z 180 180 $SOURCE --out web-icons/apple-touch-icon-180x180.png
sips -z 192 192 $SOURCE --out web-icons/android-chrome-192x192.png
sips -z 512 512 $SOURCE --out web-icons/android-chrome-512x512.png

echo "✓ All icons exported successfully"
```

---

## 12. Submission Checklist

### iOS App Store
- [ ] App icon (1024×1024) uploaded to App Store Connect
- [ ] Icon meets guidelines (no text, appropriate content)
- [ ] Tested on various iOS devices and sizes
- [ ] Promotional artwork (optional) prepared

### Google Play
- [ ] App icon (512×512) uploaded
- [ ] Feature graphic (1024×500) uploaded
- [ ] Tests visibility in Play Store listing
- [ ] Adaptive icon layers configured (optional)

### Web
- [ ] OG image (1200×630) saved to `web/public/og-cover.png`
- [ ] Favicons generated and placed in `web/public/`
- [ ] Web manifest updated with icon references
- [ ] Social media sharing tested (Facebook, Twitter)

---

## Contact for Design Assets

If you need professional design services:
- **Figma community:** Search "app icon templates"
- **Freelance designers:** Dribbble, Behance
- **Icon services:** App Icon Generator, MakeAppIcon

For questions about Avalo brand guidelines:
- Email: design@avalo.app
- Internal: #design-team Slack channel