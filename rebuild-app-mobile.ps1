Write-Host "=== Avalo: Rebuilding app-mobile ===" -ForegroundColor Cyan

$target = "C:\Users\Drink\avaloapp\app-mobile"

# 1) Remove old folder
if (Test-Path $target) {
    Write-Host "Removing old app-mobile..." -ForegroundColor Yellow
    Remove-Item $target -Recurse -Force
}

# 2) Create folder
Write-Host "Creating new app-mobile..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $target | Out-Null

# 3) Create app.json
@"
{
  "expo": {
    "name": "Avalo",
    "slug": "avalo",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "avalo",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": ["**/*"]
  }
}
"@ | Out-File -FilePath "$target\app.json" -Encoding UTF8

# 4) Create tsconfig.json
@"
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
"@ | Out-File -FilePath "$target\tsconfig.json" -Encoding UTF8

# 5) Create minimal folder structure
New-Item -ItemType Directory -Path "$target\app" | Out-Null
New-Item -ItemType Directory -Path "$target\assets" | Out-Null

# 6) Create basic index.tsx
@"
import { Slot } from "expo-router";

export default function Root() {
  return <Slot />;
}
"@ | Out-File -FilePath "$target\app\_layout.tsx" -Encoding UTF8

Write-Host "✅ app-mobile rebuilt successfully!" -ForegroundColor Green
