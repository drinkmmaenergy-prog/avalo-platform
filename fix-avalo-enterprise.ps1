# === AVALO ENTERPRISE AUTO-REPAIR ===

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
function Section($t){ Write-Host "`n=== $t ===" -ForegroundColor Cyan }

function Kill-Processes {
  Section "Killing Node/Metro/Gradle"
  foreach($p in "node","metro","gradle","adb"){
    try { taskkill /F /IM "$p.exe" 2>$null | Out-Null } catch {}
  }
}

function Ensure-Dir($p){ if(!(Test-Path $p)){ New-Item -ItemType Directory -Path $p | Out-Null } }

function Clean-Workspace($dir){
  if(Test-Path $dir){
    Section "Cleaning $dir"
    foreach($x in @("node_modules",".expo",".expo-shared",".cache","dist","build")){
      $target = Join-Path $dir $x
      if(Test-Path $target){ Remove-Item -Recurse -Force $target }
    }
  }
}

function Write-File($path, $content){
  $folder = Split-Path -Parent $path
  Ensure-Dir $folder
  Set-Content -Path $path -Value $content -Encoding UTF8
}

function Write-Root-Tsconfig {
  Section "Writing ROOT tsconfig.json"
  $json = @"
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true,
    "jsx": "react-jsx"
  }
}
"@
  Write-File "$repoRoot\tsconfig.json" $json
}

function Write-AppMobile-Tsconfig {
  Section "Writing APP-MOBILE tsconfig.json"
  $json = @"
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true,
    "jsx": "react-jsx"
  }
}
"@
  Write-File "$repoRoot\app-mobile\tsconfig.json" $json
}

function Write-Babel {
  Section "Writing babel.config.js"
  $js = @"
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-reanimated/plugin"]
  };
};
"@
  Write-File "$repoRoot\app-mobile\babel.config.js" $js
}

function Write-Metro {
  Section "Writing metro.config.js"
  $js = @"
const { getDefaultConfig } = require("expo/metro-config");
module.exports = getDefaultConfig(__dirname);
"@
  Write-File "$repoRoot\app-mobile\metro.config.js" $js
}

function Write-IndexJS {
  Section "Writing index.js"
  $js = @"
import { registerRootComponent } from "expo";
import App from "./App";
registerRootComponent(App);
"@
  Write-File "$repoRoot\app-mobile\index.js" $js
}

function Write-PackageJson-AppMobile {
  Section "Writing package.json"
  $json = @"
{
  "name": "app-mobile",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "expo": "54.0.23",
    "react": "19.1.0",
    "react-native": "0.81.5"
  }
}
"@
  Write-File "$repoRoot\app-mobile\package.json" $json
}

function Install-All {
  Section "Installing ROOT"
  pnpm install --config.unknown=true

  Section "Installing APP-MOBILE"
  cd "$repoRoot\app-mobile"
  pnpm install --config.unknown=true
  cd $repoRoot
}

function Start-Expo {
  Section "Starting Expo"
  cd "$repoRoot\app-mobile"
  npx expo start --clear
}

Kill-Processes
Clean-Workspace "app-mobile"
Write-Root-Tsconfig
Write-AppMobile-Tsconfig
Write-Babel
Write-Metro
Write-IndexJS
Write-PackageJson-AppMobile
Install-All
Start-Expo
