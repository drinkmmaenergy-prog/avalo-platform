@echo off
REM ========================================================================
REM AVALO BACKEND OPTIMIZATION RUNNER (Windows)
REM ========================================================================

echo.
echo 🚀 Avalo Backend Optimization ^& CDN Validation
echo ==============================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    exit /b 1
)

REM Navigate to scripts directory
cd /d "%~dp0"

REM Install dependencies if needed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    echo.
)

REM Run the optimization script
echo 🔍 Running backend optimization analysis...
echo.
call npx ts-node backend-optimization.ts

REM Check exit code
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Optimization analysis completed successfully!
    echo 📄 Reports saved to: ..\reports\backend_optimization.*
) else (
    echo.
    echo ❌ Optimization analysis failed. Check errors above.
    exit /b 1
)

pause