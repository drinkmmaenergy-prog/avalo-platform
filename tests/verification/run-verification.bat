@echo off
REM ========================================================================
REM AVALO POST-DEPLOYMENT VERIFICATION - RUNNER SCRIPT (Windows)
REM ========================================================================

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                                                            ║
echo ║   🔥 AVALO POST-DEPLOYMENT VERIFICATION SUITE             ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Navigate to verification directory
cd /d "%~dp0"

REM Check if node_modules exists
if not exist "..\..\node_modules" (
    echo 📦 Installing dependencies...
    cd ..\..
    call npm install
    cd tests\verification
)

REM Check if Firebase emulators are running
echo 🔍 Checking Firebase emulators...
curl -s http://127.0.0.1:5001 >nul 2>&1
if errorlevel 1 (
    echo.
    echo ⚠️  WARNING: Firebase emulators do not appear to be running!
    echo.
    echo Please start the emulators first:
    echo   cd ..\..
    echo   npm run emulators
    echo.
    echo Or in a new terminal:
    echo   firebase emulators:start
    echo.
    set /p CONTINUE="Continue anyway? (y/N) "
    if /i not "%CONTINUE%"=="y" exit /b 1
)

echo.
echo 🚀 Starting verification suite...
echo.

REM Run the verification suite
cd ..\..
call npx ts-node tests\verification\index.ts

REM Capture exit code
set EXIT_CODE=%ERRORLEVEL%

echo.
echo ════════════════════════════════════════════════════════════
echo.

if %EXIT_CODE%==0 (
    echo ✅ Verification completed successfully!
) else (
    echo ❌ Verification failed with exit code %EXIT_CODE%
)

echo.
echo 📄 Reports saved to: .\reports\
echo    - avalo_post_deploy_verification.md
echo    - avalo_post_deploy_verification.json
echo    - logs\post_deploy_run.log
echo.

exit /b %EXIT_CODE%