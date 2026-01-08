@echo off
REM ========================================================================
REM Avalo Load Test Runner - Windows
REM ========================================================================

echo.
echo ====================================
echo   Avalo Load Testing Suite
echo ====================================
echo.

REM Check if k6 is installed
where k6 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] k6 is not installed!
    echo.
    echo Please install k6 from: https://k6.io/docs/getting-started/installation/
    echo.
    echo Windows installation:
    echo   choco install k6
    echo.
    exit /b 1
)

REM Create results directory
if not exist "results" mkdir results

REM Load environment variables if .env exists
if exist .env (
    echo [INFO] Loading environment from .env file...
    for /f "delims=" %%x in (.env) do (set "%%x")
)

REM Set defaults if not provided
if not defined FIREBASE_FUNCTIONS_URL (
    set FIREBASE_FUNCTIONS_URL=https://europe-west3-avalo-app.cloudfunctions.net
)

echo [INFO] Target: %FIREBASE_FUNCTIONS_URL%
echo.

REM Confirm before running
echo This will simulate heavy load on your Firebase Functions.
echo Press Ctrl+C to cancel, or
pause

echo.
echo ====================================
echo   Running Load Tests
echo ====================================
echo.

REM Test 1: Ping
echo [1/3] Running Ping Load Test...
echo Target: /ping endpoint
echo Load: 1,000 concurrent users
echo.
k6 run --out json=results/ping-results.json scenarios/ping-test.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Ping test failed!
    goto :error
)
echo [SUCCESS] Ping test completed
echo.

REM Test 2: Purchase Tokens
echo [2/3] Running Purchase Tokens Load Test...
echo Target: /purchaseTokensV2 endpoint
echo Load: Up to 1,000 concurrent users
echo.
k6 run --out json=results/purchase-results.json scenarios/purchase-test.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Purchase test failed!
    goto :error
)
echo [SUCCESS] Purchase test completed
echo.

REM Test 3: Loyalty System
echo [3/3] Running Loyalty System Load Test...
echo Target: /getUserLoyaltyCallable endpoint
echo Load: Up to 500 concurrent users
echo.
k6 run --out json=results/loyalty-results.json scenarios/loyalty-test.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Loyalty test failed!
    goto :error
)
echo [SUCCESS] Loyalty test completed
echo.

REM Generate reports
echo ====================================
echo   Generating Reports
echo ====================================
echo.
node utils/generateReport.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Report generation failed!
    goto :error
)

echo.
echo ====================================
echo   Load Tests Completed Successfully
echo ====================================
echo.
echo Reports generated:
echo   - reports/load_test_results.md
echo   - reports/load_test_results.json
echo.
echo Raw results:
echo   - results/ping-results.json
echo   - results/purchase-results.json
echo   - results/loyalty-results.json
echo.

exit /b 0

:error
echo.
echo ====================================
echo   Load Tests Failed
echo ====================================
echo.
echo Check the error messages above for details.
echo.
exit /b 1