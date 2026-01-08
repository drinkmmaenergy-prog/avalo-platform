# AVALO PLATFORM PACK AUDIT SCRIPT
# Audits all packs from 1 to 450

Write-Host "=== AVALO PACK AUDIT SCRIPT ===" -ForegroundColor Cyan
Write-Host "Scanning PACK 1 to PACK 450..." -ForegroundColor Yellow
Write-Host ""

$results = @()
$missing = @()
$found = @()

for ($i = 1; $i -le 450; $i++) {
    $packName = "pack$i"
    $files = Get-ChildItem -Path "functions/src" -Recurse -Filter "*$packName*.ts" -ErrorAction SilentlyContinue
    
    if ($files) {
        $found += $i
        $fileList = ($files | Select-Object -ExpandProperty Name) -join ", "
        $results += [PSCustomObject]@{
            Pack = $i
            Status = "FOUND"
            Files = $fileList
        }
    } else {
        $missing += $i
        $results += [PSCustomObject]@{
            Pack = $i
            Status = "MISSING"
            Files = ""
        }
    }
}

Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total Packs Expected: 450" -ForegroundColor White
Write-Host "Packs Found: $($found.Count)" -ForegroundColor Green
Write-Host "Packs Missing: $($missing.Count)" -ForegroundColor Red
Write-Host ""

if ($missing.Count -gt 0) {
    Write-Host "=== MISSING PACKS ===" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "PACK $_" -ForegroundColor Red }
    Write-Host ""
}

# Export detailed results
$results | Export-Csv -Path "PACK_AUDIT_RESULTS.csv" -NoTypeInformation
Write-Host "Detailed results saved to PACK_AUDIT_RESULTS.csv" -ForegroundColor Green
