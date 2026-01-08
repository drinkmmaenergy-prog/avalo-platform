# Fix TypeScript imports across Firebase Functions
# This script adds the centralized common.ts imports to all files

$ErrorActionPreference = "Stop"

Write-Host "🔧 Fixing TypeScript imports in Firebase Functions..." -ForegroundColor Cyan

$srcPath = "$PSScriptRoot/src"
$tsFiles = Get-ChildItem -Path $srcPath -Filter "*.ts" -Recurse | Where-Object { 
    $_.Name -ne "init.ts" -and 
    $_.Name -ne "common.ts" -and
    $_.Name -ne "index.ts" -and
    $_.DirectoryName -notlike "*node_modules*"
}

$fixedCount = 0
$totalFiles = $tsFiles.Count

Write-Host "Found $totalFiles TypeScript files to process..." -ForegroundColor Yellow

foreach ($file in $tsFiles) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    $hasChanges = $false
    
    # Skip if already has common import
    if ($content -match "from ['""]\.\.?/+common['""]") {
        continue
    }
    
    # Check if file uses any of the common exports
    $needsCommon = $false
    $patterns = @(
        '\bdb\b',
        '\bauth\b',
        '\bstorage\b',
        '\bserverTimestamp\b',
        '\bincrement\b',
        '\bgenerateId\b',
        '\bonCall\b',
        '\bHttpsError\b',
        '\bonSchedule\b',
        '\bonMessagePublished\b',
        '\blogger\b',
        '\bz\.',
        '\bgetFirestore\b',
        '\bgetAuth\b',
        '\bgetStorage\b',
        '\baxios\b',
        '\bethers\b',
        '\bgetFeatureFlag\b'
    )
    
    foreach ($pattern in $patterns) {
        if ($content -match $pattern) {
            $needsCommon = $true
            break
        }
    }
    
    if (-not $needsCommon) {
        continue
    }
    
    # Calculate relative path to common.ts
    $relPath = $file.DirectoryName.Replace($srcPath, "").Replace("\", "/")
    $depth = ($relPath.Split("/", [StringSplitOptions]::RemoveEmptyEntries)).Count
    
    if ($depth -eq 0) {
        $importPath = "./common"
    } else {
        $upLevels = "../" * $depth
        $importPath = $upLevels + "common"
    }
    
    # Find the first import statement or the start of code
    $lines = $content -split "`r?`n"
    $insertIndex = 0
    $inComment = $false
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i].Trim()
        
        # Skip comments
        if ($line -match "^/\*") { $inComment = $true }
        if ($line -match "\*/$") { $inComment = $false; continue }
        if ($inComment -or $line -match "^//") { continue }
        if ($line -eq "") { continue }
        
        # Found first non-comment, non-empty line
        if ($line -match "^import " -or $line -match "^export ") {
            $insertIndex = $i
            break
        }
        
        # If we find actual code before imports, insert at start
        $insertIndex = $i
        break
    }
    
    # Add common import at the appropriate location
    $newImport = "import * as common from '$importPath';"
    $lines = @($lines[0..$insertIndex]) + @($newImport) + @($lines[($insertIndex+1)..($lines.Count-1)])
    $newContent = $lines -join "`n"
    
    # Write the modified content
    Set-Content -Path $file.FullName -Value $newContent -NoNewline
    
    $fixedCount++
    Write-Host "✓ Fixed: $($file.Name)" -ForegroundColor Green
}

Write-Host "`n✅ Import fix complete!" -ForegroundColor Green
Write-Host "   Files processed: $totalFiles" -ForegroundColor Cyan
Write-Host "   Files modified: $fixedCount" -ForegroundColor Cyan

if ($fixedCount -eq 0) {
    Write-Host "`n   No files needed modifications." -ForegroundColor Yellow
} else {
    Write-Host "`n   Run 'npm run build' to verify the fixes." -ForegroundColor Yellow
}