# Fix relative imports to use @ alias
$files = Get-ChildItem -Path "app" -Include "*.ts","*.tsx" -Recurse

$totalFixed = 0
$fileCount = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $modified = $false
    
    # Pattern 1: from '../lib/...'  -> from '@/lib/...'
    if ($content -match "from ['""]\.\.\/lib\/") {
        $content = $content -replace "from ['""](\.\.\/)+lib\/", "from '@/lib/"
        $modified = $true
    }
    
    # Pattern 2: from '../hooks/...' -> from '@/hooks/...'
    if ($content -match "from ['""]\.\.\/hooks\/") {
        $content = $content -replace "from ['""](\.\.\/)+hooks\/", "from '@/hooks/"
        $modified = $true
    }
    
    # Pattern 3: from '../contexts/...' -> from '@/contexts/...'
    if ($content -match "from ['""]\.\.\/contexts\/") {
        $content = $content -replace "from ['""](\.\.\/)+contexts\/", "from '@/contexts/"
        $modified = $true
    }
    
    # Pattern 4: from '../components/...' -> from '@/components/...'
    if ($content -match "from ['""]\.\.\/components\/") {
        $content = $content -replace "from ['""](\.\.\/)+components\/", "from '@/components/"
        $modified = $true
    }
    
    # Pattern 5: from '../services/...' -> from '@/services/...'
    if ($content -match "from ['""]\.\.\/services\/") {
        $content = $content -replace "from ['""](\.\.\/)+services\/", "from '@/services/"
        $modified = $true
    }
    
    # Pattern 6: from '../types/...' -> from '@/types/...'
    if ($content -match "from ['""]\.\.\/types\/") {
        $content = $content -replace "from ['""](\.\.\/)+types\/", "from '@/types/"
        $modified = $true
    }
    
    # Pattern 7: from '../config/...' -> from '@/config/...'
    if ($content -match "from ['""]\.\.\/config\/") {
        $content = $content -replace "from ['""](\.\.\/)+config\/", "from '@/config/"
        $modified = $true
    }
    
    # Pattern 8: from '../utils/...' -> from '@/utils/...'
    if ($content -match "from ['""]\.\.\/utils\/") {
        $content = $content -replace "from ['""](\.\.\/)+utils\/", "from '@/utils/"
        $modified = $true
    }
    
    # Pattern 9: from '../shared/...' -> check if exists in app-mobile/shared, else comment
    if ($content -match "from ['""]\.\..*\/shared\/") {
        $content = $content -replace "from ['""](\.\.\/)+\.\.\/shared\/", "from '@/shared/"
        $modified = $true
    }
    
    # Pattern 10: from '../../shared/...'
    if ($content -match "from ['""]\.\.\/\.\.\/\.\.\/shared\/") {
        $content = $content -replace "from ['""](\.\.\/)+shared\/", "from '@/shared/"
        $modified = $true
    }
    
    if ($modified) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $fileCount++
        Write-Host "Fixed: $($file.FullName)"
    }
}

Write-Host "`nTotal files modified: $fileCount"
