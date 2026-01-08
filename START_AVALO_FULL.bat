@echo off
setlocal enabledelayedexpansion

:: Avalo Full Stack Startup Script
:: Starts Mobile, Web, and Firebase Emulators

echo.
echo ========================================
echo   AVALO FULL STACK - Quick Start
echo ========================================
echo.

:: Check if we're in the root directory
if not exist "app-mobile" (
    echo ERROR: Must be run from Avalo root directory
    echo Current directory: %CD%
    pause
    exit /b 1
)

if not exist "app-web" (
    echo ERROR: Must be run from Avalo root directory
    pause
    exit /b 1
)

:: Step 1: Build workspace packages
echo [1/4] Building workspace packages...
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

:: Step 2: Start Firebase Emulators
echo.
echo [2/4] Starting Firebase Emulators...
start "Firebase Emulators" cmd /k "firebase emulators:start"
echo Waiting 5 seconds for emulators to initialize...
timeout /t 5 /nobreak > nul

:: Step 3: Start Web App
echo.
echo [3/4] Starting Web App...
cd app-web
start "Avalo Web" cmd /k "pnpm dev"
cd ..

echo Waiting 3 seconds...
timeout /t 3 /nobreak > nul

:: Step 4: Start Mobile App
echo.
echo [4/4] Starting Mobile App...
cd app-mobile
start "Avalo Mobile" cmd /k "pnpm start --reset-cache"
cd ..

echo.
echo ========================================
echo   ✅ Avalo Full Stack Started!
echo ========================================
echo.
echo Services running:
echo - Firebase Emulators: http://localhost:4000
echo - Web App: http://localhost:3000
echo - Mobile App: Check Expo window
echo.
echo Press any key to open monitoring dashboard...
pause > nul

:: Open browser to monitoring dashboard
start http://localhost:4000

echo.
echo All services are running in separate windows.
echo Close those windows to stop the services.
echo.
pause

endlocal