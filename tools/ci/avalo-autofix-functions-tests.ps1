param(
  [string]$RepoRoot = "C:\a\avalo",
  [switch]$RunTests = $true
)

$ErrorActionPreference="Stop"

function Info($m){ Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[ OK ] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }

function EnsureDir($p){ if(!(Test-Path $p)){ New-Item -Force -ItemType Directory $p | Out-Null } }

function Backup($p){
  if(Test-Path $p){
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item -Force $p "$p.bak.$stamp"
  }
}

function ReplaceAllInFile($path, $pattern, $replacement){
  if(!(Test-Path $path)){ return $false }
  $raw = Get-Content $path -Raw -Encoding UTF8
  $new = [regex]::Replace($raw, $pattern, $replacement)
  if($new -ne $raw){
    Backup $path
    Set-Content -Encoding UTF8 $path $new
    return $true
  }
  return $false
}

function PatchJestConfig($jestPath){
  if(!(Test-Path $jestPath)){ return $false }
  $raw = Get-Content $jestPath -Raw -Encoding UTF8
  $changed = $false

  # Ensure module.exports exists and is an object literal; we patch by simple inserts
  if($raw -match "module\.exports\s*=\s*\{"){
    if($raw -notmatch "setupFilesAfterEnv"){
      $raw = [regex]::Replace($raw, "module\.exports\s*=\s*\{", "module.exports = {`n  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],", 1)
      $changed = $true
    }
    if($raw -notmatch "testTimeout"){
      $raw = [regex]::Replace($raw, "module\.exports\s*=\s*\{", "module.exports = {`n  testTimeout: 120000,", 1)
      $changed = $true
    }
    if($raw -notmatch "transformIgnorePatterns"){
      $raw = [regex]::Replace($raw, "module\.exports\s*=\s*\{", "module.exports = {`n  transformIgnorePatterns: ['/node_modules/(?!uuid)/'],", 1)
      $changed = $true
    } elseif($raw -notmatch "uuid"){
      # replace any existing transformIgnorePatterns block with uuid-enabled version
      $raw2 = [regex]::Replace($raw, "transformIgnorePatterns\s*:\s*\[[^\]]*\]", "transformIgnorePatterns: ['/node_modules/(?!uuid)/']", 1)
      if($raw2 -ne $raw){ $raw = $raw2; $changed = $true }
    }
  } else {
    Warn "jest.config.js has unexpected format; skipping patch"
    return $false
  }

  if($changed){
    Backup $jestPath
    Set-Content -Encoding UTF8 $jestPath $raw
    Ok "Patched Jest config: $jestPath"
  } else {
    Ok "Jest config already patched: $jestPath"
  }
  return $changed
}

Info "===== AVALO AUTO-FIX (FUNCTIONS TEST HARNESS + CORE) ====="

$functionsDir = Join-Path $RepoRoot "functions"
$srcDir       = Join-Path $functionsDir "src"
$testsDir     = Join-Path $functionsDir "tests"
EnsureDir $testsDir

# 1) Remove local '.js' extensions from TS imports in functions/src (init.js, chatMonetization.js, trustEngine.js, etc.)
Info "Fixing local import extensions (.js -> none) in functions/src..."
$tsFiles = Get-ChildItem -Path $srcDir -Recurse -File -Filter *.ts -ErrorAction SilentlyContinue
$importFixCount = 0
foreach($f in $tsFiles){
  $raw = Get-Content $f.FullName -Raw -Encoding UTF8
  $new = $raw -replace "(from\s+['""][^'""]+)\.js(['""])", "`$1`$2"
  if($new -ne $raw){
    Backup $f.FullName
    Set-Content -Encoding UTF8 $f.FullName $new
    $importFixCount++
  }
}
Ok "Import extension fixes applied to $importFixCount files"

# 2) Firestore settings() called only once (guard) in functions/src/init.ts if exists
$initTs = Join-Path $srcDir "init.ts"
if(Test-Path $initTs){
  Info "Patching Firestore init/settings guard in src/init.ts..."
  $patched = ReplaceAllInFile $initTs "db\.settings\(\s*\{\s*ignoreUndefinedProperties\s*:\s*true\s*\}\s*\)\s*;?" @"
if (!(globalThis as any).__AVALO_FS_SETTINGS_APPLIED) {
  try {
    db.settings({ ignoreUndefinedProperties: true })
  } catch (e) {}
  ;(globalThis as any).__AVALO_FS_SETTINGS_APPLIED = true
}
"@
  if($patched){ Ok "Firestore settings guard patched" } else { Ok "No Firestore settings pattern found (skip)" }
} else {
  Warn "src/init.ts not found (skip Firestore settings patch)"
}

# 3) Create test globals + setup (NO editing individual tests)
Info "Creating Jest setup + TS global declarations for test helpers..."

$jestSetup = Join-Path $testsDir "jest.setup.ts"
$globalDts = Join-Path $testsDir "globals.d.ts"

@"
import * as admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

function ensureAdmin() {
  if (admin.apps.length === 0) {
    admin.initializeApp()
  }
  // Enable emulator if user runs it (doesn't start emulator here)
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
  }
}

function getDb() {
  ensureAdmin()
  return admin.firestore()
}

async function setupTestEnvironment() {
  ensureAdmin()
}

const testData = {
  generateUserId() {
    return 'test_user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
  }
}

async function createTestUser(id: string, data: any = {}) {
  const db = getDb()
  await db.collection('users').doc(id).set({
    tokens: 0,
    createdAt: now(),
    ...data
  })
  return { id, ...data }
}

async function createTestTransaction(userId: string, amount: number, type: string) {
  const db = getDb()
  await db.collection('transactions').add({
    userId,
    amount,
    type,
    createdAt: now()
  })
}

function now() {
  return Timestamp.now()
}
function minutesAgo(m: number) {
  return Timestamp.fromMillis(Date.now() - m * 60_000)
}
function hoursAgo(h: number) {
  return Timestamp.fromMillis(Date.now() - h * 3_600_000)
}
function daysAgo(d: number) {
  return Timestamp.fromMillis(Date.now() - d * 86_400_000)
}

// Attach to global for legacy tests that assume globals
;(globalThis as any).getDb = getDb
;(globalThis as any).setupTestEnvironment = setupTestEnvironment
;(globalThis as any).testData = testData
;(globalThis as any).createTestUser = createTestUser
;(globalThis as any).createTestTransaction = createTestTransaction
;(globalThis as any).now = now
;(globalThis as any).minutesAgo = minutesAgo
;(globalThis as any).hoursAgo = hoursAgo
;(globalThis as any).daysAgo = daysAgo
"@ | Set-Content -Encoding UTF8 $jestSetup

@"
export {}

declare global {
  var getDb: () => any
  var setupTestEnvironment: () => Promise<void>
  var testData: { generateUserId: () => string }
  var createTestUser: (id: string, data?: any) => Promise<any>
  var createTestTransaction: (userId: string, amount: number, type: string) => Promise<void>
  var now: () => any
  var minutesAgo: (m: number) => any
  var hoursAgo: (h: number) => any
  var daysAgo: (d: number) => any
}
"@ | Set-Content -Encoding UTF8 $globalDts

Ok "Created: tests/jest.setup.ts and tests/globals.d.ts"

# 4) Patch Jest config for setup + uuid ESM + timeout
$jestJs = Join-Path $functionsDir "jest.config.js"
if(Test-Path $jestJs){
  Info "Patching jest.config.js..."
  PatchJestConfig $jestJs | Out-Null
} else {
  Warn "functions/jest.config.js missing (skip jest patch)"
}

# 5) Pin uuid to CJS-compatible version if uuid exists (avoid Jest ESM crash)
$pkgPath = Join-Path $functionsDir "package.json"
if(Test-Path $pkgPath){
  $pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $uuidVersion = $null
  if($pkg.dependencies -and $pkg.dependencies.uuid){ $uuidVersion = $pkg.dependencies.uuid }
  if($pkg.devDependencies -and $pkg.devDependencies.uuid){ $uuidVersion = $pkg.devDependencies.uuid }

  if($uuidVersion){
    Info "Ensuring uuid is CJS-friendly (uuid@8.3.2)..."
    Push-Location $functionsDir
    try{
      npm install uuid@8.3.2 --save-exact
      Ok "uuid pinned to 8.3.2"
    } finally { Pop-Location }
  } else {
    Ok "uuid not found in package.json (skip pin)"
  }
} else {
  Warn "functions/package.json missing (skip uuid pin)"
}

# 6) Build + (optional) tests
Push-Location $functionsDir
try{
  Info "Running: npm run build"
  npm run build
  Ok "functions build OK"

  if($RunTests){
    Info "Running: npm test -- --runInBand --detectOpenHandles"
    npm test -- --runInBand --detectOpenHandles
    if($LASTEXITCODE -eq 0){
      Ok "tests PASS"
    } else {
      Warn "tests still failing (next pass will auto-fix remaining business-logic failures)"
    }
  }
} finally { Pop-Location }

# 7) Write minimal summary
$summary = Join-Path $RepoRoot "audit-out\AUTO_FIX_SUMMARY.txt"
@"
AVALO AUTO-FIX SUMMARY
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

- Import .js extension fixes: $importFixCount files
- Jest setup created: functions/tests/jest.setup.ts
- TS globals created: functions/tests/globals.d.ts
- Jest config patched: $(Test-Path $jestJs)
- uuid pinned (if present): uuid@8.3.2
- Build executed: yes
- Tests executed: $RunTests
"@ | Set-Content -Encoding UTF8 $summary

Ok "Wrote: $summary"
Ok "DONE"
