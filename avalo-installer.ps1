Write-Host "=== Avalo 3.1 Installer ===" -ForegroundColor Cyan

# 0) Stop all Node/Metro/Gradle
Write-Host "Killing Node/Metro/Gradle…" -ForegroundColor Yellow
"node","expo","gradle","java" | ForEach-Object {
  Get-Process $_ -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

# 1) Clean root
Write-Host "Cleaning root…" -ForegroundColor Yellow
$ErrorActionPreference="SilentlyContinue"
Remove-Item -Recurse -Force node_modules,.turbo,.pnpm-store,.expo,.parcel-cache
Remove-Item -Force pnpm-lock.yaml,yarn.lock,package-lock.json
$ErrorActionPreference="Continue"

# 2) Clean workspaces if exist
$ws = @("app-mobile","sdk","shared","functions")
foreach ($w in $ws) {
  if (Test-Path $w) {
    Write-Host "Cleaning $w…" -ForegroundColor Yellow
    Remove-Item -Recurse -Force "$w\node_modules","$w\.expo","$w\.parcel-cache","$w\android","$w\ios" -ErrorAction SilentlyContinue
    Remove-Item -Force "$w\pnpm-lock.yaml","$w\package-lock.json" -ErrorAction SilentlyContinue
  }
}

# 3) Root package.json + tsconfig
@'
{
  "name": "avalo-monorepo",
  "private": true,
  "workspaces": ["app-mobile"],
  "packageManager": "pnpm@9"
}