@echo off
REM Avalo Full Integration Test Matrix - Windows Execution Script

echo ╔═══════════════════════════════════════════════════════════
echo ║  AVALO FULL INTEGRATION TEST MATRIX
echo ║  Initializing test environment...
echo ╚═══════════════════════════════════════════════════════════

REM Check for .env file
if not exist .env (
    echo ⚠️  No .env file found - copying from .env.example
    copy .env.example .env
    echo ❌ Please configure .env with your credentials
    exit /b 1
)

echo ✅ Environment variables loaded

REM Install dependencies if needed
if not exist node_modules (
    echo 📦 Installing dependencies...
    call npm install
)

echo.
echo 🚀 Starting full integration test suite...
echo.

REM Run tests
call npm test

REM Exit with test result code
exit /b %ERRORLEVEL%