#!/usr/bin/env pwsh
# Android Build Script for Windows
# Ensures proper NODE_BINARY configuration for Gradle

# Get the full path to node.exe
$nodePath = Get-Command node | Select-Object -ExpandProperty Source

if (-not $nodePath) {
    Write-Error "Node.js not found in PATH. Please install Node.js first."
    exit 1
}

Write-Host "Using Node: $nodePath" -ForegroundColor Green

# Set NODE_BINARY environment variable
$env:NODE_BINARY = $nodePath

# Set ANDROID_HOME if not already set
if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = "C:\Users\Drink\AppData\Local\Android\Sdk"
    Write-Host "Set ANDROID_HOME to: $env:ANDROID_HOME" -ForegroundColor Yellow
}

# Verify Android SDK exists
if (-not (Test-Path $env:ANDROID_HOME)) {
    Write-Error "Android SDK not found at: $env:ANDROID_HOME"
    exit 1
}

Write-Host "Android SDK: $env:ANDROID_HOME" -ForegroundColor Green

# Change to app-mobile directory
Set-Location $PSScriptRoot

# Clean previous builds (optional - uncomment if needed)
# Write-Host "Cleaning previous builds..." -ForegroundColor Cyan
# & .\android\gradlew.bat -p android clean

Write-Host "`nStarting Android build..." -ForegroundColor Cyan
Write-Host "Running: pnpm expo run:android" -ForegroundColor Cyan
Write-Host ""

# Run the build
& pnpm expo run:android

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed with exit code: $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "`nBuild completed successfully!" -ForegroundColor Green
