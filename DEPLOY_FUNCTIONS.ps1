param(
  [switch]$Prod
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$project = if ($Prod) { "avalo-c8c46" } else { "avalostaging" }

Write-Host "Deploying FUNCTIONS to project: $project" -ForegroundColor Cyan

# twarda blokada: bez -Prod nie ma prawa dotknąć c8
if (-not $Prod -and $project -ne "avalostaging") { throw "BLOCKED: Not staging" }

Set-Location "$repoRoot\functions"

# zawsze jawnie podajemy projekt (żadnych domysłów CLI)
npx firebase deploy --only functions --project $project
