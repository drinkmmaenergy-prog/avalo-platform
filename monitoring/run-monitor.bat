@echo off
REM Avalo Monitoring System - Runner Script (Windows)
REM Usage: run-monitor.bat [--force "reason"]

echo ==========================================
echo    Avalo Monitoring System
echo ==========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Warning: Dependencies not installed. Installing...
    call npm install
    echo.
)

REM Check if .env exists
if not exist ".env" (
    echo Warning: .env file not found!
    echo Copy .env.example to .env and configure your credentials
    echo.
    echo Run: copy .env.example .env
    echo Then edit .env with your credentials
    exit /b 1
)

REM Check for force rollback flag
if "%1"=="--force" (
    if "%2"=="" (
        echo Error: Rollback reason required
        echo Usage: run-monitor.bat --force "Your reason here"
        exit /b 1
    )
    
    echo WARNING: Manual rollback initiated!
    echo Reason: %2
    echo.
    set /p confirm="Are you sure you want to rollback? (yes/no): "
    
    if not "%confirm%"=="yes" (
        echo Rollback cancelled.
        exit /b 0
    )
    
    echo Triggering rollback...
    call npm run monitor:force %2
) else (
    echo Running monitoring check...
    echo.
    call npm run monitor
)

echo.
echo ==========================================
echo Monitoring Complete
echo ==========================================
echo.
echo View reports:
echo    JSON: ..\reports\monitoring_report.json
echo    MD:   ..\reports\monitoring_report.md
echo.