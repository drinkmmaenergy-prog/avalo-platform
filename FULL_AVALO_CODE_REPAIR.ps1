# Avalo Full Code Repair System
# This script runs all auto-repair tools in sequence

$ErrorActionPreference = "Continue"
$LogFile = "repair-log.txt"
$StartTime = Get-Date

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  AVALO FULL CODE REPAIR SYSTEM" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Started: $StartTime" -ForegroundColor Yellow
Write-Host ""

# Initialize log file
"Avalo Full Code Repair - Started: $StartTime" | Out-File -FilePath $LogFile -Encoding UTF8
"" | Out-File -FilePath $LogFile -Append

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    $logMessage | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

function Run-RepairTool {
    param(
        [string]$ToolName,
        [string]$ToolPath,
        [string]$Description
    )
    
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  RUNNING: $ToolName" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Log "Starting $ToolName"
    Write-Log "Description: $Description"
    
    try {
        $output = node $ToolPath 2>&1
        $exitCode = $LASTEXITCODE
        
        # Write output to console and log
        $output | ForEach-Object { 
            Write-Host $_
            $_ | Out-File -FilePath $LogFile -Append -Encoding UTF8
        }
        
        if ($exitCode -eq 0) {
            Write-Host ""
            Write-Host "✓ $ToolName completed successfully" -ForegroundColor Green
            Write-Log "✓ $ToolName completed successfully"
            return $true
        } else {
            Write-Host ""
            Write-Host "✗ $ToolName completed with errors (exit code: $exitCode)" -ForegroundColor Red
            Write-Log "✗ $ToolName completed with errors (exit code: $exitCode)"
            return $false
        }
    }
    catch {
        Write-Host ""
        Write-Host "✗ $ToolName failed with exception: $_" -ForegroundColor Red
        Write-Log "✗ $ToolName failed with exception: $_"
        return $false
    }
}

# Check if Node.js is available
Write-Log "Checking Node.js installation..."
try {
    $nodeVersion = node --version 2>&1
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
    Write-Log "Node.js version: $nodeVersion"
}
catch {
    Write-Host "✗ Node.js not found. Please install Node.js to run this script." -ForegroundColor Red
    Write-Log "ERROR: Node.js not found"
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Check if tools directory exists
if (-not (Test-Path "tools")) {
    Write-Host "✗ Tools directory not found. Please ensure you're running this from the project root." -ForegroundColor Red
    Write-Log "ERROR: Tools directory not found"
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  REPAIR SEQUENCE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will run the following tools in sequence:" -ForegroundColor White
Write-Host "  1. TypeScript Auto-Fix" -ForegroundColor White
Write-Host "  2. Import Resolver" -ForegroundColor White
Write-Host "  3. React/Expo Auto-Fix" -ForegroundColor White
Write-Host ""
Write-Host "All results will be logged to: $LogFile" -ForegroundColor Yellow
Write-Host ""

# Run repair tools in sequence
$results = @{}

# Tool 1: TypeScript Auto-Fix
$results["ts-autofix"] = Run-RepairTool `
    -ToolName "TypeScript Auto-Fix" `
    -ToolPath "tools/ts-autofix.ts" `
    -Description "Fixes TypeScript imports, paths, and exports"

# Tool 2: Import Resolver
$results["import-resolver"] = Run-RepairTool `
    -ToolName "Import Resolver" `
    -ToolPath "tools/import-resolver.ts" `
    -Description "Resolves broken imports and applies path aliases"

# Tool 3: React/Expo Auto-Fix
$results["react-expo-autofix"] = Run-RepairTool `
    -ToolName "React/Expo Auto-Fix" `
    -ToolPath "tools/react-expo-autofix.ts" `
    -Description "Fixes React/Expo components and Expo Router structure"

# Summary
$EndTime = Get-Date
$Duration = $EndTime - $StartTime

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  REPAIR SUMMARY" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Log ""
Write-Log "=== REPAIR SUMMARY ==="
Write-Log ""

$successCount = 0
$failureCount = 0

foreach ($tool in $results.Keys) {
    $status = if ($results[$tool]) { "SUCCESS" } else { "FAILED" }
    $color = if ($results[$tool]) { "Green" } else { "Red" }
    $icon = if ($results[$tool]) { "✓" } else { "✗" }
    
    Write-Host "$icon $tool : $status" -ForegroundColor $color
    Write-Log "$icon $tool : $status"
    
    if ($results[$tool]) { $successCount++ } else { $failureCount++ }
}

Write-Host ""
Write-Log ""

Write-Host "Total Tools Run: $($results.Count)" -ForegroundColor White
Write-Host "Successful: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor $(if ($failureCount -gt 0) { "Red" } else { "Green" })
Write-Host ""
Write-Host "Started: $StartTime" -ForegroundColor Yellow
Write-Host "Finished: $EndTime" -ForegroundColor Yellow
Write-Host "Duration: $($Duration.ToString('hh\:mm\:ss'))" -ForegroundColor Yellow
Write-Host ""

Write-Log "Total Tools Run: $($results.Count)"
Write-Log "Successful: $successCount"
Write-Log "Failed: $failureCount"
Write-Log "Duration: $($Duration.ToString('hh\:mm\:ss'))"
Write-Log "Finished: $EndTime"

# Check if all tools succeeded
if ($failureCount -eq 0) {
    Write-Host "✓ All repair tools completed successfully!" -ForegroundColor Green
    Write-Log "✓ All repair tools completed successfully!"
    Write-Host ""
    Write-Host "Generated reports:" -ForegroundColor Cyan
    Write-Host "  - ts-autofix-report.json" -ForegroundColor White
    Write-Host "  - import-resolver-report.json" -ForegroundColor White
    Write-Host "  - react-expo-fix-report.json" -ForegroundColor White
    Write-Host "  - repair-log.txt" -ForegroundColor White
} else {
    Write-Host "⚠ Some repair tools encountered errors. Please check the logs for details." -ForegroundColor Yellow
    Write-Log "⚠ Some repair tools encountered errors"
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Log saved to: $LogFile" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")