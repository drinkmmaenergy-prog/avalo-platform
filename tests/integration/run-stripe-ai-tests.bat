@echo off
REM ========================================================================
REM AVALO STRIPE & AI MODERATION TEST SUITE - WINDOWS RUNNER
REM ========================================================================

echo.
echo ══════════════════════════════════════════════════════════════
echo   AVALO STRIPE ^& AI MODERATION TEST SUITE
echo ══════════════════════════════════════════════════════════════
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Error: Node.js is not installed.
    echo    Please install Node.js from https://nodejs.org/
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Error: npm is not installed.
    echo    Please install npm.
    exit /b 1
)

REM Navigate to test directory
cd /d "%~dp0"

echo 📦 Installing dependencies...
call npm install --silent

if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    exit /b 1
)

echo 🔨 Compiling TypeScript...
call npx tsc --noEmit

if %errorlevel% neq 0 (
    echo ❌ TypeScript compilation failed
    exit /b 1
)

echo 🚀 Running Stripe ^& AI tests...
echo.

REM Run the test suite
call npx ts-node runStripeAiTests.ts

set exit_code=%errorlevel%

echo.
if %exit_code% equ 0 (
    echo ✅ Test suite completed successfully!
) else (
    echo ⚠️  Test suite completed with issues. Check reports for details.
)

echo.
exit /b %exit_code%