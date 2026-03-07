param(
  [string]$RepoRoot = "C:\a\avalo",
  [string]$Project = "avalostaging",
  [string]$Codebase = "default",
  [switch]$DeployAll
)

$ErrorActionPreference = "Stop"

function Run([string]$cmd, [string]$cwd) {
  Write-Host ""
  Write-Host ">>> $cmd"
  $p = Start-Process -FilePath "pwsh" -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-Command",$cmd) -WorkingDirectory $cwd -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -ne 0) { throw "Command failed ($($p.ExitCode)): $cmd" }
}

$repo = $RepoRoot
if (!(Test-Path $repo)) { throw "RepoRoot not found: $repo" }

Write-Host "=== Avalo DevOps Agent ==="
Write-Host "Repo: $repo"
Write-Host "Project: $Project"
Write-Host "DeployAll: $DeployAll"

Write-Host ""
Write-Host "STEP 1 — BUILD FUNCTIONS"
Run "cd `"$repo\functions`"; npm run build" $repo

Write-Host ""
Write-Host "STEP 2 — DETECT CHANGED FUNCTIONS"

$changedFunctions = New-Object System.Collections.Generic.HashSet[string]

if (-not $DeployAll) {
  $isGitRepo = Test-Path (Join-Path $repo ".git")
  if ($isGitRepo) {
    try {
      $diff = & git -C $repo diff --name-only HEAD
      if ($LASTEXITCODE -eq 0 -and $diff) {
        foreach ($line in $diff) {
          if ($line -match "^functions/src/(.+)\.ts$") {
            $name = [System.IO.Path]::GetFileNameWithoutExtension($Matches[1])
            if ($name) { [void]$changedFunctions.Add($name) }
          }
        }
      } else {
        Write-Host "No git diff detected, scanning full functions folder"
      }
    } catch {
      Write-Host "Git diff failed, scanning full functions folder"
    }
  } else {
    Write-Host "Not a git repository, scanning full functions folder"
  }
}

if ($DeployAll -or $changedFunctions.Count -eq 0) {
  if ($DeployAll) {
    $only = "functions"
  } else {
    Write-Host "No function changes detected by diff. Defaulting to deploy: health only."
    $only = "functions:health"
  }
} else {
  $list = $changedFunctions | Sort-Object
  $only = ($list | ForEach-Object { "functions:$($_)" }) -join ","
  $only = $only -replace "functions:h(,|$)","functions:health`$1"
}

Write-Host ""
Write-Host "Deploy batch: $only"
Write-Host ""
Write-Host "=== Deploying to '$Project'."

Run "cd `"$repo`"; firebase use $Project" $repo
Run "cd `"$repo`"; firebase deploy --only $only --project $Project" $repo

Write-Host ""
Write-Host "DONE"
