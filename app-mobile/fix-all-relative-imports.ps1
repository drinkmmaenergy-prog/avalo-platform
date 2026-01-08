# Comprehensive fix for all relative imports in app/**
$files = Get-ChildItem -Path "app" -Include "*.ts","*.tsx" -Recurse
$totalFixed = 0
$modifiedFiles = @()

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    
    # Fix imports going up 1+ levels (../../ or ../)
    # Pattern: from '../anything'  -> from '@/anything'
    # Pattern: from '../../anything' -> from '@/anything'
    # Pattern: from '../../../anything' -> from '@/anything  
    $content = $content -replace "from ['""](\.\./)+", "from '@/"
    $content = $content -replace "import\s+(.+?)\s+from\s+['""](\.\./)+", "import `$1 from '@/"
    
    if ($content -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $totalFixed++
        $modifiedFiles += $file.FullName
        Write-Host "Fixed: $($file.FullName)"
    }
}

Write-Host "`n=========================================="
Write-Host "IMPORT FIX SUMMARY"
Write-Host "=========================================="
Write-Host "Total files scanned: $($files.Count)"
Write-Host "Total files modified: $totalFixed"
Write-Host "`nModified files:"
$modifiedFiles | ForEach-Object { Write-Host "  - $_" }
Write-Host "=========================================="
