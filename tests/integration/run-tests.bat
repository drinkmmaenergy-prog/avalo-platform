@echo off
REM ============================================================================
REM AVALO FIREBASE INTEGRATION TEST RUNNER (Windows)
REM ============================================================================
REM Automated script to run the complete Firebase integration test suite
REM for the Avalo platform on Windows.
REM
REM Usage:
REM   run-tests.bat                    - Run all tests
REM   run-tests.bat --with-emulators   - Start emulators and run tests
REM   run-tests.bat --build-first      - Build functions before testing
REM ============================================================================

setlocal enabledelayedexpansion

REM Configuration
set "PROJECT_ROOT=%~dp0..\.."
set "FUNCTIONS_DIR=%PROJECT_ROOT%\functions"
set "TEST_DIR=%PROJECT_ROOT%\tests\integration"
set "REPORTS_DIR=%PROJECT_ROOT%\reports"

REM Parse arguments
set START_EMULATORS=false
set BUILD_FIRST=false

:parse_args
if "%~1"=="" goto :end_parse_args
if /i "%~1"=="--with-emulators" (
    set START_EMULATORS=true
    shift
    goto :parse_args
)
if /i "%~1"=="--build-first" (
    set BUILD_FIRST=true
    shift
    goto :parse_args
)
if /i "%~1"=="--help" goto :show_help
if /i "%~1"=="-h" goto :show_help
shift
goto :parse_args

:show_help
echo Usage: %~nx0 [OPTIONS]
echo.
echo Options:
echo   --with-emulators    Start Firebase emulators before testing
echo   --build-first       Build Firebase functions before testing
echo   --help, -h          Show this help message
echo.
exit /b 0

:end_parse_args

REM Print header
echo.
echo ========================================================================
echo.
echo          🔥 AVALO FIREBASE INTEGRATION TEST RUNNER 🔥
echo.
echo ========================================================================
echo.

REM Check Node.js
echo ▶ Checking dependencies...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ✗ Node.js is not installed
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ✗ npm is not installed
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i

echo   ✓ Node.js %NODE_VERSION%
echo   ✓ npm %NPM_VERSION%
echo.

REM Install test dependencies
echo ▶ Installing test dependencies...
cd /d "%TEST_DIR%"

if not exist "node_modules" (
    call npm install
    if %errorlevel% neq 0 (
        echo ✗ Failed to install dependencies
        exit /b 1
    )
) else (
    echo   Dependencies already installed
)
echo.

REM Build functions if requested
if "%BUILD_FIRST%"=="true" (
    echo ▶ Building Firebase functions...
    cd /d "%FUNCTIONS_DIR%"
    call npm run build
    if %errorlevel% neq 0 (
        echo ✗ Failed to build functions
        exit /b 1
    )
    echo   ✓ Functions built successfully
    echo.
)

REM Start emulators if requested
if "%START_EMULATORS%"=="true" (
    echo ▶ Starting Firebase emulators...
    cd /d "%PROJECT_ROOT%"
    
    REM Check if emulators are already running
    netstat -ano | findstr :5001 >nul 2>&1
    if %errorlevel% equ 0 (
        echo   ⚠ Emulators appear to be already running
    ) else (
        echo   Starting emulators in background...
        start /b firebase emulators:start
        echo   Waiting for emulators to initialize...
        timeout /t 30 /nobreak >nul
        echo   ✓ Emulators started
    )
    echo.
)

REM Create reports directory
if not exist "%REPORTS_DIR%" mkdir "%REPORTS_DIR%"

REM Run tests
echo ▶ Running integration tests...
cd /d "%TEST_DIR%"

call npx ts-node index.ts
set TEST_RESULT=%errorlevel%

echo.

REM Print results
if %TEST_RESULT% equ 0 (
    echo ========================================================================
    echo.
    echo      ✅ ALL TESTS PASSED! 🎉
    echo.
    echo ========================================================================
    echo.
    echo 📄 Reports saved to: %REPORTS_DIR%
    exit /b 0
) else (
    echo ========================================================================
    echo.
    echo      ❌ SOME TESTS FAILED
    echo.
    echo ========================================================================
    echo.
    echo 📄 Check report at: %REPORTS_DIR%\avalo_full_test_report.md
    exit /b 1
)