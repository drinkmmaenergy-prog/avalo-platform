@echo off
REM Batch wrapper for PowerShell script
REM Usage: fix-expo-monorepo.bat [--dry-run] [--verbose]

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%fix-expo-monorepo-permanent.ps1"

REM Check if PowerShell 7+ is available
where pwsh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "PWSH_CMD=pwsh"
) else (
    set "PWSH_CMD=powershell"
    echo Warning: PowerShell 7+ not found, using legacy PowerShell
    echo For best results, install PowerShell 7+: https://aka.ms/PSWindows
    timeout /t 3
)

REM Parse arguments
set "ARGS="
:parse_args
if "%~1"=="" goto run_script
if /i "%~1"=="--dry-run" set "ARGS=%ARGS% -DryRun"
if /i "%~1"=="-d" set "ARGS=%ARGS% -DryRun"
if /i "%~1"=="--verbose" set "ARGS=%ARGS% -Verbose"
if /i "%~1"=="-v" set "ARGS=%ARGS% -Verbose"
shift
goto parse_args

:run_script
echo.
echo ========================================================
echo   EXPO MONOREPO CONFIGURATION FIX
echo ========================================================
echo.
echo This script will:
echo   1. Remove Expo configs from root directory
echo   2. Clean all caches
echo   3. Ensure correct project structure
echo   4. Install guard mechanism
echo.
echo Press Ctrl+C to cancel or
pause

%PWSH_CMD% -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %ARGS%

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo   FIX COMPLETED SUCCESSFULLY
    echo ========================================================
    echo.
    echo Next steps:
    echo   1. cd app-mobile
    echo   2. expo start
    echo.
) else (
    echo.
    echo ========================================================
    echo   FIX FAILED - CHECK ERRORS ABOVE
    echo ========================================================
    echo.
)

pause
endlocal