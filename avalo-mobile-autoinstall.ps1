Write-Host "=== AVALO MOBILE AUTO-INSTALLER v1 ===" -ForegroundColor Cyan

$root = "C:\Users\Drink\avaloapp"
$app = "$root\app-mobile"

# 1. Kill node & vscode
Write-Host "[1/10] Killing running processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null
taskkill /F /IM node64.exe 2>$null
taskkill /F /IM Code.exe 2>$null

# 2. Remove old app-mobile
Write-Host "[2/10] Removing old app-mobile..." -ForegroundColor Yellow
if (Test-Path $app) {
    Remove-Item -Recurse -Force $app
    Start-Sleep -Seconds 1
}

# 3. Create new Expo project
Write-Host "[3/10] Creating new Expo SDK 54 project..." -ForegroundColor Yellow
cd $root
npx create-expo-app@latest app-mobile --template blank --yes

# 4. Install dependencies
Write-Host "[4/10] Installing dependencies (React 19, RN 0.81, Expo Router 6)..." -ForegroundColor Yellow
cd $app
pnpm add expo-router@~6.0.14
pnpm add react@19.1.0 react-native@0.81.5

# 5. Remove default files
Write-Host "[5/10] Cleaning default template..." -ForegroundColor Yellow
$removeFiles = @(
    "$app\App.js",
    "$app\app.json",
    "$app\.gitignore"
)
foreach ($file in $removeFiles) {
    if (Test-Path $file) { Remove-Item -Force $file }
}

# 6. Create Avalo directories
Write-Host "[6/10] Creating Avalo folder structure..." -ForegroundColor Yellow

$dirs = @(
    "$app\app",
    "$app\app\(tabs)",
    "$app\app\auth",
    "$app\app\chat",
    "$app\app\components",
    "$app\app\hooks",
    "$app\app\profile",
    "$app\app\services",
    "$app\assets"
)

foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }

# 7. Write app.json
Write-Host "[7/10] Writing app.json..." -ForegroundColor Yellow

$appJson = @"
{
  "expo": {
    "name": "Avalo",
    "slug": "avalo",
    "version": "1.0.0",
    "orientation": "portrait",
    "plugins": ["expo-router"],
    "experiments": { "typedRoutes": true },
    "extra": { "router": { "origin": "http://localhost:8081" } }
  }
}
"@
Set-Content -Path "$app\app.json" -Value $appJson -Encoding UTF8

# 8. Create index.js + layouts
Write-Host "[8/10] Writing core navigation files..." -ForegroundColor Yellow

$indexJs = @"
import 'expo-router/entry';
"@
Set-Content "$app\index.js" $indexJs

$rootLayout = @"
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
"@
Set-Content "$app\app\_layout.tsx" $rootLayout

$tabsLayout = @"
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="discovery" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="wallet" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
"@
Set-Content "$app\app\(tabs)\_layout.tsx" $tabsLayout

# 9. Create placeholder tab screens
Write-Host "[9/10] Creating placeholder screens..." -ForegroundColor Yellow

$tabNames = @("home","discovery","chat","wallet","profile")
foreach ($name in $tabNames) {
$content = @"
import { View, Text } from 'react-native';

export default function $name() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>$name screen</Text>
    </View>
  );
}
"@
Set-Content "$app\app\(tabs)\$name.tsx" $content
}

# 10. Finished
Write-Host "[10/10] Done! Starting Expo..." -ForegroundColor Green
pnpm exec expo start --clear
