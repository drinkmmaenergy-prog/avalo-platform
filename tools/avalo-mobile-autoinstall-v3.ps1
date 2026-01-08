# ============================================================
# Avalo Mobile Auto Installer v3 (ASCII only, safe PowerShell)
# ============================================================

Write-Host "Starting Avalo Mobile Auto Installer v3" -ForegroundColor Cyan

function Step {
    param([string]$msg)
    Write-Host $msg -ForegroundColor Green
}

# -----------------------------
# Step 1: Remove old folder
# -----------------------------
Step "Removing old app-mobile folder..."
$path = "C:\Users\Drink\avaloapp\app-mobile"
if (Test-Path $path) {
    try {
        Remove-Item -Recurse -Force $path
    }
    catch {
        Write-Host "Folder in use. Stopping Metro/Node..." -ForegroundColor Yellow
        Stop-Process -Name node -Force -ErrorAction SilentlyContinue
        Stop-Process -Name expo -Force -ErrorAction SilentlyContinue
        Stop-Process -Name powershell -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
    }
}

# -----------------------------
# Step 2: Create folder
# -----------------------------
Step "Creating new app-mobile folder..."
New-Item -ItemType Directory -Path $path | Out-Null

# -----------------------------
# Step 3: Create subdirectories
# -----------------------------
Step "Creating folder structure..."
$dirs = @(
    "app",
    "app\(tabs)",
    "app\auth",
    "app\chat",
    "app\components",
    "app\hooks",
    "app\profile",
    "app\services"
)

foreach ($d in $dirs) {
    New-Item -ItemType Directory -Path "$path\$d" | Out-Null
}

# -----------------------------
# Step 4: Create package.json
# -----------------------------
Step "Creating package.json..."
@'
{
  "name": "avalo-mobile",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "scripts": {
    "start": "expo start --clear",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "54.0.23",
    "expo-router": "6.0.14",
    "react": "19.1.0",
    "react-native": "0.81.5"
  }
}
'@ | Out-File -Encoding ASCII "$path\package.json"

# -----------------------------
# Step 5: Create app.json
# -----------------------------
Step "Creating app.json..."
@'
{
  "expo": {
    "name": "Avalo",
    "slug": "avalo",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#000000"
    },
    "experiments": {
      "typedRoutes": true
    }
  }
}
'@ | Out-File -Encoding ASCII "$path\app.json"

# -----------------------------
# Step 6: Create tsconfig.json
# -----------------------------
Step "Creating tsconfig.json..."
@'
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "strict": false,
    "allowJs": true,
    "skipLibCheck": true
  },
  "include": ["app"]
}
'@ | Out-File -Encoding ASCII "$path\tsconfig.json"

# -----------------------------
# Step 7: Create index.js
# -----------------------------
Step "Creating index.js..."
@'
import "expo-router/entry";
'@ | Out-File -Encoding ASCII "$path\index.js"

# -----------------------------
# Step 8: Create _layout.tsx
# -----------------------------
Step "Creating _layout.tsx..."
@'
import { Stack } from "expo-router";
export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
'@ | Out-File -Encoding ASCII "$path\app\_layout.tsx"

# -----------------------------
# Step 9: Create tabs layout
# -----------------------------
Step "Creating tabs layout..."
@'
import { Tabs } from "expo-router";

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
'@ | Out-File -Encoding ASCII "$path\app\(tabs)\_layout.tsx"

# -----------------------------
# Step 10: Create empty screens
# -----------------------------
Step "Generating placeholder screens..."

$files = @(
    "home.tsx",
    "discovery.tsx",
    "chat.tsx",
    "wallet.tsx",
    "profile.tsx"
)

foreach ($f in $files) {
@"
import { View, Text } from "react-native";
export default function Screen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>$f screen</Text>
    </View>
  );
}
"@ | Out-File -Encoding ASCII "$path\app\(tabs)\$f"
}

# -----------------------------
# Step 11: Install dependencies
# -----------------------------
Step "Installing dependencies with pnpm..."
cd $path
pnpm install

# -----------------------------
# Step 12: Run Expo
# -----------------------------
Step "Starting Expo..."
pnpm exec expo start --clear
