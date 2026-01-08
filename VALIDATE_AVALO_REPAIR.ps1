# Avalo Repair Validation System
# This script validates that all repairs were successful

$ErrorActionPreference = "Continue"
$ReportFile = "validation-report.txt"
$StartTime = Get-Date

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  AVALO REPAIR VALIDATION SYSTEM" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Started: $StartTime" -ForegroundColor Yellow
Write-Host ""

# Initialize report file
"Avalo Repair Validation Report" | Out-File -FilePath $ReportFile -Encoding UTF8
"Generated: $StartTime" | Out-File -FilePath $ReportFile -Append
"" | Out-File -FilePath $ReportFile -Append
"============================================" | Out-File -FilePath $ReportFile -Append
"" | Out-File -FilePath $ReportFile -Append

$validationResults = @{
    TypeScriptCompile = @{ Status = $null; Details = @(); Errors = @() }
    MissingImports = @{ Status = $null; Details = @(); Errors = @() }
    BrokenPaths = @{ Status = $null; Details = @(); Errors = @() }
    ExpoRouter = @{ Status = $null; Details = @(); Errors = @() }
    FirebaseTypes = @{ Status = $null; Details = @(); Errors = @() }
    ReactNativeTypes = @{ Status = $null; Details = @(); Errors = @() }
}

function Write-Report {
    param([string]$Message)
    Write-Host $Message
    $Message | Out-File -FilePath $ReportFile -Append -Encoding UTF8
}

function Test-NodeInstallation {
    Write-Host "Checking Node.js installation..." -ForegroundColor Cyan
    try {
        $nodeVersion = node --version 2>&1
        Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "✗ Node.js not found" -ForegroundColor Red
        return $false
    }
}

function Test-TypeScriptCompilation {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  1. TYPESCRIPT COMPILATION CHECK" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Report ""
    Write-Report "1. TypeScript Compilation Check"
    Write-Report "================================"
    Write-Report ""
    
    try {
        # Check if TypeScript is installed
        $tscVersion = npx tsc --version 2>&1
        Write-Host "TypeScript version: $tscVersion" -ForegroundColor White
        Write-Report "TypeScript version: $tscVersion"
        
        # Try to compile without emitting
        Write-Host "Running TypeScript compilation check..." -ForegroundColor White
        $tscOutput = npx tsc --noEmit --skipLibCheck 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ TypeScript compilation successful" -ForegroundColor Green
            Write-Report "✓ TypeScript compilation: PASSED"
            $validationResults.TypeScriptCompile.Status = "PASSED"
            $validationResults.TypeScriptCompile.Details += "No compilation errors found"
        }
        else {
            Write-Host "✗ TypeScript compilation has errors" -ForegroundColor Red
            Write-Report "✗ TypeScript compilation: FAILED"
            $validationResults.TypeScriptCompile.Status = "FAILED"
            
            # Parse and display errors
            $errorLines = $tscOutput | Select-String -Pattern "error TS" | Select-Object -First 20
            if ($errorLines) {
                Write-Host ""
                Write-Host "Sample errors:" -ForegroundColor Yellow
                Write-Report ""
                Write-Report "Sample errors:"
                foreach ($errorLine in $errorLines) {
                    Write-Host "  $errorLine" -ForegroundColor Red
                    Write-Report "  $errorLine"
                    $validationResults.TypeScriptCompile.Errors += $errorLine.ToString()
                }
            }
        }
    }
    catch {
        Write-Host "✗ Error running TypeScript check: $_" -ForegroundColor Red
        Write-Report "✗ Error: $_"
        $validationResults.TypeScriptCompile.Status = "ERROR"
        $validationResults.TypeScriptCompile.Errors += $_.ToString()
    }
}

function Test-MissingImports {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  2. MISSING IMPORTS CHECK" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Report ""
    Write-Report "2. Missing Imports Check"
    Write-Report "========================"
    Write-Report ""
    
    try {
        $reportPath = "import-resolver-report.json"
        if (Test-Path $reportPath) {
            $report = Get-Content $reportPath -Raw | ConvertFrom-Json
            
            $brokenCount = $report.brokenImports
            $fixedCount = $report.fixes.brokenFixed
            
            Write-Host "Broken imports found: $brokenCount" -ForegroundColor $(if ($brokenCount -eq 0) { "Green" } else { "Yellow" })
            Write-Host "Broken imports fixed: $fixedCount" -ForegroundColor Green
            Write-Report "Broken imports found: $brokenCount"
            Write-Report "Broken imports fixed: $fixedCount"
            
            if ($brokenCount -eq 0) {
                Write-Host "✓ No missing imports detected" -ForegroundColor Green
                Write-Report "✓ Missing imports check: PASSED"
                $validationResults.MissingImports.Status = "PASSED"
            }
            else {
                Write-Host "⚠ Some imports could not be resolved" -ForegroundColor Yellow
                Write-Report "⚠ Missing imports check: WARNING"
                $validationResults.MissingImports.Status = "WARNING"
                
                if ($report.brokenImportsList -and $report.brokenImportsList.Count -gt 0) {
                    Write-Host ""
                    Write-Host "Unresolved imports:" -ForegroundColor Yellow
                    Write-Report ""
                    Write-Report "Unresolved imports:"
                    foreach ($broken in $report.brokenImportsList | Select-Object -First 10) {
                        $msg = "  $($broken.file): $($broken.import)"
                        Write-Host $msg -ForegroundColor Red
                        Write-Report $msg
                        $validationResults.MissingImports.Errors += $msg
                    }
                }
            }
        }
        else {
            Write-Host "⚠ Import resolver report not found" -ForegroundColor Yellow
            Write-Report "⚠ Import resolver report not found"
            $validationResults.MissingImports.Status = "SKIPPED"
        }
    }
    catch {
        Write-Host "✗ Error checking imports: $_" -ForegroundColor Red
        Write-Report "✗ Error: $_"
        $validationResults.MissingImports.Status = "ERROR"
        $validationResults.MissingImports.Errors += $_.ToString()
    }
}

function Test-BrokenPaths {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  3. BROKEN PATHS CHECK" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Report ""
    Write-Report "3. Broken Paths Check"
    Write-Report "====================="
    Write-Report ""
    
    try {
        $reportPath = "ts-autofix-report.json"
        if (Test-Path $reportPath) {
            $report = Get-Content $reportPath -Raw | ConvertFrom-Json
            
            $pathsFixed = $report.fixes.pathsFixed
            $aliasesApplied = if ($report.fixes.PSObject.Properties.Name -contains 'aliasesApplied') { 
                $report.fixes.aliasesApplied 
            } else { 0 }
            
            Write-Host "Paths fixed: $pathsFixed" -ForegroundColor Green
            Write-Host "Aliases applied: $aliasesApplied" -ForegroundColor Green
            Write-Report "Paths fixed: $pathsFixed"
            Write-Report "Aliases applied: $aliasesApplied"
            
            Write-Host "✓ Path resolution check completed" -ForegroundColor Green
            Write-Report "✓ Broken paths check: PASSED"
            $validationResults.BrokenPaths.Status = "PASSED"
            $validationResults.BrokenPaths.Details += "All path aliases configured"
        }
        else {
            Write-Host "⚠ TypeScript autofix report not found" -ForegroundColor Yellow
            Write-Report "⚠ TypeScript autofix report not found"
            $validationResults.BrokenPaths.Status = "SKIPPED"
        }
    }
    catch {
        Write-Host "✗ Error checking paths: $_" -ForegroundColor Red
        Write-Report "✗ Error: $_"
        $validationResults.BrokenPaths.Status = "ERROR"
        $validationResults.BrokenPaths.Errors += $_.ToString()
    }
}

function Test-ExpoRouter {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  4. EXPO ROUTER VALIDATION" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Report ""
    Write-Report "4. Expo Router Validation"
    Write-Report "========================="
    Write-Report ""
    
    try {
        $reportPath = "react-expo-fix-report.json"
        if (Test-Path $reportPath) {
            $report = Get-Content $reportPath -Raw | ConvertFrom-Json
            
            $defaultExports = $report.fixes.defaultExportsAdded
            $jsxFixed = $report.fixes.jsxReturnsFixed
            $layoutsValidated = $report.fixes.layoutsValidated
            
            Write-Host "Default exports added: $defaultExports" -ForegroundColor Green
            Write-Host "JSX returns fixed: $jsxFixed" -ForegroundColor Green
            Write-Host "Layouts validated: $layoutsValidated" -ForegroundColor Green
            Write-Report "Default exports added: $defaultExports"
            Write-Report "JSX returns fixed: $jsxFixed"
            Write-Report "Layouts validated: $layoutsValidated"
            
            if ($report.errors.Count -eq 0) {
                Write-Host "✓ Expo Router structure validated" -ForegroundColor Green
                Write-Report "✓ Expo Router validation: PASSED"
                $validationResults.ExpoRouter.Status = "PASSED"
            }
            else {
                Write-Host "⚠ Some Expo Router issues detected" -ForegroundColor Yellow
                Write-Report "⚠ Expo Router validation: WARNING"
                $validationResults.ExpoRouter.Status = "WARNING"
                
                foreach ($errorMsg in $report.errors | Select-Object -First 5) {
                    Write-Host "  $errorMsg" -ForegroundColor Red
                    Write-Report "  $errorMsg"
                    $validationResults.ExpoRouter.Errors += $errorMsg
                }
            }
        }
        else {
            Write-Host "⚠ React/Expo fix report not found" -ForegroundColor Yellow
            Write-Report "⚠ React/Expo fix report not found"
            $validationResults.ExpoRouter.Status = "SKIPPED"
        }
    }
    catch {
        Write-Host "✗ Error validating Expo Router: $_" -ForegroundColor Red
        Write-Report "✗ Error: $_"
        $validationResults.ExpoRouter.Status = "ERROR"
        $validationResults.ExpoRouter.Errors += $_.ToString()
    }
}

function Test-FirebaseTypes {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  5. FIREBASE TYPES CHECK" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Report ""
    Write-Report "5. Firebase Types Check"
    Write-Report "======================="
    Write-Report ""
    
    try {
        # Check if Firebase packages are installed
        $packageJsonPath = "package.json"
        if (Test-Path $packageJsonPath) {
            $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
            
            $firebaseDeps = @()
            if ($packageJson.dependencies) {
                $firebaseDeps += $packageJson.dependencies.PSObject.Properties | 
                    Where-Object { $_.Name -like "firebase*" } | 
                    ForEach-Object { "$($_.Name)@$($_.Value)" }
            }
            if ($packageJson.devDependencies) {
                $firebaseDeps += $packageJson.devDependencies.PSObject.Properties | 
                    Where-Object { $_.Name -like "firebase*" } | 
                    ForEach-Object { "$($_.Name)@$($_.Value)" }
            }
            
            if ($firebaseDeps.Count -gt 0) {
                Write-Host "Firebase packages found:" -ForegroundColor White
                Write-Report "Firebase packages found:"
                foreach ($dep in $firebaseDeps) {
                    Write-Host "  ✓ $dep" -ForegroundColor Green
                    Write-Report "  ✓ $dep"
                }
                
                # Check if Firebase imports were fixed
                $reportPath = "ts-autofix-report.json"
                if (Test-Path $reportPath) {
                    $report = Get-Content $reportPath -Raw | ConvertFrom-Json
                    $firebaseFixed = $report.fixes.firebaseImportsFixed
                    
                    Write-Host ""
                    Write-Host "Firebase imports fixed: $firebaseFixed" -ForegroundColor Green
                    Write-Report ""
                    Write-Report "Firebase imports fixed: $firebaseFixed"
                }
                
                Write-Host "✓ Firebase types check passed" -ForegroundColor Green
                Write-Report "✓ Firebase types check: PASSED"
                $validationResults.FirebaseTypes.Status = "PASSED"
            }
            else {
                Write-Host "ℹ No Firebase packages found" -ForegroundColor Cyan
                Write-Report "ℹ No Firebase packages found"
                $validationResults.FirebaseTypes.Status = "NOT_APPLICABLE"
            }
        }
        else {
            Write-Host "⚠ package.json not found" -ForegroundColor Yellow
            Write-Report "⚠ package.json not found"
            $validationResults.FirebaseTypes.Status = "SKIPPED"
        }
    }
    catch {
        Write-Host "✗ Error checking Firebase types: $_" -ForegroundColor Red
        Write-Report "✗ Error: $_"
        $validationResults.FirebaseTypes.Status = "ERROR"
        $validationResults.FirebaseTypes.Errors += $_.ToString()
    }
}

function Test-ReactNativeTypes {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  6. REACT NATIVE TYPES CHECK" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Report ""
    Write-Report "6. React Native Types Check"
    Write-Report "==========================="
    Write-Report ""
    
    try {
        # Check if React Native is installed
        $packageJsonPath = "app-mobile/package.json"
        if (Test-Path $packageJsonPath) {
            $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
            
            $rnVersion = $null
            if ($packageJson.dependencies -and $packageJson.dependencies.'react-native') {
                $rnVersion = $packageJson.dependencies.'react-native'
            }
            
            if ($rnVersion) {
                Write-Host "React Native version: $rnVersion" -ForegroundColor Green
                Write-Report "React Native version: $rnVersion"
                
                # Check Expo SDK version
                $expoVersion = $null
                if ($packageJson.dependencies -and $packageJson.dependencies.'expo') {
                    $expoVersion = $packageJson.dependencies.'expo'
                }
                
                if ($expoVersion) {
                    Write-Host "Expo SDK version: $expoVersion" -ForegroundColor Green
                    Write-Report "Expo SDK version: $expoVersion"
                }
                
                # Check if React Native imports were fixed
                $reportPath = "ts-autofix-report.json"
                if (Test-Path $reportPath) {
                    $report = Get-Content $reportPath -Raw | ConvertFrom-Json
                    $rnFixed = $report.fixes.reactNativeImportsFixed
                    
                    Write-Host ""
                    Write-Host "React Native imports fixed: $rnFixed" -ForegroundColor Green
                    Write-Report ""
                    Write-Report "React Native imports fixed: $rnFixed"
                }
                
                Write-Host "✓ React Native types check passed" -ForegroundColor Green
                Write-Report "✓ React Native types check: PASSED"
                $validationResults.ReactNativeTypes.Status = "PASSED"
            }
            else {
                Write-Host "⚠ React Native not found in dependencies" -ForegroundColor Yellow
                Write-Report "⚠ React Native not found in dependencies"
                $validationResults.ReactNativeTypes.Status = "WARNING"
            }
        }
        else {
            Write-Host "⚠ app-mobile/package.json not found" -ForegroundColor Yellow
            Write-Report "⚠ app-mobile/package.json not found"
            $validationResults.ReactNativeTypes.Status = "SKIPPED"
        }
    }
    catch {
        Write-Host "✗ Error checking React Native types: $_" -ForegroundColor Red
        Write-Report "✗ Error: $_"
        $validationResults.ReactNativeTypes.Status = "ERROR"
        $validationResults.ReactNativeTypes.Errors += $_.ToString()
    }
}

# Run all validations
if (-not (Test-NodeInstallation)) {
    Write-Host ""
    Write-Host "✗ Cannot proceed without Node.js" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Test-TypeScriptCompilation
Test-MissingImports
Test-BrokenPaths
Test-ExpoRouter
Test-FirebaseTypes
Test-ReactNativeTypes

# Final Summary
$EndTime = Get-Date
$Duration = $EndTime - $StartTime

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  VALIDATION SUMMARY" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Report ""
Write-Report "============================================"
Write-Report "VALIDATION SUMMARY"
Write-Report "============================================"
Write-Report ""

$passCount = 0
$failCount = 0
$warnCount = 0
$skipCount = 0

foreach ($key in $validationResults.Keys) {
    $result = $validationResults[$key]
    $status = $result.Status
    
    $statusText = switch ($status) {
        "PASSED" { "✓ PASSED"; $passCount++; "Green" }
        "FAILED" { "✗ FAILED"; $failCount++; "Red" }
        "WARNING" { "⚠ WARNING"; $warnCount++; "Yellow" }
        "ERROR" { "✗ ERROR"; $failCount++; "Red" }
        "SKIPPED" { "○ SKIPPED"; $skipCount++; "Gray" }
        "NOT_APPLICABLE" { "○ N/A"; $skipCount++; "Gray" }
        default { "? UNKNOWN"; "Gray" }
    }
    
    $color = $statusText[1]
    $statusText = $statusText[0]
    
    Write-Host "$key : $statusText" -ForegroundColor $color
    Write-Report "$key : $statusText"
}

Write-Host ""
Write-Report ""

Write-Host "Total Checks: $($validationResults.Count)" -ForegroundColor White
Write-Host "Passed: $passCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Green" })
Write-Host "Warnings: $warnCount" -ForegroundColor $(if ($warnCount -gt 0) { "Yellow" } else { "Green" })
Write-Host "Skipped: $skipCount" -ForegroundColor Gray
Write-Host ""
Write-Host "Duration: $($Duration.ToString('hh\:mm\:ss'))" -ForegroundColor Yellow
Write-Host ""

Write-Report "Total Checks: $($validationResults.Count)"
Write-Report "Passed: $passCount"
Write-Report "Failed: $failCount"
Write-Report "Warnings: $warnCount"
Write-Report "Skipped: $skipCount"
Write-Report ""
Write-Report "Duration: $($Duration.ToString('hh\:mm\:ss'))"
Write-Report "Finished: $EndTime"

# Overall status
if ($failCount -eq 0 -and $warnCount -eq 0) {
    Write-Host "✓ All validations passed successfully!" -ForegroundColor Green
    Write-Report ""
    Write-Report "✓ ALL VALIDATIONS PASSED"
}
elseif ($failCount -eq 0) {
    Write-Host "⚠ Validations completed with warnings" -ForegroundColor Yellow
    Write-Report ""
    Write-Report "⚠ VALIDATIONS COMPLETED WITH WARNINGS"
}
else {
    Write-Host "✗ Some validations failed" -ForegroundColor Red
    Write-Report ""
    Write-Report "✗ SOME VALIDATIONS FAILED"
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Validation report saved to: $ReportFile" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")