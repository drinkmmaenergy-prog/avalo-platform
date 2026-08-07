#Requires -Version 5.1
<#
  validate-p0-iam-01a-financial-authority-trust-boundary-foundation.ps1 — READ-ONLY, fail-closed. (pwsh 7+.)
  P0-IAM-01A — KMS-ready financial-authority provenance foundation for `/paidChats` (first proving ground).

  Establishes: deterministic canonical fingerprint; immutable authority envelope; narrow signer/verifier interfaces;
  production signer/verifier SAFE_UNAVAILABLE (no secret/private key/HMAC in repo, no fallback); a public-key verifier;
  loader verifies provenance BEFORE minting -> arbitrary Admin-capable schema-valid write cannot become a loadable
  authority (closes the Codex "schema-validity != writer-provenance" defect at the code layer). Positive verification is
  possible ONLY under a test-injected verifier holding the corresponding public key; production stays fail-closed.
  Billing stays DISABLED (sendChatMessage HARD_FAIL_CLOSED; c5 SAFE_UNAVAILABLE; 0 active billing paths). P0-05 / R1B-2
  remain OPEN. On FULL PASS (exit 0): P0_IAM_01A_FINANCIAL_AUTHORITY_TRUST_BOUNDARY_FOUNDATION_PASS ; else ..._FAIL (1).
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Continue'
$root = 'C:\a\avalo-controlled-enablement-clean'
$forensic = 'C:\a\avalo'
$expectHead = '4224fd324ee24e387b189fb9307caa05c9ca1ef0'
$fnroot = Join-Path $root 'functions'
$exit = 0
function Fail([string]$m) { Write-Host ("GATE FAIL: {0}" -f $m); $script:exit = 1 }
function Pass([string]$m) { Write-Host ("GATE PASS: {0}" -f $m) }

$FP = Join-Path $fnroot 'src\security\financialAuthority\canonicalFingerprint.ts'
$ENVF = Join-Path $fnroot 'src\security\financialAuthority\authorityEnvelope.ts'
$PROV = Join-Path $fnroot 'src\security\financialAuthority\authorityProvenance.ts'
$LOADER = Join-Path $fnroot 'src\chat\paidChatAuthority.ts'
$TESTSIGNER = Join-Path $fnroot 'src\__tests__\helpers\iam01aTestSigner.ts'
$MAIN_FILE = 'p0-iam-01a-financial-authority-trust-boundary-foundation.test.ts'

$IAM_ALLOW = @(
  'functions/src/security/financialAuthority/canonicalFingerprint.ts',
  'functions/src/security/financialAuthority/authorityEnvelope.ts',
  'functions/src/security/financialAuthority/authorityProvenance.ts',
  'functions/src/chat/paidChatAuthority.ts',
  'functions/src/__tests__/helpers/iam01aTestSigner.ts',
  'functions/src/__tests__/p0-iam-01a-financial-authority-trust-boundary-foundation.test.ts',
  'functions/src/__tests__/p0-05-r1b2-server-owned-paidchat-authority.test.ts',
  'scripts/validate-p0-iam-01a-financial-authority-trust-boundary-foundation.ps1'
)

# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Write-Host "=== GATE 1. Identity + staged=0 + bounded scope ==="
$top = (& git -C $root rev-parse --show-toplevel) 2>$null
$head = (& git -C $root rev-parse HEAD) 2>$null
$sym = (& git -C $root symbolic-ref -q HEAD) 2>$null
$fhead = (& git -C $forensic rev-parse HEAD) 2>$null
$staged = @(& git -C $root diff --cached --name-only | Where-Object { $_.Trim() -ne '' }).Count
$changed = @(); foreach ($l in @(& git -C $root status --short -uall)) { if ($l.Length -gt 3) { $changed += ($l.Substring(3).Trim() -replace '\\', '/') } }
# Files this task is responsible for = those matching the IAM-01A footprint.
# Scope to THIS stage's exact files only (not the whole security/financialAuthority/ directory, so later stages that add
# authorized files there — e.g. P0-IAM-01B — are not falsely flagged by this closed stage's validator).
$iamChanged = @($changed | Where-Object { $_ -match 'security/financialAuthority/(canonicalFingerprint|authorityEnvelope|authorityProvenance)\.ts|iam01aTestSigner|p0-iam-01a-financial-authority-trust-boundary-foundation|p0-05-r1b2-server-owned-paidchat-authority\.test\.ts|chat/paidChatAuthority\.ts' })
$outside = @($iamChanged | Where-Object { $_ -notin $IAM_ALLOW })
$runtimeChanged = @($iamChanged | Where-Object { $_ -match '^functions/src/' -and $_ -notmatch '__tests__' })
$pkgHit = @($changed | Where-Object { $_ -match 'package\.json$|package-lock\.json$|pnpm-lock|yarn\.lock' })
$idOk = ((($top -replace '\\', '/') -eq 'C:/a/avalo-controlled-enablement-clean') -and $head -eq $expectHead -and -not $sym -and $fhead -eq $expectHead -and $staged -eq 0)
# package/lock is a PRE-EXISTING baseline modification (not IAM-induced): assert this task added no dependency line.
$pkgDiff = (& git -C $root diff -- functions/package.json) 2>$null
$pkgDepAdded = @($pkgDiff | Select-String -Pattern '^\+\s*"(?!name|version)[^"]+"\s*:\s*"[\^~0-9]' | Where-Object { $_ -match 'kms|crypto|jose|forge|signer' })
if ($idOk -and $outside.Count -eq 0 -and $runtimeChanged.Count -le 8 -and $pkgDepAdded.Count -eq 0) {
  Pass ("identity + staged=0 + IAM-01A diff within allowlist (runtime files={0}; no task-induced dep)" -f $runtimeChanged.Count)
} else { $outside | ForEach-Object { Write-Host "  OUTSIDE: $_" }; Fail ("identity/diff (staged={0} runtime={1} outside={2} depAdded={3})" -f $staged, $runtimeChanged.Count, $outside.Count, $pkgDepAdded.Count) }
if ($runtimeChanged.Count -gt 8) { Write-Host 'STOP — P0-IAM-01A REQUIRES SCOPE REVIEW' }

# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Write-Host "=== GATE 2. Prior required validators green (cascade via R1B-1; FILE-redirected) ==="
# ENVIRONMENT NOTE: capturing a child validator's streams with `*>&1` into a PowerShell pipeline/variable tangles the
# stdio of the native `firebase emulators:exec` processes it spawns (the emulator/jest connection breaks), so nested
# suites silently fail and their markers never appear. Redirecting to a FILE (`*> file`) avoids this: the R1B-1
# validator then runs its full prior cascade (layer0, layer1, p0-01, p0-02, c5) + its own suite exactly as at top
# level and emits every marker. GATE 2 therefore file-redirects R1B-1 and reads all six markers from its output.
$r1b1Out = Join-Path $env:TEMP ("iam01a-prior-r1b1-" + [guid]::NewGuid().ToString('N') + ".out")
if (Test-Path $r1b1Out) { Remove-Item $r1b1Out -Force }
& (Join-Path $root 'scripts\validate-p0-05-r1b1-engine-a-latent-vector-neutralization.ps1') *> $r1b1Out
$r1b1Exit = $LASTEXITCODE
$r1b1Txt = if (Test-Path $r1b1Out) { Get-Content -LiteralPath $r1b1Out -Raw } else { '' }
Remove-Item $r1b1Out -Force -ErrorAction SilentlyContinue
function HasMark([string]$t, [string]$m) { return ($null -ne $t) -and ($t -match [regex]::Escape($m)) }
# R1B-1 verifies layer0/layer1/p0-01/p0-02/c5 into internal vars and echoes only the AGGREGATE line
# "prior validators green (tv=0 l1=0 p01=0 p02=0 c5=0)" (each 0 = that leaf exited 0). R1B-1 also runs layer0's own
# transition cascade which itself requires layer0/layer1. R1B-1's OWN marker is emitted ONLY when its GATE 2 (all five
# leaves) AND its source/suite gates pass, so the marker transitively proves all six. GATE 2 requires: R1B-1 exit 0 +
# R1B-1 marker + the aggregate five-leaf-green line (with every leaf exit 0).
$leafAggGreen = HasMark $r1b1Txt 'prior validators green (tv=0 l1=0 p01=0 p02=0 c5=0)'
$prior = @{
  five_leaves_green_via_r1b1_cascade = $leafAggGreen
  r1b1 = ($r1b1Exit -eq 0) -and (HasMark $r1b1Txt 'RESULT: P0_05_R1B1_ENGINE_A_LATENT_VECTOR_NEUTRALIZATION_PASS')
}
$priorBad = @($prior.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($priorBad.Count -eq 0) { Pass 'prior validators green: R1B-1 PASS (exit 0 + marker) transitively confirms layer0/layer1/p0-01/p0-02/c5 (aggregate tv=0 l1=0 p01=0 p02=0 c5=0)' } else { Fail ("prior validators: [{0}]" -f ($priorBad -join ', ')) }

# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Write-Host "=== GATE 3-9,15,16. Source-level provenance invariants ==="
foreach ($f in @($FP, $ENVF, $PROV, $LOADER, $TESTSIGNER)) { if (-not (Test-Path $f)) { Fail ("missing file: $f") } }
$fp = Get-Content $FP -Raw; $env = Get-Content $ENVF -Raw; $prov = Get-Content $PROV -Raw; $loader = Get-Content $LOADER -Raw; $ts = Get-Content $TESTSIGNER -Raw

# GATE 3 no production private signing secret; GATE 5 no hard-coded private key (in production modules)
$prodBlob = "$fp`n$env`n$prov`n$loader"
$g3 = ($prodBlob -notmatch 'BEGIN (EC |RSA |)PRIVATE KEY') -and ($prodBlob -notmatch 'generateKeyPairSync') -and ($prodBlob -notmatch 'createSign\(')
# GATE 4 no HMAC secret-in-code (production). Check real HMAC USAGE + a forbidden secret NAME being ASSIGNED a literal
# value — NOT the mere identifier (the module lists names like 'signingSecret'/'hmacSecret' as FORBIDDEN fields it
# rejects, and mentions HMAC in comments only to state it is deliberately NOT used).
$g4 = ($prodBlob -notmatch 'createHmac') -and ($prodBlob -notmatch "(signingSecret|hmacSecret|hmacKey|sharedSecret|SIGNING_SECRET|HMAC_KEY)\s*[:=]\s*[`"'][^`"']{6,}")
# GATE 6 canonical deterministic fingerprint (length-prefixed, versioned, integer-only, sha256)
$g6 = ($fp -match "FINGERPRINT_ALGORITHM_VERSION") -and ($fp -match 'sha256') -and ($fp -match 'Number\.isInteger') -and ($fp -match 'buildPaidChatAuthorityCanonicalPayloadBytes')
# GATE 7 authority envelope schema (shape parse, not trusted by shape)
$g7 = ($env -match "interface FinancialAuthorityEnvelope") -and ($env -match 'parseAuthorityEnvelope') -and ($env -match 'payloadFingerprint') -and ($env -match 'signatureAlgorithm')
# GATE 8 test asymmetric signer ONLY under __tests__ AND not imported by any production module
$g8a = (Test-Path $TESTSIGNER) -and ($ts -match 'generateKeyPairSync')
# --untracked is REQUIRED: the IAM-01A sources are untracked in this detached-HEAD worktree, so a tracked-only
# `git grep` matches zero files and this isolation gate would be vacuous (silent false-negative). .gitignore still applies.
$prodImportsTestSigner = @(& git -C $root grep --untracked -l -e 'iam01aTestSigner' -- 'functions/src' | Where-Object { $_ -notmatch '__tests__|\.test\.' })
$g8b = ($prodImportsTestSigner.Count -eq 0)
$g8 = $g8a -and $g8b
# GATE 9 production signer SAFE_UNAVAILABLE (fail-closed marker + throws), and production verifier fail-closed
$g9 = ($prov -match "PRODUCTION_FINANCIAL_AUTHORITY_SIGNING\s*=\s*'SAFE_UNAVAILABLE'") -and ($prov -match 'FinancialAuthorityProvenanceUnavailableError') -and ($prov -match 'getProductionFinancialAuthoritySigner') -and ($prov -match 'getProductionFinancialAuthorityVerifier')
# GATE 15 EXPORTED_PRODUCTION_RAW_SIGNER_COUNT = 0 (no exported function that signs with a private key in production)
$rawSigners = ([regex]::Matches($prov, 'export\s+(?:async\s+)?function\s+\w*[Ss]ign\w*Raw|export\s+const\s+\w*[Uu]nsafe'))
$g15 = ($rawSigners.Count -eq 0) -and ($prov -notmatch '__unsafeSign') -and ($prov -notmatch 'export .*createTestAuthoritySigner')
# GATE 16 EXPORTED_RAW_TRUST_FACTORY_COUNT = 0 (loader still exports no raw mint/create/build/issue factory)
$loaderFactory = ([regex]::Matches($loader, 'export\s+(?:async\s+)?(?:function|const)\s+\w*(?:[Mm]int|[Cc]reate|[Bb]uild|[Ii]ssue|[Ff]actory|[Mm]ake|[Cc]onstruct)\w*\s*(?:\(|=)'))
$g16 = ($loaderFactory.Count -eq 0) -and ($loader -match 'loadTrustedPaidChatAuthority') -and ($loader -match 'assertVerifiedAuthorityEnvelope')
# GATE R1 key registry: keyVersion->status model with ACTIVE_FOR_SIGNING/TRUSTED_FOR_VERIFY/REVOKED; unknown+revoked fail closed
$gR1 = ($prov -match 'ValidatedKeyRegistry') -and ($prov -match 'TRUSTED_KEY_STATUSES') -and ($prov -match "'ACTIVE_FOR_SIGNING'") -and ($prov -match "'TRUSTED_FOR_VERIFY'") -and ($prov -match "'REVOKED'") -and ($prov -match 'key_version_unknown') -and ($prov -match 'key_version_revoked')
# GATE R2 deterministic exact lookup, NO fallback to active key, NO try-all iteration; domain binding enforced
$gR2 = ($prov -match 'registry\.resolve\(envelope\.signingKeyVersion\)') -and ($prov -match 'config_domain_mismatch') -and ($prov -notmatch 'for \(const \[[^\]]+\] of map\)')
# GATE R3 immutable registry, no mutable runtime trust-registration API exported
$gR3 = ($prov -match 'Object\.freeze') -and ($prov -notmatch 'export\s+(?:function|const)\s+\w*(?:setTrustedKey|registerKey|addKey|addTrustedKey)') -and ($prov -notmatch 'export\s+(?:let|var)\s')
# GATE R4 private material can never enter verifier config (forbidden fields + public-key-only assertion)
$gR4 = ($prov -match 'FORBIDDEN_CONFIG_FIELDS') -and ($prov -match 'assertPublicKeyOnly') -and ($prov -match 'private_key_material') -and ($prov -match "privateKey")
# GATE R5 CODEX R2: the trust-minting loader has NO caller-supplied verifier parameter and NO verifier injection seam.
# The loader signature is exactly `loadTrustedPaidChatAuthority(paidChatId: string): Promise` (single param -> .length 1),
# it resolves the verifier INTERNALLY via getProductionFinancialAuthorityVerifier(), and it does not reference the
# FinancialAuthorityVerifier type as a parameter. No exported setVerifier/injection seam exists on the loader module.
$gR5 = ($loader -match 'loadTrustedPaidChatAuthority\(paidChatId: string\): Promise') -and
       ($loader -notmatch 'loadTrustedPaidChatAuthority\([^)]*verifier') -and
       ($loader -notmatch '(?<!Production)FinancialAuthorityVerifier') -and   # forbid the standalone TYPE (a param), allow getProduction...Verifier
       ($loader -notmatch ':\s*FinancialAuthorityVerifier') -and
       ($loader -match 'assertVerifiedAuthorityEnvelope\([\s\S]*getProductionFinancialAuthorityVerifier\(\)') -and
       ($loader -notmatch 'export\s+(?:function|const)\s+\w*[Ss]et\w*[Vv]erifier')
$src = @{ G3_no_private_key=$g3; G4_no_hmac_secret=$g4; G6_canonical_fingerprint=$g6; G7_envelope_schema=$g7; G8_test_signer_isolated=$g8; G9_production_safe_unavailable=$g9; G15_no_raw_signer_export=$g15; G16_no_raw_trust_factory=$g16; R1_key_registry=$gR1; R2_exact_lookup_no_fallback=$gR2; R3_immutable_registry=$gR3; R4_private_material_rejected=$gR4; R5_loader_no_verifier_seam=$gR5 }
$srcbad = @($src.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($srcbad.Count -eq 0) { Pass 'source invariants: no private key/HMAC/secret in prod; canonical fingerprint; envelope schema; test signer isolated+unimported; production SAFE_UNAVAILABLE; EXPORTED_PRODUCTION_RAW_SIGNER_COUNT=0; EXPORTED_RAW_TRUST_FACTORY_COUNT=0' } else { $srcbad | ForEach-Object { Write-Host "  MISSING: $_" }; Fail 'source-level invariants' }

# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Write-Host "=== GATE 17-19. Billing disabled / sendChatMessage hard-closed / c5 SAFE_UNAVAILABLE ==="
$cst = Get-Content (Join-Path $fnroot 'src\chatSystemNextGen.ts') -Raw
$c5src = Get-Content (Join-Path $fnroot 'src\chat\canonicalDirectChatCallables.ts') -Raw
$g17 = ($loader -notmatch "collection\('wallets'\)") -and ($loader -notmatch "collection\('reservations'\)") -and ($loader -notmatch "collection\('ledger'\)") -and ($loader -notmatch 'transactTokens')
$g18 = ($cst -match 'HUMAN_CHAT_BILLING_DISABLED')
$c5guards = ([regex]::Matches($c5src, 'assertC5DirectChatUnavailable\(\);')).Count
$g19 = ($c5guards -ge 15)
if ($g17 -and $g18 -and $g19) { Pass ("billing disabled (loader no wallet/reservation/ledger/transactTokens); sendChatMessage HARD_FAIL_CLOSED; c5 {0} guards SAFE_UNAVAILABLE" -f $c5guards) } else { Fail ("billing/messaging (g17={0} g18={1} g19={2})" -f $g17, $g18, $g19) }

# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Write-Host "=== GATE 10-14,20. Emulator suite: positive verify, direct-admin-write reject, tamper/copy/replay/algo, regression ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent' }
else {
  $jsonOut = Join-Path $env:TEMP ("iam01a-jest-" + [guid]::NewGuid().ToString('N') + ".json")
  if (Test-Path $jsonOut) { Remove-Item $jsonOut -Force }
  $runStartedUtc = (Get-Date).ToUniversalTime()          # freshness floor for the report (anti-stale)
  Push-Location $fnroot
  $cmd = "npx jest --config jest.config.js --selectProjects main --runInBand --forceExit --json --outputFile=`"$jsonOut`" src/__tests__/$MAIN_FILE"
  $emuLog = Join-Path $env:TEMP ("iam01a-emu-" + [guid]::NewGuid().ToString('N') + ".log")
  & firebase emulators:exec --only firestore --project demo-avalo $cmd *> $emuLog
  $emuExit = $LASTEXITCODE
  Pop-Location
  if (-not (Get-Command Test-EmulatorLifecycleHealthy -ErrorAction SilentlyContinue)) { . (Join-Path $root 'scripts\lib\EmulatorLifecycle.ps1') }
  $lifeReason = ''; $lifeOk = Test-EmulatorLifecycleHealthy -CliExit $emuExit -LogPath $emuLog -Reason ([ref]$lifeReason)
  Remove-Item $emuLog -Force -ErrorAction SilentlyContinue
  # STRICT adjudication (R5). Replaces coercing numeric casts + substring name matching, both of which independent
  # review found to be bypassable. The shared parser enforces schema+type, count arithmetic, source-file binding,
  # exact fullName equality, and one-unique-record-per-requirement. See scripts/lib/StrictJestParser.ps1.
  if (-not (Get-Command Get-SjpStrictReport -ErrorAction SilentlyContinue)) { . (Join-Path $root 'scripts\lib\StrictJestParser.ps1') }
  # Canonical required-assertion table: EXACT jest fullName (ancestor describe titles + test title).
  $IAM01A_REQUIRED = @(
    'P0-IAM-01A — loader verifies provenance INTERNALLY before minting; no caller seam (emulator) DIRECT ADMIN WRITE ATTACK: schema-valid but UNSIGNED record is REJECTED (Codex defect closed)',
    'P0-IAM-01A — loader verifies provenance INTERNALLY before minting; no caller seam (emulator) DIRECT ADMIN WRITE ATTACK: schema-valid record with a FORGED (self-made) envelope is REJECTED',
    'P0-IAM-01A — loader verifies provenance INTERNALLY before minting; no caller seam (emulator) CODEX R2: loader has NO caller-supplied verifier — a no-op verifier arg cannot force a mint',
    'P0-IAM-01A — loader verifies provenance INTERNALLY before minting; no caller seam (emulator) default (unconfigured) production verifier refuses even a validly signed record — no shipped mint path',
    'P0-IAM-01A — positive verification (test trust root) and production fail-closed production signer is SAFE_UNAVAILABLE (fail-closed, no private key in repo)',
    'P0-IAM-01A — provenance negative matrix (fail-closed) copy attack A->B (envelope from A presented for resource B) is rejected',
    'P0-IAM-01A — provenance negative matrix (fail-closed) stale record-version replay (old envelope after version bump) is rejected',
    'P0-IAM-01A — provenance negative matrix (fail-closed) unknown signing key version is rejected',
    'P0-IAM-01A — provenance negative matrix (fail-closed) unsupported signature algorithm is rejected',
    'P0-IAM-01A — authenticity-only, no billing, no side effects, messaging intact sendChatMessage remains HARD_FAIL_CLOSED and forged /chats still mints no authority',
    'P0-IAM-01A — authenticity-only, no billing, no side effects, messaging intact general /chats DM and group shell still work',
    'P0-IAM-01A — production key registry (rotation / status / domain / no-fallback) rotation: retired-but-trusted key still verifies old records while the new active key verifies new ones',
    'P0-IAM-01A — production key registry (rotation / status / domain / no-fallback) REVOKED key fails closed even with an otherwise valid signature',
    'P0-IAM-01A — production key registry (rotation / status / domain / no-fallback) unknown keyVersion is rejected — NO fallback to the active key',
    'P0-IAM-01A — production key registry (rotation / status / domain / no-fallback) authorityDomain mismatch is rejected (a WALLET-domain registry does not verify PAID_CHAT)',
    'P0-IAM-01A — production key registry (rotation / status / domain / no-fallback) validated registry is immutable (frozen; no mutation/registration API)'
  )
  $rep = Get-SjpStrictReport -JsonPath $jsonOut -NativeExit $emuExit -RunStartedUtc $runStartedUtc `
           -ExpectedTestFile $MAIN_FILE -MinPassed 45 -ExpectedPassed 53 -RequiredAssertions $IAM01A_REQUIRED
  Write-Host ("  strict jest -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} ok={6}" -f $rep.passed, $rep.failed, $rep.pending, $rep.todo, $rep.total, $emuExit, $rep.ok)
  Write-Host ("  emulator-lifecycle: {0}" -f $lifeReason)
  # NOTE: the emulator CLI exit is adjudicated by the lifecycle helper, so a normalized non-zero exit is legitimate.
  # The strict parser is therefore given $emuExit only for reporting; the binding gate is $lifeOk below.
  $nativeOk = ($emuExit -eq 0) -or $lifeOk
  $strictErrs = @($rep.errors | Where-Object { $_ -notmatch '^native_jest_exit_nonzero' })
  if ($rep.ok -and $lifeOk -and $nativeOk) { Pass ("IAM-01A suite: {0} passed / 0 failed / 0 skipped; strict schema + {1} exact named security assertions" -f $rep.passed, $IAM01A_REQUIRED.Count) }
  elseif ($strictErrs.Count -eq 0 -and $lifeOk -and $nativeOk) { Pass ("IAM-01A suite: {0} passed / 0 failed / 0 skipped; strict schema + {1} exact named security assertions (emu exit normalized)" -f $rep.passed, $IAM01A_REQUIRED.Count) }
  else { $strictErrs | ForEach-Object { Write-Host "  STRICT REJECT: $_" }; Fail ("IAM-01A suite (strictErrors={0} lifeHealthy={1} emuExit={2})" -f $strictErrs.Count, $lifeOk, $emuExit) }
  if (Test-Path $jsonOut) { Remove-Item $jsonOut -Force -ErrorAction SilentlyContinue }
}

Write-Host ""
if ($exit -eq 0) {
  Write-Host 'CHECKOUT: OFF ; ADVERTISER CREDIT: OFF ; /paidChats: SERVER-OWNED (default-deny) + CRYPTOGRAPHIC PROVENANCE VERIFIED BEFORE MINT ; PRODUCTION_FINANCIAL_AUTHORITY_SIGNING: SAFE_UNAVAILABLE ; EXPORTED_PRODUCTION_RAW_SIGNER_COUNT=0 ; EXPORTED_RAW_TRUST_FACTORY_COUNT=0 ; BILLING: DISABLED (0 active paid billing path) ; sendChatMessage DISABLED ; c5 SAFE_UNAVAILABLE ; P0-05 OPEN ; R1B-2 OPEN'
  Write-Host 'RESULT: P0_IAM_01A_FINANCIAL_AUTHORITY_TRUST_BOUNDARY_FOUNDATION_PASS'
} else {
  Write-Host 'RESULT: P0_IAM_01A_FINANCIAL_AUTHORITY_TRUST_BOUNDARY_FOUNDATION_FAIL'
}
exit $exit
