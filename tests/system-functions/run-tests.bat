@echo off
REM Avalo System Functions Test Suite Runner (Windows)

echo.
echo ========================================
echo  Avalo System Functions Test Suite
echo ========================================
echo.

REM Check if node is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed
    echo Please install Node.js 18+ from https://nodejs.org
    exit /b 1
)

REM Check if Firebase credentials exist
if not exist "..\..\avalo-main-firebase-adminsdk.json" (
    echo Error: Firebase Admin SDK credentials not found
    echo Please ensure avalo-main-firebase-adminsdk.json is in the project root
    exit /b 1
)

REM Check if .env exists
if not exist "..\..\functions\.env" (
    echo Warning: functions\.env not found
    echo Some tests may fail without proper environment configuration
)

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Run tests
echo Running tests...
echo.

call npm test

set EXIT_CODE=%ERRORLEVEL%

echo.
echo ========================================

if %EXIT_CODE% EQU 0 (
    echo All tests passed!
) else (
    echo Some tests failed. Check the report for details.
)

echo.
echo Reports generated:
echo    - reports\system_functions_test.json
echo    - reports\system_functions_test.md
echo.

pause
exit /b %EXIT_CODE%