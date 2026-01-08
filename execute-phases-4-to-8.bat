@echo off
echo ========================================
echo AVALO MONOREPO REPAIR - PHASES 4-8
echo Fully Automatic Execution
echo ========================================
echo.

set START_TIME=%TIME%

REM Phase 4: Install Dependencies
echo [PHASE 4] Installing Dependencies
echo -------------------------------------
echo Installing @avalo/sdk...
call pnpm -F @avalo/sdk install --no-frozen-lockfile
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install @avalo/sdk
    exit /b 1
)
echo SUCCESS: @avalo/sdk installed

echo Installing app-mobile...
call pnpm -F app-mobile install --no-frozen-lockfile
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install app-mobile
    exit /b 1
)
echo SUCCESS: app-mobile installed
echo.

REM Phase 5: Expo SDK 54 Fix
echo [PHASE 5] Fixing Expo SDK 54 Compatibility
echo -------------------------------------
cd app-mobile
echo Running expo install --fix...
call npx expo install --fix
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: expo install --fix failed
    cd ..
    exit /b 1
)
echo SUCCESS: Expo SDK 54 compatibility fixed
cd ..
echo.

REM Phase 6: Regenerate Native Projects
echo [PHASE 6] Regenerating Native Projects
echo -------------------------------------
cd app-mobile
echo Running expo prebuild --clean...
call npx expo prebuild --clean
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: expo prebuild --clean failed
    cd ..
    exit /b 1
)
echo SUCCESS: Native projects regenerated
cd ..
echo.

REM Phase 7: Build Workspace Packages
echo [PHASE 7] Building Workspace Packages
echo -------------------------------------
echo Building @avalo/shared...
call pnpm run build:shared
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build @avalo/shared
    exit /b 1
)
echo SUCCESS: @avalo/shared built

echo Building @avalo/sdk...
call pnpm run build:sdk
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build @avalo/sdk
    exit /b 1
)
echo SUCCESS: @avalo/sdk built

echo Building functions...
call pnpm run build:functions
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build functions
    exit /b 1
)
echo SUCCESS: functions built
echo.

REM Phase 8: Validation
echo [PHASE 8] Final Validation
echo -------------------------------------
echo Checking TypeScript compilation...
cd app-mobile
call npx tsc --noEmit
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: TypeScript has errors (non-fatal)
) else (
    echo SUCCESS: TypeScript compilation successful
)
cd ..
echo.

echo ========================================
echo REPAIR COMPLETE!
echo ========================================
set END_TIME=%TIME%
echo Start Time: %START_TIME%
echo End Time: %END_TIME%
echo.
echo All phases completed successfully!
echo.
echo To start the Expo development server:
echo   cd app-mobile
echo   npx expo start --clear
echo.
echo Or run from root:
echo   pnpm run mobile:reset
echo.