@echo off
REM AVALO Project - Quick Start Script (Windows)
REM Run this after cloning the repository

echo.
echo ================================
echo    AVALO Project - Quick Start
echo ================================
echo.

REM Step 1: Install dependencies
echo [Step 1/5] Installing dependencies...
call pnpm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies
    exit /b 1
)
echo [SUCCESS] Dependencies installed
echo.

REM Step 2: Build shared package
echo [Step 2/5] Building shared package...
cd shared
call pnpm build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to build shared package
    cd ..
    exit /b 1
)
cd ..
echo [SUCCESS] Shared package built
echo.

REM Step 3: Build SDK package
echo [Step 3/5] Building SDK package...
cd sdk
call pnpm build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to build SDK package
    cd ..
    exit /b 1
)
cd ..
echo [SUCCESS] SDK package built
echo.

REM Step 4: Verify mobile
echo [Step 4/5] Verifying mobile app...
cd app-mobile
call pnpm typecheck
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Mobile typecheck failed
    cd ..
    exit /b 1
)
cd ..
echo [SUCCESS] Mobile app verified
echo.

REM Step 5: Verify web
echo [Step 5/5] Verifying web app...
cd app-web
call pnpm typecheck
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Web typecheck failed
    cd ..
    exit /b 1
)
cd ..
echo [SUCCESS] Web app verified
echo.

echo ================================
echo    SUCCESS! All checks passed!
echo ================================
echo.
echo Next steps:
echo 1. Start Firebase emulators: firebase emulators:start
echo 2. Run mobile app: cd app-mobile ^&^& pnpm start
echo 3. Run web app: cd app-web ^&^& pnpm dev
echo.
echo For more information, see AVALO_COMPLETE_REPAIR_GUIDE.md
echo.
pause