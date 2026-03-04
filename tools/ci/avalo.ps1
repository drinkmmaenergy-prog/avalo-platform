param(
  [ValidateSet("once","smoke")]
  [string]$Mode = "once"
)

$ErrorActionPreference = "Stop"

function Write-Section([string]$t){
  Write-Host ""
  Write-Host "===================="
  Write-Host $t
  Write-Host "===================="
}

function Run([string]$cmd){
  Write-Host ">>> $cmd"
  cmd /c $cmd | Out-Host
  if($LASTEXITCODE -ne 0){ throw "FAILED: $cmd" }
}

function Stop-EmulatorsIfRunning {
  $ports = @(5001,8080,9099,4000)
  foreach ($port in $ports) {
    try {
      $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
      if($conns){
        $pids = $conns.OwningProcess | Select-Object -Unique
        foreach($procId in $pids){
          try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}
        }
      }
    } catch {}
  }
}

function Start-Emulators {
  Write-Section "Gate 4: Start Firebase emulators"
  Stop-EmulatorsIfRunning

  $job = Start-Job -ScriptBlock {
    Set-Location "C:\a\avalo"
    firebase emulators:start --only auth,firestore,functions --project demo-avalo-local
  }

  $deadline = (Get-Date).AddSeconds(180)

  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    try {
      $tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port 5001 -WarningAction SilentlyContinue
      if ($tcp.TcpTestSucceeded) {
        return $job
      }
    } catch {}
  }

  throw "Emulator did not open port 5001"
}

try {
  Write-Section "Gate 0: Tooling"
  Run "node -v"
  Run "pnpm -v"
  Run "firebase --version"

  if($Mode -eq "smoke"){
    Write-Section "Gate SMOKE"
    Run "node tools/ci/node/smoke.mjs"
    exit 0
  }

  Write-Section "Gate 1: Install"
  Run "pnpm -w install"

  Write-Section "Gate 2: Guardrails"
  Run "node tools/ci/node/verify-invariants.mjs"

  Write-Section "Gate 3: Functions build"
  Run "pnpm --filter .\functions... build"

  $emuProc = Start-Emulators

  try {
    Write-Section "Gate 5: Smoke test"
    Run "node tools/ci/node/smoke.mjs"

    Write-Section "Gate 6: Web build"
    Run "pnpm --filter .\app-web... build"

    Write-Section "Gate 7: App typecheck"
    Run "pnpm --filter .\app-mobile... exec tsc --noEmit"
  }
  finally {
    Write-Section "Cleanup"
    try { Stop-Job -Id $emuProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    try { Remove-Job -Id $emuProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    Stop-EmulatorsIfRunning
  }

  Write-Host ""
  Write-Host "====================================="
  Write-Host "PASS ALL GATES — AVALO STABLE"
  Write-Host "====================================="
}
catch {
  Write-Host ""
  Write-Host "====================================="
  Write-Host "FAIL:" $_.Exception.Message
  Write-Host "====================================="
  Stop-EmulatorsIfRunning
  exit 1
}
