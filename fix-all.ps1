Write-Host "=== Avalo Auto-Fix Started ===" -ForegroundColor Cyan

Set-Location "C:\Users\Drink\avaloapp"

taskkill /F /IM node.exe 2>

Remove-Item -Recurse -Force app-mobile\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force app-mobile\.expo -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force app-mobile\.cache -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force pnpm-lock.yaml -ErrorAction SilentlyContinue

pnpm store prune

Set-Content -Path "app-mobile\metro.config.js" -Value @'
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.sourceExts.push("cjs", "mjs");
config.resolver.extraNodeModules = {
  react: path.join(projectRoot, "node_modules/react"),
  "react-dom": path.join(projectRoot, "node_modules/react-dom"),
  "react-native": path.join(projectRoot, "node_modules/react-native"),
  "@avalo/shared": path.join(workspaceRoot, "shared", "src"),
  "@avalo/sdk": path.join(workspaceRoot, "sdk", "src"),
};

module.exports = config;
'@

pnpm install

Set-Location "C:\Users\Drink\avaloapp\app-mobile"
pnpm install

npx expo start --clear
