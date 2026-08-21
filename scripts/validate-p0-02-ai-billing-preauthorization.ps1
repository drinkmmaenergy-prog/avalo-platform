#Requires -Version 5.1
<#
  validate-p0-02-ai-billing-preauthorization.ps1  — READ-ONLY, fail-closed.
  P0-02 AI BILLING PREAUTHORIZATION (R2). A billable AI provider call must NEVER occur before a successful
  server-authoritative preauthorization. App-web-owned canonical module app-web/src/lib/ai-billing/
  aiSpendAuthorization (dependency-injected; Next standalone-traced) owns server price/class policy and an atomic,
  idempotent reservation against the CANONICAL wallet spendable field `wallets.balance` (never `tokensBalance`)
  with held `reservedTokens`, writing every economic mutation to the canonical `ledger` (NO second ledger).
  Semantic idempotency binds user+product+avatar+price+payload-digest. The app-web AI chat route is a thin adapter
  over the orchestrator (provider injected). PRIMARY authority = emulator behavioral tests (provider fake +
  call counter) + rules denial tests. Reuses the accepted strict Jest --json parser (schema-aware, current-run
  temp JSON, distinct exact named records, parser self-tests). On FULL PASS (exit 0):
  P0_02_AI_BILLING_PREAUTHORIZATION_PASS ; else ..._FAIL (1).
#>
[CmdletBinding()]
param(
  [string]$Repo = '',
  [string]$ExpectedHead = '',
  [string]$ForensicRepo = ''
)
$ErrorActionPreference = 'Continue'
# ── REPOSITORY IDENTITY ────────────────────────────────────────────────────────────────────────────────────
# Identity used to be three hardcoded literals: the authoring worktree path, its previous HEAD, and a second
# "forensic" repository. That made this validator unable to certify anything except the machine it was written
# on - a clean checkout of the very checkpoint it is supposed to bless would fail its own identity gate, or
# silently read the authoring worktree instead. A validator that cannot run against the artifact under review
# is not producing closure evidence.
#
# Identity is now EXPLICIT INPUT with a fail-closed contract, and the mode actually used is printed so nobody
# has to infer which repository was read. The checks are not weakened: an explicit run must still name the
# exact commit it expects, and HEAD must equal it.
$AUTHORING_ROOT     = 'C:\a\avalo-controlled-enablement-clean'
$AUTHORING_FORENSIC = 'C:\a\avalo'
$AUTHORING_HEAD     = '4224fd324ee24e387b189fb9307caa05c9ca1ef0'
if ($Repo) {
  $IDENTITY_MODE = 'EXPLICIT'
  $rp = (Resolve-Path -LiteralPath $Repo -ErrorAction SilentlyContinue)
  if (-not $rp) { Write-Host ("GATE FAIL: -Repo does not resolve: " + $Repo); exit 1 }
  $root = $rp.Path.TrimEnd('\')
  if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) { Write-Host ("GATE FAIL: -Repo is not a Git repository: " + $root); exit 1 }
  # In explicit mode the expected commit is mandatory. Without it the gate would accept whatever happened to
  # be checked out, which is the opposite of an identity control.
  if (-not ($ExpectedHead -match '^[0-9a-fA-F]{40}$')) { Write-Host 'GATE FAIL: -ExpectedHead must be a 40-hex commit id in explicit mode'; exit 1 }
  $expectHead = $ExpectedHead.ToLowerInvariant()
  # The forensic cross-check is an authoring-worktree control: a second copy whose HEAD must match. It has no
  # meaning against an immutable checkpoint, so it applies only when a forensic root is supplied.
  $forensic = $ForensicRepo
} else {
  $IDENTITY_MODE = 'AUTHORING_DEFAULT'
  $root       = $AUTHORING_ROOT
  $forensic   = $AUTHORING_FORENSIC
  $expectHead = $AUTHORING_HEAD
}
Write-Host ("IDENTITY_MODE=" + $IDENTITY_MODE)
Write-Host ("IDENTITY_ROOT=" + $root)
Write-Host ("IDENTITY_EXPECTED_HEAD=" + $expectHead)
Write-Host ("IDENTITY_FORENSIC=" + $(if ($forensic) { $forensic } else { 'NOT_SUPPLIED' }))
$fnroot = Join-Path $root 'functions'
$exit = 0
function Fail([string]$m) { Write-Host ("GATE FAIL: {0}" -f $m); $script:exit = 1 }
function Pass([string]$m) { Write-Host ("GATE PASS: {0}" -f $m) }

# ---- Strict Jest --json helpers (accepted architecture; fail-closed) ----
function Convert-NormName([string]$s) { if ($null -eq $s) { return '' }; $t = $s -replace ([char]27 + '\[[0-9;]*m'), ''; $t = $t -replace '\s+', ' '; return $t.Trim() }
function Test-HasProperty($obj, [string]$name) { if ($null -eq $obj) { return $false }; if ([string]::IsNullOrEmpty($name)) { return $false }; $p = $null; try { $p = $obj.PSObject.Properties } catch { return $false }; if ($null -eq $p) { return $false }; return ($null -ne ($p | Where-Object { $_.Name -eq $name } | Select-Object -First 1)) }
function Test-StrictTrue($v) { return (($v -is [bool]) -and ($v -eq $true)) }
function Test-StrictNonNegInt($v, [ref]$out) {
  $out.Value = $null
  if ($null -eq $v) { return $false }; if ($v -is [bool]) { return $false }; if ($v -is [string]) { return $false }; if ($v -is [array]) { return $false }
  if (($v -is [int]) -or ($v -is [long]) -or ($v -is [int16]) -or ($v -is [byte]) -or ($v -is [uint16]) -or ($v -is [uint32]) -or ($v -is [uint64])) { $l = [long]$v; if ($l -lt 0) { return $false }; $out.Value = $l; return $true }
  if (($v -is [double]) -or ($v -is [single]) -or ($v -is [decimal])) { if (($v -is [double]) -or ($v -is [single])) { $d0 = [double]$v; if ([double]::IsNaN($d0) -or [double]::IsInfinity($d0)) { return $false } }; $d = [double]$v; if ($d -lt 0) { return $false }; if ($d -gt 9.0e18) { return $false }; if ([math]::Floor($d) -ne $d) { return $false }; $out.Value = [long]$d; return $true }
  return $false
}
function Test-JsonSummaryStrict($j, [long]$minPassed) {
  if ($null -eq $j) { return @{ ok = $false; reason = 'root_null' } }
  if ($j -is [array]) { return @{ ok = $false; reason = 'root_array' } }
  if (($j -is [string]) -or ($j -is [bool]) -or ($j -is [int]) -or ($j -is [long]) -or ($j -is [double]) -or ($j -is [decimal])) { return @{ ok = $false; reason = 'root_scalar' } }
  foreach ($p in @('success', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests', 'numTotalTests', 'testResults')) { if (-not (Test-HasProperty $j $p)) { return @{ ok = $false; reason = ('missing_' + $p) } } }
  if (-not (Test-StrictTrue $j.success)) { return @{ ok = $false; reason = 'success_not_true_bool' } }
  $vp = [ref]$null; $vf = [ref]$null; $vpd = [ref]$null; $vt = [ref]$null; $vtot = [ref]$null
  if (-not (Test-StrictNonNegInt $j.numPassedTests $vp)) { return @{ ok = $false; reason = 'numPassedTests_type' } }
  if (-not (Test-StrictNonNegInt $j.numFailedTests $vf)) { return @{ ok = $false; reason = 'numFailedTests_type' } }
  if (-not (Test-StrictNonNegInt $j.numPendingTests $vpd)) { return @{ ok = $false; reason = 'numPendingTests_type' } }
  if (-not (Test-StrictNonNegInt $j.numTodoTests $vt)) { return @{ ok = $false; reason = 'numTodoTests_type' } }
  if (-not (Test-StrictNonNegInt $j.numTotalTests $vtot)) { return @{ ok = $false; reason = 'numTotalTests_type' } }
  if ($vf.Value -ne 0) { return @{ ok = $false; reason = 'failed_nonzero' } }
  if ($vpd.Value -ne 0) { return @{ ok = $false; reason = 'pending_nonzero' } }
  if ($vt.Value -ne 0) { return @{ ok = $false; reason = 'todo_nonzero' } }
  if ($vp.Value -lt $minPassed) { return @{ ok = $false; reason = 'passed_below_min' } }
  if ($vtot.Value -lt $minPassed) { return @{ ok = $false; reason = 'total_below_min' } }
  if (($vp.Value + $vf.Value + $vpd.Value + $vt.Value) -ne $vtot.Value) { return @{ ok = $false; reason = 'counts_inconsistent_with_total' } }
  $tr = $j.testResults; if ($null -eq $tr) { return @{ ok = $false; reason = 'testResults_null' } }; if (-not ($tr -is [array])) { return @{ ok = $false; reason = 'testResults_not_array' } }; if (@($tr).Count -eq 0) { return @{ ok = $false; reason = 'testResults_empty' } }
  return @{ ok = $true; reason = 'valid' }
}
function Read-JsonFileStrict([string]$path) {
  if ([string]::IsNullOrEmpty($path) -or -not (Test-Path $path)) { return @{ ok = $false; json = $null; reason = 'file_missing' } }
  $raw = $null; try { $raw = Get-Content -LiteralPath $path -Raw -ErrorAction Stop } catch { return @{ ok = $false; json = $null; reason = 'read_error' } }
  if ($null -eq $raw -or [string]::IsNullOrWhiteSpace($raw)) { return @{ ok = $false; json = $null; reason = 'empty_or_whitespace' } }
  $obj = $null; try { $obj = $raw | ConvertFrom-Json -ErrorAction Stop } catch { return @{ ok = $false; json = $null; reason = 'malformed_json' } }
  return @{ ok = $true; json = $obj; reason = 'parsed' }
}
function Test-CurrentRunFile([bool]$existedBefore, [bool]$existsAfter, $writeTime, [datetime]$runStart) { if ($existedBefore) { return $false }; if (-not $existsAfter) { return $false }; if ($null -eq $writeTime) { return $false }; return ([datetime]$writeTime -ge $runStart) }
function Get-JestAssertionRecords($jsonObj) {
  $records = New-Object System.Collections.Generic.List[object]; $idx = 0
  foreach ($tr in @($jsonObj.testResults)) { $file = ([string]$tr.name -replace '\\', '/'); foreach ($ar in @($tr.assertionResults)) { $records.Add([pscustomobject]@{ index = $idx; file = $file; fullName = (Convert-NormName ([string]$ar.fullName)); title = (Convert-NormName ([string]$ar.title)); status = ([string]$ar.status) }); $idx++ } }
  return , $records.ToArray()
}
function Find-ExactPassed($records, [string]$exact, [string]$fileSuffix) {
  $ex = Convert-NormName $exact; $sfx = $fileSuffix.ToLower()
  $hits = @($records | Where-Object { $_.status -eq 'passed' -and ($_.fullName -eq $ex -or $_.title -eq $ex) -and ($_.file.ToLower().EndsWith($sfx)) })
  if ($hits.Count -eq 1) { return $hits[0] }; return $null
}
function Test-RequiredNamedRecords($records, [string[]]$names, [string]$fileSuffix) {
  $matched = @(); $missing = @()
  foreach ($n in $names) { $r = Find-ExactPassed $records $n $fileSuffix; if ($null -eq $r) { $missing += $n } else { $matched += $r } }
  $indexes = @($matched | ForEach-Object { $_.index })
  $distinct = ($missing.Count -eq 0) -and ((@($indexes | Sort-Object -Unique)).Count -eq $names.Count)
  return [pscustomobject]@{ ok = $distinct; missing = $missing; matchedCount = $matched.Count; indexes = ($indexes -join ',') }
}
function New-FakeJest([object[]]$asserts, $success = $true, $numFailed = 0, $numPending = 0, $numTodo = 0, $numTotal = $null) {
  $byFile = @{}; foreach ($a in $asserts) { $f = [string]$a.file; if (-not $byFile.ContainsKey($f)) { $byFile[$f] = New-Object System.Collections.Generic.List[object] }; $byFile[$f].Add([pscustomobject]@{ fullName = $a.fullName; title = $a.fullName; status = $a.status }) }
  $tr = @(); foreach ($f in $byFile.Keys) { $tr += [pscustomobject]@{ name = $f; assertionResults = $byFile[$f].ToArray() } }
  $np = @($asserts | Where-Object { $_.status -eq 'passed' }).Count; $tot = if ($null -ne $numTotal) { $numTotal } else { $np + $numFailed + $numPending + $numTodo }
  return [pscustomobject]@{ success = $success; numPassedTests = $np; numFailedTests = $numFailed; numPendingTests = $numPending; numTodoTests = $numTodo; numTotalTests = $tot; testResults = $tr }
}
function Invoke-EmulatorSuite([string]$project, [string]$selectProject, [string]$relTestPath, [long]$minPassed) {
  $jsonDir = Join-Path ([System.IO.Path]::GetTempPath()) ('avalo-p0-02-' + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Force -Path $jsonDir | Out-Null
  $jsonPath = Join-Path $jsonDir 'suite.json'
  $runStart = Get-Date
  $jscript = "cd functions && node node_modules/jest/bin/jest.js --selectProjects $selectProject --runInBand --json --outputFile `"$jsonPath`" --runTestsByPath $relTestPath"
  Push-Location $root
  $emuLog = Join-Path $jsonDir 'emu.log'
  & firebase emulators:exec --only firestore --project $project $jscript *> $emuLog
  $emuExit = $LASTEXITCODE
  Pop-Location
  if (-not (Get-Command Test-EmulatorLifecycleHealthy -ErrorAction SilentlyContinue)) { . (Join-Path $root 'scripts\lib\EmulatorLifecycle.ps1') }
  $lifeReason = ''; $lifeOk = Test-EmulatorLifecycleHealthy -CliExit $emuExit -LogPath $emuLog -Reason ([ref]$lifeReason)
  $existsAfter = Test-Path $jsonPath
  $writeTime = if ($existsAfter) { (Get-Item $jsonPath).LastWriteTime } else { $null }
  $freshOk = Test-CurrentRunFile $false $existsAfter $writeTime $runStart
  $rd = Read-JsonFileStrict $jsonPath
  $sres = if ($rd.ok) { Test-JsonSummaryStrict $rd.json $minPassed } else { @{ ok = $false; reason = $rd.reason } }
  $records = if ($rd.ok) { Get-JestAssertionRecords $rd.json } else { @() }
  $res = [pscustomobject]@{ ok = $lifeOk -and $freshOk -and $rd.ok -and $sres.ok; emuExit = $emuExit; life = $lifeReason; fresh = $freshOk; rdOk = $rd.ok; schema = $sres.reason; json = $(if ($rd.ok) { $rd.json } else { $null }); records = $records }
  try { Remove-Item -Recurse -Force -LiteralPath $jsonDir -ErrorAction Stop } catch { Write-Host ("  (cleanup note: {0})" -f $jsonDir) }
  return $res
}

# ---- P0-02 exact required named tests + files + allowlist ----
$P02_FILE = 'p0-02-ai-billing-preauthorization.test.ts'
$P02_NAMES = @(
  'p0-02 r2: spend authority is canonical balance not tokensBalance (balance=1000,tokensBalance=0 authorizes)',
  'p0-02 r2: non-canonical tokensBalance cannot authorize (balance=0,tokensBalance=1000 denied)',
  'p0-02 r2: tokensBalance absent operates normally on canonical balance',
  'p0-02 r2: malformed canonical balance fails closed',
  'p0-02 r2: reserve moves balance into reservedTokens (canonical invariant)',
  'p0-02 r2: settlement writes exactly one canonical burn ledger entry linked to operation',
  'p0-02 r2: duplicate settlement emits no second economic ledger entry',
  'p0-02 r2: release writes a canonical release ledger entry and fabricates no spend',
  'p0-02 r2: wallet balance effect equals sum of canonical ledger entries',
  'p0-02 r2: exact duplicate is idempotent (one provider call, one charge)',
  'p0-02 r2: same request id with a different message is a conflict',
  'p0-02 r2: same request id with a different avatar is a conflict',
  'p0-02 r2: same request id with a different product is a conflict',
  'p0-02 r2: same request id for a different user is an isolated namespace',
  'p0-02 r2: concurrent exact duplicate yields a single provider execution',
  'p0-02 r2: missing request id produces a deterministic non-random operation identity',
  'p0-02 r2: missing operation id fails closed before any provider call',
  'p0-02 r2: oversized operation id fails closed before any provider call',
  'p0-02 r2: exact available balance succeeds',
  'p0-02 r2: insufficient balance invokes provider zero times',
  'p0-02 r2: unknown product invokes provider zero times',
  'p0-02 r2: preauthorization conflict invokes provider zero times',
  'p0-02 r2: provider success and settlement success charges exactly once',
  'p0-02 r2: provider known failure releases reservation and charges nothing',
  'p0-02 r2: provider uncertain error reconciles without releasing or re-charging',
  'p0-02 r2: retry after provider capture settles without re-invoking provider',
  'p0-02 r2: settled retry returns the captured result and does not re-invoke provider',
  'p0-02 r2: partial eligibility settles less and releases remainder to canonical balance',
  'p0-02 r2: two operations with funds for one authorize exactly one, no negative balance',
  'p0-02 r2: non-billable product performs no wallet or ledger mutation',
  'p0-02 r2: unknown product never falls back to free execution',
  'p0-02 r2: AI billing never mutates advertiser credit, creator earnings, or payouts',
  # R4 — EXACTLY-ONCE PROVIDER EXECUTION CLAIM (concurrent duplicate closure). Each is a fail-closed required record.
  'p0-02 r4: concurrent exact duplicate yields exactly one provider execution',
  'p0-02 r4: three concurrent exact duplicates yield exactly one provider execution',
  'p0-02 r4: ten concurrent exact duplicates yield exactly one provider execution',
  'p0-02 r4: concurrent duplicate loser does not invoke provider and observes in-progress or replay',
  'p0-02 r4: duplicate after provider capture does not re-invoke provider',
  'p0-02 r4: duplicate after settlement does not re-invoke provider',
  'p0-02 r4: same operation id different fingerprint conflicts before claim',
  'p0-02 r4: two distinct funded operations each invoke provider exactly once',
  'p0-02 r4: claim contention grants exactly one CLAIM_ACQUIRED',
  'p0-02 r4: provider execution claim id is server-generated not client-supplied',
  'p0-02 r4: claim cannot be acquired for a mismatched user',
  'p0-02 r4: claim across a different product is a fingerprint conflict',
  'p0-02 r4: second claim on a claimed operation is not acquired',
  'p0-02 r4: settled operation cannot be re-claimed for provider execution',
  'p0-02 r4: captured operation cannot be re-claimed for provider execution',
  'p0-02 r4: uncertain operation is not automatically re-claimed for provider execution',
  'p0-02 r4: released operation requires a new logical operation to invoke provider',
  'p0-02 r4: stress fifty concurrent exact-duplicate rounds never double-invoke provider'
)
# R4 EXACTLY-ONCE PROVIDER EXECUTION REGRESSION GATE — the subset of P02_NAMES that MUST exist + pass or the whole
# validator fails closed. This is the named gate against the Codex-proven concurrent-duplicate provider-duplication
# false-pass: a concurrent exact duplicate must yield exactly ONE provider execution (proven at 2/3/10-way and a
# 50-round stress replay), and the single provider-execution claim must be atomic and unforgeable.
$P02_EXACTLY_ONCE_REQUIRED = @(
  'p0-02 r4: concurrent exact duplicate yields exactly one provider execution',
  'p0-02 r4: three concurrent exact duplicates yield exactly one provider execution',
  'p0-02 r4: ten concurrent exact duplicates yield exactly one provider execution',
  'p0-02 r4: claim contention grants exactly one CLAIM_ACQUIRED',
  'p0-02 r4: provider execution claim id is server-generated not client-supplied',
  'p0-02 r4: stress fifty concurrent exact-duplicate rounds never double-invoke provider'
)
$P02_MIN_PASSED = 50
$RULES_FILE = 'p0-02-ai-billing-rules.test.ts'
$RULES_NAMES = @(
  'p0-02 rules: client cannot create ai_spend_authorizations doc',
  'p0-02 rules: client cannot update ai_spend_authorizations doc to settled',
  'p0-02 rules: client cannot create wallet balance',
  'p0-02 rules: client cannot inflate own wallet balance',
  'p0-02 rules: client cannot reduce own reservedTokens',
  'p0-02 rules: client cannot write canonical ledger entry'
)
$P02_ALLOW = @(
  'app-web/src/lib/ai-billing/aiSpendAuthorization.ts',
  'app-web/src/app/api/ai/chat/route.ts',
  'app-web/src/app/api/ai/escrow/route.ts',
  'functions/src/__tests__/p0-02-ai-billing-preauthorization.test.ts',
  'functions/tests/rules/p0-02-ai-billing-rules.test.ts',
  'scripts/validate-p0-02-ai-billing-preauthorization.ps1',
  # R3 — functions companion SAFE UNAVAILABLE containment
  'functions/src/ai-billing/legacyAiCompanionContainment.ts',
  'functions/src/aiCompanionFunctions.ts',
  'functions/src/aiCompanions.ts',
  'functions/src/__tests__/p0-02-r3-functions-companion-containment.test.ts'
)
# R3 containment suite (behavioral, wraps + invokes the real legacy callables).
$R3_FILE = 'p0-02-r3-functions-companion-containment.test.ts'
$R3_NAMES = @(
  'p0-02 r3: legacy companion containment guard throws unavailable',
  'p0-02 r3: sendAIMessage authenticated request fails unavailable before any provider call',
  'p0-02 r3: sendAIMessage unauthenticated request rejected before provider',
  'p0-02 r3: forged request fields cannot bypass sendAIMessage containment',
  'p0-02 r3: sendAIMessageCallable authenticated request returns unavailable before any provider call',
  'p0-02 r3: sendAIMessageCallable unauthenticated request rejected before provider',
  'p0-02 r3: contained callables never write users wallet, ledger, creator earnings, advertiser credit, or payouts'
)

Write-Host "=== 1. Identity + zero staged ==="
$top = (& git -C $root rev-parse --show-toplevel) 2>$null; $head = (& git -C $root rev-parse HEAD) 2>$null; $sym = (& git -C $root symbolic-ref -q HEAD) 2>$null; $fhead = (& git -C $forensic rev-parse HEAD) 2>$null
$staged = @(& git -C $root diff --cached --name-only | Where-Object { $_.Trim() -ne '' }).Count
if ((($top -replace '\\','/') -eq ($root -replace '\\','/')) -and $head -eq $expectHead -and -not $sym -and ($(if ($forensic) { $fhead -eq $expectHead } else { $true })) -and $staged -eq 0) { Pass "identity + detached HEAD + forensic untouched + staged=0" } else { Fail ("identity/staged (staged={0})" -f $staged) }

# ---- child validator invocation (file-redirected, persisted) ---------------------------------------------
# NEVER `*>&1` into a variable: that tangles the stdio of the `firebase emulators:exec` processes the child
# spawns, so its nested suites can silently fail and its markers never appear - the failure mode
# validate-p0-iam-01a documents and avoids by redirecting to a file. The transcript is also EVIDENCE: it is
# written to a run-scoped directory, hashed, and never deleted, so a failing child can be diagnosed instead
# of being reported as a bare non-zero exit.
$CHILD_EVIDENCE_DIR = Join-Path $env:TEMP ('avalo-iam-child-evidence\' + 'p0-02-ai-billing-preauthorization' + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID)
[void][System.IO.Directory]::CreateDirectory($CHILD_EVIDENCE_DIR)
function Invoke-ChildValidator {
  param([Parameter(Mandatory)][string]$ScriptPath, [Parameter(Mandatory)][string]$Name)
  $t = Join-Path $CHILD_EVIDENCE_DIR ($Name + '.transcript.txt')
  & $ScriptPath -Repo $root -ExpectedHead $expectHead *> $t
  $ex = $LASTEXITCODE
  $bytes = 0; $sha = ''; $text = ''
  if (Test-Path -LiteralPath $t -PathType Leaf) {
    $raw = [System.IO.File]::ReadAllBytes($t)
    $bytes = $raw.Length
    $h = [System.Security.Cryptography.SHA256]::Create()
    try { $sha = ([BitConverter]::ToString($h.ComputeHash($raw)) -replace '-', '') } finally { $h.Dispose() }
    $text = [System.IO.File]::ReadAllText($t)
  }
  Write-Host ("  CHILD {0}: exit={1} bytes={2} sha256={3} transcript={4}" -f $Name, $ex, $bytes, $sha, $t)
  # A failing child says why, in the parent's own output, at the point of failure.
  if ($ex -ne 0) {
    foreach ($ln in @($text -split "`r?`n" | Where-Object { $_ -match 'GATE FAIL|RESULT:' } | Select-Object -First 6)) {
      Write-Host ("    CHILD {0} >> {1}" -f $Name, $ln)
    }
  }
  return [pscustomobject]@{ Exit = $ex; Text = $text; Transcript = $t; Sha256 = $sha; Bytes = $bytes }
}

Write-Host "=== 2. Prior accepted validators still green (transition + Layer 1 + P0-01) ==="
$tvChild = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-clean-worktree-layer0-support.ps1') -Name 'CHILD_CLEAN_WORKTREE_LAYER0_SUPPORT'; $tvExit = $tvChild.Exit; $tv = $tvChild.Text
$tvOk = ($tvExit -eq 0) -and (($tv | Select-String -SimpleMatch 'RESULT: CLEAN_WORKTREE_LAYER0_TO_LAYER1_TRANSITION_CONTRACT_PASS').Count -gt 0)
$l1Child = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-clean-worktree-layer1-payment-foundation-and-p0-04.ps1') -Name 'CHILD_CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04'; $l1Exit = $l1Child.Exit; $l1 = $l1Child.Text
$l1Ok = ($l1Exit -eq 0) -and (($l1 | Select-String -SimpleMatch 'RESULT: CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04_PASS').Count -gt 0)
$p01Child = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-p0-01-advertiser-credit-authorization.ps1') -Name 'CHILD_P0_01_ADVERTISER_CREDIT_AUTHORIZATION'; $p01Exit = $p01Child.Exit; $p01 = $p01Child.Text
$p01Ok = ($p01Exit -eq 0) -and (($p01 | Select-String -SimpleMatch 'RESULT: P0_01_ADVERTISER_CREDIT_AUTHORIZATION_PASS').Count -gt 0)
if ($tvOk -and $l1Ok -and $p01Ok) { Pass ("transition exit {0} + Layer 1 exit {1} + P0-01 exit {2}, all markers" -f $tvExit, $l1Exit, $p01Exit) } else { Fail ("prior validators (tv={0} l1={1} p01={2})" -f $tvExit, $l1Exit, $p01Exit) }

Write-Host "=== 3. Changed-file allowlist (P0-02 changes subset of allowlist) ==="
$changed = @(); foreach ($l in @(& git -C $root status --short -uall)) { if ($l.Length -gt 3) { $changed += ($l.Substring(3).Trim() -replace '\\', '/') } }
$p02Changed = @($changed | Where-Object { $_ -match 'ai-billing|p0-02|api/ai/(chat|escrow)/route|validate-p0-02|aiCompanionFunctions|aiCompanions\.ts' })
$outside = @($p02Changed | Where-Object { $_ -notin $P02_ALLOW })
if ($outside.Count -eq 0) { Pass ("P0-02 changed files within allowlist ({0})" -f ($p02Changed -join ', ')) } else { $outside | ForEach-Object { Write-Host "  OUTSIDE: $_" }; Fail 'P0-02 allowlist' }

Write-Host "=== 4. No package/lock drift; no forbidden path in P0-02 change ==="
$forbiddenHit = @($changed | Where-Object { $_ -match 'firestore\.rules$|storage\.rules$|firebase\.json$|\.firebaserc$|^infrastructure/firebase/|pnpm-lock|yarn\.lock' })
$pkgHit = @($p02Changed | Where-Object { $_ -match 'package\.json$|package-lock\.json$' })
$appWebOutside = @($p02Changed | Where-Object { $_ -match '^app-web/' -and $_ -notin @('app-web/src/app/api/ai/chat/route.ts','app-web/src/app/api/ai/escrow/route.ts','app-web/src/lib/ai-billing/aiSpendAuthorization.ts') })
if ($forbiddenHit.Count -eq 0 -and $pkgHit.Count -eq 0 -and $appWebOutside.Count -eq 0) { Pass 'no forbidden/package path in P0-02 change (app-web limited to the two AI routes)' } else { $forbiddenHit + $appWebOutside | ForEach-Object { Write-Host "  FORBIDDEN: $_" }; Fail 'forbidden/package drift' }

Write-Host "=== 5. Canonical module (R2): canonical balance authority + canonical ledger + semantic idempotency ==="
$mod = Get-Content (Join-Path $root 'app-web\src\lib\ai-billing\aiSpendAuthorization.ts') -Raw
$g5 = @{
  serverPolicy     = ($mod -match 'function resolveAiBillingPolicy') -and ($mod -match "billingClass: 'BILLABLE'") -and ($mod -match "unitPriceTokens: 3")
  unknownFailClosed = ($mod -match "billingClass: 'DISABLED'") -and ($mod -match 'product_disabled_or_unknown')
  freeExplicit     = ($mod -match "billingClass: 'NON_BILLABLE'")
  canonicalBalance = ($mod -match "readCanonicalBalance") -and ($mod -match "data\['balance'\]") -and ($mod -match 'malformed_canonical_balance')  # spend authority = canonical balance
  noTokensBalanceAuthority = ($mod -notmatch "data\['tokensBalance'\]") -and ($mod -notmatch 'tokensBalance: fv\.increment') # tokensBalance is NEVER read/mutated as authority
  atomicReserve    = ($mod -match 'balance: fv\.increment\(-') -and ($mod -match 'reservedTokens: fv\.increment\(reservedTokens')
  canonicalLedger  = ($mod -match "LEDGER_COLLECTION = 'ledger'") -and ($mod -match 'CHAT_RESPONSE_BURN') -and ($mod -match 'CHAT_RESERVATION_RESERVE') -and ($mod -match 'CHAT_RESERVATION_RELEASE') -and ($mod -match 'function writeLedger')
  preauthSettleRelease = ($mod -match 'export async function preauthorizeAiSpend') -and ($mod -match 'export async function settleAiSpend') -and ($mod -match 'export async function releaseAiSpend')
  captureRetry     = ($mod -match 'export async function captureProviderResult') -and ($mod -match "PROVIDER_CAPTURED")
  reconciliation   = ($mod -match 'FAILED_RECONCILIATION') -and ($mod -match 'AiProviderUncertainError') -and ($mod -match 'AiSettlementReconciliationError')
  semanticFingerprint = ($mod -match 'function fingerprint') -and ($mod -match 'avatarId') -and ($mod -match 'payloadDigest') -and ($mod -match 'AiBillingConflictError')
  safeInt          = ($mod -match 'Number\.isSafeInteger')
  singleWallet     = ($mod -match "WALLETS_COLLECTION = 'wallets'") -and ($mod -notmatch 'users/.*wallet/current')
  dependencyInjected = ($mod -notmatch "from 'firebase-admin") -and ($mod -match 'FieldValueLike') -and ($mod -match 'FirestoreLike')  # crypto-only + injected db/FieldValue (cross-package safe)
  noClientPrice    = ($mod -notmatch 'clientPrice') -and ($mod -notmatch 'req\.body\.price')
  # R4 EXACTLY-ONCE PROVIDER EXECUTION CLAIM (server-authoritative, atomic): only the single transaction that
  # transitions PREAUTHORIZED -> PROVIDER_CLAIMED receives CLAIM_ACQUIRED; the claim id is server-generated
  # (never client-supplied); duplicates observe IN_PROGRESS; the orchestrator gates the provider call on the claim.
  providerClaim    = ($mod -match 'export async function claimProviderExecution') -and ($mod -match 'PROVIDER_CLAIMED') -and ($mod -match "'CLAIM_ACQUIRED'") -and ($mod -match "'IN_PROGRESS'")
  claimServerGenerated = ($mod -match "providerClaimId = createHash") -and ($mod -notmatch 'params\.providerClaimId') -and ($mod -notmatch 'params\.claimId')
  claimGatesProvider = ($mod -match "claim\.status === 'CLAIM_ACQUIRED'") -and ($mod -match 'await claimProviderExecution')
}
$g5bad = @($g5.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($g5bad.Count -eq 0) { Pass 'canonical module R2: canonical wallets.balance authority (no tokensBalance), canonical ledger settle/release, capture/retry convergence, reconciliation, semantic idempotency, dependency-injected (cross-package safe)' } else { $g5bad | ForEach-Object { Write-Host "  MISSING CONTROL: $_" }; Fail 'canonical module R2 controls' }

Write-Host "=== 6. Chat route: preauthorization-before-provider ordering; no fail-open; no client price authority ==="
$chat = Get-Content (Join-Path $root 'app-web\src\app\api\ai\chat\route.ts') -Raw
# The provider fetch must live INSIDE the injected providerFn passed to runBillableAiOperation; the route must not
# retain the old non-fatal post-provider escrow deduction, and must not use client tokensToDeduct for pricing.
$idxProviderFn = $chat.IndexOf('const providerFn'); $idxFetch = $chat.IndexOf('fetch(ANTHROPIC_API_URL'); $idxRun = $chat.IndexOf('await runBillableAiOperation')
$g6 = @{
  usesOrchestrator = ($idxRun -ge 0)
  fetchInsideProviderFn = ($idxProviderFn -ge 0) -and ($idxFetch -gt $idxProviderFn) -and ($idxRun -gt $idxProviderFn) -and ($idxRun -gt $idxFetch)
  serverProduct = ($chat -match "AI_PRODUCT = 'ai_companion'")
  noFailOpenEscrow = ($chat -notmatch 'Non-fatal') -and ($chat -notmatch "collection\('chat_escrows'\)") -and ($chat -notmatch 'Escrow deduction failed')
  clientAmountIgnored = ($chat -match 'void tokensToDeduct') -and ($chat -notmatch 'tokensToDeduct[^;]*runBillableAiOperation')
  insufficientMapped = ($chat -match 'AiInsufficientFundsError')
  appWebOwnedImport = ($chat -match "from '@/lib/ai-billing/aiSpendAuthorization'")  # app-web-owned (Next-traced), NOT a deep sibling import
  noDeepFunctionsImport = ($chat -notmatch 'functions/src/ai-billing')                # Blocker D: no cross-package deep import
  semanticInputs = ($chat -match 'payloadDigest\(') -and ($chat -match 'avatarId')      # avatar + payload digest fed to fingerprint
  reconcileMapped = ($chat -match 'AiSettlementReconciliationError') -and ($chat -match 'AiProviderUncertainError') -and ($chat -match 'AiBillingConflictError')
  requiresOperationId = ($chat -match 'BILLABLE_OPERATION_ID_REQUIRED')                  # STEP 8: missing id fails closed
  noRandomOperationId = ($chat -notmatch 'randomUUID')                                   # no random fallback that defeats idempotency
}
$g6bad = @($g6.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($g6bad.Count -eq 0) { Pass 'chat route: provider fetch only inside injected providerFn (after preauth); no fail-open escrow; client amount ignored' } else { $g6bad | ForEach-Object { Write-Host "  MISSING CONTROL: $_" }; Fail 'chat route ordering controls' }

Write-Host "=== 7. Escrow route: client-triggered wallet mutation contained (no parallel billing writer) ==="
$escrow = Get-Content (Join-Path $root 'app-web\src\app\api\ai\escrow\route.ts') -Raw
$g7 = @{
  contained = ($escrow -match 'escrow_prefunding_retired')
  noWalletMutation = ($escrow -notmatch 'tokensBalance: FieldValue\.increment') -and ($escrow -notmatch 'runTransaction')
}
$g7bad = @($g7.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($g7bad.Count -eq 0) { Pass 'escrow route: deposit/refund wallet mutation contained (fail-closed); status read-only' } else { $g7bad | ForEach-Object { Write-Host "  MISSING CONTROL: $_" }; Fail 'escrow containment controls' }

Write-Host "=== 8. Checkout OFF + advertiser credit OFF (unchanged by P0-02) ==="
$coHit = $false
foreach ($rel in @('functions/src/pack349-billing.ts')) { $p = Join-Path $root ($rel -replace '/', '\'); if (Test-Path $p) { $t = Get-Content $p -Raw; if ($t -match "ADVERTISER_CREDIT_ENABLED\s*=\s*'true'") { $coHit = $true } } }
if (-not $coHit) { Pass 'advertiser credit remains OFF; P0-02 does not enable checkout/advertiser funding' } else { Fail 'advertiser credit enabled in source' }

Write-Host "=== 8g. GLOBAL AI COVERAGE: legacy Functions companion callables contained; no reachable billable path unclassified ==="
# Extract a named callable's body from source (from its 'export const NAME' to the next 'export const ').
function Get-CallableBody([string]$src, [string]$name) {
  $i = $src.IndexOf('export const ' + $name + ' ')
  if ($i -lt 0) { $i = $src.IndexOf('export const ' + $name + '=') }
  if ($i -lt 0) { return '' }
  $j = $src.IndexOf('export const ', $i + 10); if ($j -lt 0) { $j = $src.Length }
  return $src.Substring($i, $j - $i)
}
# A reachable billable callable body is CONTAINED iff it fails closed (unavailable marker) AND makes no provider
# call (no `await generateAIResponse`) AND does not mutate the non-canonical nested wallet. This predicate is the
# global-coverage authority; it is self-tested below against a reintroduced provider-before-billing fixture.
function Test-CallableContained([string]$body) {
  if ([string]::IsNullOrEmpty($body)) { return $false }
  $failsClosed = ($body -match 'LEGACY_AI_COMPANION_UNAVAILABLE')
  $noProvider  = ($body -notmatch 'await generateAIResponse')
  $noNestedWallet = ($body -notmatch "wallet'\)\.doc\('current'\)") -and ($body -notmatch 'wallet/current')
  return ($failsClosed -and $noProvider -and $noNestedWallet)
}
# FALSE-PASS NEGATIVE SELF-TEST (AC#15): a reintroduced provider-before-billing body MUST be rejected.
$badFixture = "export const sendAIMessage = onCall(async (r) => { const x = await generateAIResponse(a,b); const w = db.collection('users').doc(u).collection('wallet').doc('current'); });"
$goodFixture = "export const sendAIMessage = onCall(async (r) => { if(!r.auth){throw e;} throw new HttpsError('failed-precondition', LEGACY_AI_COMPANION_UNAVAILABLE); });"
$selfNeg = (-not (Test-CallableContained $badFixture)); $selfPos = (Test-CallableContained $goodFixture)
Write-Host ("  containment predicate self-test: rejectsBad={0} acceptsGood={1}" -f $selfNeg, $selfPos)
# Apply to the REAL reachable billable callables.
$aicf = Get-Content (Join-Path $fnroot 'src\aiCompanionFunctions.ts') -Raw
$aic  = Get-Content (Join-Path $fnroot 'src\aiCompanions.ts') -Raw
$idx  = Get-Content (Join-Path $fnroot 'src\index.ts') -Raw
$sendAiMsgContained  = Test-CallableContained (Get-CallableBody $aicf 'sendAIMessage')
$sendAiCallContained = Test-CallableContained (Get-CallableBody $aic 'sendAIMessageCallable')
# Residual candidates must remain UNREACHABLE (not exported via index.ts barrel) => no reachable billable path escapes.
$packUnexported = ($idx -notmatch "from './pack279-ai-chat-runtime'") -and ($idx -notmatch "from './pack279-ai-voice-runtime'") -and ($idx -notmatch "from './pack291-ai-service'") -and ($idx -notmatch "from './pack322-ai-video-runtime'")
$containmentModulePresent = Test-Path (Join-Path $fnroot 'src\ai-billing\legacyAiCompanionContainment.ts')
$g8g = @{ selfTestRejectsBad=$selfNeg; selfTestAcceptsGood=$selfPos; sendAIMessageContained=$sendAiMsgContained; sendAIMessageCallableContained=$sendAiCallContained; packRuntimesUnreachable=$packUnexported; containmentModulePresent=$containmentModulePresent }
$g8gbad = @($g8g.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($g8gbad.Count -eq 0) { Pass 'GLOBAL: both reachable Functions billable callables are SAFE_UNAVAILABLE (no provider-before-billing, no nested-wallet mutation); pack runtimes unreachable; false-pass self-test rejects a reintroduced unsafe body' }
else { $g8gbad | ForEach-Object { Write-Host "  COVERAGE FAIL: $_" }; Fail 'global AI coverage / containment' }

Write-Host "=== 9. PARSER SELF-TESTS (schema + distinct named-record, fail-closed) ==="
$goodRecs = @(); foreach ($n in $P02_NAMES) { $goodRecs += @{ file = "src/__tests__/$P02_FILE"; fullName = $n; status = 'passed' } }
$selfTotal = 0; $selfPass = 0; $selfFail = @()
$selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $goodRecs)) $P02_NAMES $P02_FILE; if ($r.ok) { $selfPass++ } else { $selfFail += 'POS all-names' }
$selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest ($goodRecs | Select-Object -Skip 1))) $P02_NAMES $P02_FILE; if (-not $r.ok) { $selfPass++ } else { $selfFail += 'neg missing-one' }
$combined = @(@{ file = "src/__tests__/$P02_FILE"; fullName = ($P02_NAMES -join ' AND '); status = 'passed' }); $selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $combined)) $P02_NAMES $P02_FILE; if (-not $r.ok) { $selfPass++ } else { $selfFail += 'neg combined-title' }
$skipped = @(); foreach ($n in $P02_NAMES) { $skipped += @{ file = "src/__tests__/$P02_FILE"; fullName = $n; status = 'skipped' } }; $selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $skipped)) $P02_NAMES $P02_FILE; if (-not $r.ok) { $selfPass++ } else { $selfFail += 'neg skipped' }
$wrongFile = @(); foreach ($n in $P02_NAMES) { $wrongFile += @{ file = 'src/__tests__/other.test.ts'; fullName = $n; status = 'passed' } }; $selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $wrongFile)) $P02_NAMES $P02_FILE; if (-not $r.ok) { $selfPass++ } else { $selfFail += 'neg wrong-file' }
function _B { return [pscustomobject]@{ success = $true; numPassedTests = [long]32; numFailedTests = [long]0; numPendingTests = [long]0; numTodoTests = [long]0; numTotalTests = [long]32; testResults = @([pscustomobject]@{ name = 'x'; assertionResults = @() }) } }
function _wo($o, $n) { $h = [ordered]@{}; foreach ($p in $o.PSObject.Properties) { if ($p.Name -ne $n) { $h[$p.Name] = $p.Value } }; return [pscustomobject]$h }
function _wi($o, $n, $v) { $h = [ordered]@{}; foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }; $c = [pscustomobject]$h; $c.$n = $v; return $c }
$schemaFix = @(
  @{ n = 'schema POS'; j = (_B); ok = $true }, @{ n = 'schema missing numFailedTests'; j = (_wo (_B) 'numFailedTests'); ok = $false },
  @{ n = 'schema null numTodoTests'; j = (_wi (_B) 'numTodoTests' $null); ok = $false }, @{ n = 'schema success=1'; j = (_wi (_B) 'success' 1); ok = $false },
  @{ n = 'schema failed>0'; j = (_wi (_wi (_B) 'numFailedTests' ([long]1)) 'numTotalTests' ([long]20)); ok = $false }, @{ n = 'schema string count'; j = (_wi (_B) 'numPassedTests' '19'); ok = $false },
  @{ n = 'schema root scalar'; j = ([long]5); ok = $false }, @{ n = 'schema inconsistent total'; j = (_wi (_B) 'numTotalTests' ([long]99)); ok = $false }
)
foreach ($fx in $schemaFix) { $selfTotal++; if ((Test-JsonSummaryStrict $fx.j 32).ok -eq $fx.ok) { $selfPass++ } else { $selfFail += $fx.n } }
Write-Host ("  parser self-tests: {0}/{1}" -f $selfPass, $selfTotal); if ($selfFail.Count -gt 0) { $selfFail | ForEach-Object { Write-Host "  SELF-TEST FAIL: $_" } }
$selfOk = ($selfPass -eq $selfTotal)
if ($selfOk) { Pass ("parser self-tests all pass ({0})" -f $selfTotal) } else { Fail 'parser self-tests' }

Write-Host "=== 10. Emulator-backed P0-02 preauthorization suite (main) + distinct exact named records ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent' }
elseif (-not $selfOk) { Fail 'skipping real run: parser self-tests failed' }
else {
  $m = Invoke-EmulatorSuite 'demo-avalo' 'main' "src/__tests__/$P02_FILE" $P02_MIN_PASSED
  Write-Host ("  main jest --json -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} fresh={6} schema={7}" -f $(if ($m.rdOk) { $m.json.numPassedTests } else { '?' }), $(if ($m.rdOk) { $m.json.numFailedTests } else { '?' }), $(if ($m.rdOk) { $m.json.numPendingTests } else { '?' }), $(if ($m.rdOk) { $m.json.numTodoTests } else { '?' }), $(if ($m.rdOk) { $m.json.numTotalTests } else { '?' }), $m.emuExit, $m.fresh, $m.schema)
  if ($m.ok) { Pass 'P0-02 preauthorization suite: strict schema valid, current-run temp JSON' } else { Fail ("P0-02 suite (emuExit={0} fresh={1} schema={2})" -f $m.emuExit, $m.fresh, $m.schema) }
  $rq = Test-RequiredNamedRecords $m.records $P02_NAMES $P02_FILE
  Write-Host ("  required named records matched={0}/{1} distinctIndexes=[{2}] missing=[{3}]" -f $rq.matchedCount, $P02_NAMES.Count, $rq.indexes, ($rq.missing -join '; '))
  if ($rq.ok -and $m.ok) { Pass ("all {0} required exact P0-02 named tests executed+passed as distinct records" -f $P02_NAMES.Count) } else { Fail 'required P0-02 named records' }

  Write-Host "=== 10x. EXACTLY-ONCE PROVIDER EXECUTION REGRESSION GATE (fail-closed on concurrent duplicate provider-duplication) ==="
  # Fail the WHOLE validator if any exactly-once required test is absent or did not pass as a distinct record. This is
  # the named gate that a prior validator lacked (its concurrency test tolerated the race via toBeLessThanOrEqual(1)).
  $eo = Test-RequiredNamedRecords $m.records $P02_EXACTLY_ONCE_REQUIRED $P02_FILE
  Write-Host ("  exactly-once required records matched={0}/{1} missing=[{2}]" -f $eo.matchedCount, $P02_EXACTLY_ONCE_REQUIRED.Count, ($eo.missing -join '; '))
  $claimSrcOk = ($g5.providerClaim -and $g5.claimServerGenerated -and $g5.claimGatesProvider)
  if ($eo.ok -and $m.ok -and $claimSrcOk) { Pass 'EXACTLY-ONCE: atomic server-generated provider-execution claim present; 2/3/10-way + claim-contention + stress-50 exactly-once tests executed+passed' }
  else { if (-not $claimSrcOk) { Write-Host '  CLAIM MECHANISM SOURCE MISSING (providerClaim/claimServerGenerated/claimGatesProvider)' }; Fail 'exactly-once provider execution regression gate' }
}

Write-Host "=== 10r. Emulator-backed AI-billing RULES denial suite (rules) + distinct named records ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent (rules)' }
elseif (-not $selfOk) { Fail 'skipping rules run: parser self-tests failed' }
else {
  $rr = Invoke-EmulatorSuite 'demo-p0-02-rules' 'rules' "tests/rules/$RULES_FILE" 6
  Write-Host ("  rules jest --json -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} fresh={6} schema={7}" -f $(if ($rr.rdOk) { $rr.json.numPassedTests } else { '?' }), $(if ($rr.rdOk) { $rr.json.numFailedTests } else { '?' }), $(if ($rr.rdOk) { $rr.json.numPendingTests } else { '?' }), $(if ($rr.rdOk) { $rr.json.numTodoTests } else { '?' }), $(if ($rr.rdOk) { $rr.json.numTotalTests } else { '?' }), $rr.emuExit, $rr.fresh, $rr.schema)
  if ($rr.ok) { Pass 'AI-billing rules denial suite: strict schema valid, current-run temp JSON' } else { Fail ("rules suite (emuExit={0} fresh={1} schema={2})" -f $rr.emuExit, $rr.fresh, $rr.schema) }
  $rrq = Test-RequiredNamedRecords $rr.records $RULES_NAMES $RULES_FILE
  Write-Host ("  required rules named records matched={0}/{1} distinctIndexes=[{2}] missing=[{3}]" -f $rrq.matchedCount, $RULES_NAMES.Count, $rrq.indexes, ($rrq.missing -join '; '))
  if ($rrq.ok -and $rr.ok) { Pass ("all {0} required AI-billing rules denial tests executed+passed as distinct records" -f $RULES_NAMES.Count) } else { Fail 'required rules denial named records' }
}

Write-Host "=== 10c. Emulator-backed R3 Functions-companion CONTAINMENT suite (wrap+invoke real callables) + distinct records ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent (r3)' }
elseif (-not $selfOk) { Fail 'skipping r3 run: parser self-tests failed' }
else {
  $c3 = Invoke-EmulatorSuite 'demo-avalo' 'main' "src/__tests__/$R3_FILE" 7
  Write-Host ("  r3 jest --json -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} fresh={6} schema={7}" -f $(if ($c3.rdOk) { $c3.json.numPassedTests } else { '?' }), $(if ($c3.rdOk) { $c3.json.numFailedTests } else { '?' }), $(if ($c3.rdOk) { $c3.json.numPendingTests } else { '?' }), $(if ($c3.rdOk) { $c3.json.numTodoTests } else { '?' }), $(if ($c3.rdOk) { $c3.json.numTotalTests } else { '?' }), $c3.emuExit, $c3.fresh, $c3.schema)
  if ($c3.ok) { Pass 'R3 containment suite: strict schema valid, current-run temp JSON' } else { Fail ("R3 containment suite (emuExit={0} fresh={1} schema={2})" -f $c3.emuExit, $c3.fresh, $c3.schema) }
  $c3q = Test-RequiredNamedRecords $c3.records $R3_NAMES $R3_FILE
  Write-Host ("  required r3 named records matched={0}/{1} distinctIndexes=[{2}] missing=[{3}]" -f $c3q.matchedCount, $R3_NAMES.Count, $c3q.indexes, ($c3q.missing -join '; '))
  if ($c3q.ok -and $c3.ok) { Pass ("all {0} required R3 containment tests executed+passed as distinct records (provider spy 0; zero non-canonical writes)" -f $R3_NAMES.Count) } else { Fail 'required R3 containment named records' }
}

Write-Host ""
if ($exit -eq 0) { Write-Host 'CHECKOUT: OFF ; ADVERTISER CREDIT: OFF ; AI SPEND: SERVER-AUTHORITATIVE PREAUTHORIZED (provider only after reserve)'; Write-Host 'RESULT: P0_02_AI_BILLING_PREAUTHORIZATION_PASS' }
else { Write-Host 'RESULT: P0_02_AI_BILLING_PREAUTHORIZATION_FAIL' }
exit $exit
