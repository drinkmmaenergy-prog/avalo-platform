@echo off
setlocal enabledelayedexpansion

:: Avalo Mobile App Startup Script
:: Automatically builds dependencies and starts the mobile app

echo.
echo ========================================
echo   AVALO MOBILE - Quick Start
echo ========================================
echo.

:: Check if we're in the root directory
if not exist "app-mobile" (
    echo ERROR: Must be run from Avalo root directory
    echo Current directory: %CD%
    pause
    exit /b 1
)

:: Step 1: Build workspace packages
echo [1/3] Building workspace packages...
echo.
echo Building @avalo/shared...
call pnpm --filter @avalo/shared build
if errorlevel 1 (
    echo ERROR: Failed to build @avalo/shared
    pause
    exit /b 1
)

echo.
echo Building @avalo/sdk...
call pnpm --filter @avalo/sdk build
if errorlevel 1 (
    echo ERROR: Failed to build @avalo/sdk
    pause
    exit /b 1
)

:: Step 2: Start Firebase Emulators (optional)
echo.
echo [2/3] Firebase Emulators (optional)
echo.
set /p START_EMULATORS="Start Firebase Emulators? (y/n): "
if /i "%START_EMULATORS%"=="y" (
    echo Starting Firebase Emulators in new window...
    start "Firebase Emulators" cmd /k "firebase emulators:start"
    echo Waiting 5 seconds for emulators to start...
    timeout /t 5 /nobreak > nul
) else (
    echo Skipping emulators. Make sure Firebase is configured.
)

:: Step 3: Start Mobile App
echo.
echo [3/3] Starting Avalo Mobile App...
echo.
cd app-mobile

echo Clearing Metro cache and starting...
call pnpm start --reset-cache

:: If we get here, something went wrong
echo.
echo Mobile app stopped.
pause

endlocal