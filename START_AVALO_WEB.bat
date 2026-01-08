@echo off
setlocal enabledelayedexpansion

:: Avalo Web App Startup Script
:: Automatically builds dependencies and starts the web app

echo.
echo ========================================
echo   AVALO WEB - Quick Start
echo ========================================
echo.

:: Check if we're in the root directory
if not exist "app-web" (
    echo ERROR: Must be run from Avalo root directory
    echo Current directory: %CD%
    pause
    exit /b 1
)

:: Step 1: Build workspace packages
echo [1/2] Building workspace packages...
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

:: Step 2: Start Web App
echo.
echo [2/2] Starting Avalo Web App...
echo.
cd app-web

echo Starting Next.js development server...
call pnpm dev

:: If we get here, something went wrong
echo.
echo Web app stopped.
pause

endlocal