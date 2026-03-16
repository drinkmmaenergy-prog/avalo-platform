Write-Host ""
Write-Host "============================================="
Write-Host "RUN ULTIMATE ECONOMY VALIDATOR"
Write-Host "============================================="

$repo = "C:\a\avalo"
$reportPath = Join-Path $repo "audit-out\ULTIMATE_ECONOMY_VALIDATOR_REPORT.txt"

New-Item -ItemType Directory -Force -Path (Join-Path $repo "audit-out") | Out-Null

Push-Location (Join-Path $repo "functions")
try {
  npx ts-node src/tests/ultimateEconomyValidator.ts | Tee-Object -FilePath $reportPath
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Report saved to:"
Write-Host $reportPath
