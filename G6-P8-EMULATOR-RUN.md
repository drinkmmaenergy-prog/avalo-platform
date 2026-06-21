# G6 — P8 Real Emulator Execution
## Branch: stabilization/build-green-2026-04-15

These commands must be run on the Windows host (Firebase jar downloads are blocked in the CI sandbox).
Copy and paste each block into PowerShell from the repo root: `C:\a\avalo\functions`

---

## Pre-flight (run once)

```powershell
cd C:\a\avalo\functions
# Verify branch
git -C .. log --oneline -3

# Install deps if needed
npm ci

# TypeScript check — must exit 0
npx tsc -p tsconfig.build.json --noEmit
echo "tsc exit: $LASTEXITCODE"
```

---

## Step 1 — Unit tests (no emulator needed)

```powershell
cd C:\a\avalo\functions
npx jest tests/unit/f6-unit.test.ts tests/unit/g4-multiroom-fields.unit.test.ts `
  --runInBand --forceExit --no-coverage `
  2>&1 | Tee-Object -FilePath ..\G6-unit-output.txt
```

Expected: `PASS` for both, `Tests: 13 passed` and `13 passed` minimum.

---

## Step 2 — Start Firebase Emulator

```powershell
cd C:\a\avalo
# Start emulators in background
Start-Job -Name "emulator" -ScriptBlock {
  cd C:\a\avalo
  firebase emulators:start --only auth,firestore,functions --project avalo-test
}
Start-Sleep -Seconds 15
# Verify emulator is up
Invoke-WebRequest http://localhost:4000 -UseBasicParsing | Select-Object -ExpandProperty StatusCode
```

---

## Step 3 — G1 Integration Tests (creator wallet separation)

```powershell
cd C:\a\avalo\functions
$env:FIRESTORE_EMULATOR_HOST = "localhost:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099"
npx jest tests/integration/g1-creator-wallet-separation.integration.test.ts `
  --runInBand --forceExit --no-coverage `
  2>&1 | Tee-Object -FilePath ..\G6-g1-output.txt
```

Mandatory cases:
- G1-T01: creator consumer wallet UNCHANGED after earning
- G1-T02: pendingEarningTokens += chargedTokens exactly
- G1-T03: idempotent retry earns exactly once
- G1-T04: payerTokensCharged === creatorEarningTokens
- G1-T05: multiple sequential earnings accumulate (3×50 = 150)

Expected: `Tests: 5 passed, 5 total`

---

## Step 4 — G2 Integration Tests (canonical call lifecycle)

```powershell
cd C:\a\avalo\functions
$env:FIRESTORE_EMULATOR_HOST = "localhost:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099"
npx jest tests/integration/g2-call-canonical-lifecycle.integration.test.ts `
  --runInBand --forceExit --no-coverage `
  2>&1 | Tee-Object -FilePath ..\G6-g2-output.txt
```

Mandatory cases:
- G2-T03: callSessions collection (not calls/call_sessions)
- G2-T04: fan debited, creator earning account credited, creator consumer wallet unchanged
- G2-T05: duplicate billing window is idempotent
- G2-T06: billCompletedCall ceiling minutes (61s → 2 min)
- G2-T07: PAYOUTS_ENABLED = false
- G2-T08: two sequential calls accumulate in pendingEarningTokens

Expected: `Tests: 8 passed, 8 total`

---

## Step 5 — F6 Full Emulator Suite

```powershell
cd C:\a\avalo\functions
$env:FIRESTORE_EMULATOR_HOST = "localhost:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099"
npx jest tests/integration/f6-emulator-validation.test.ts `
  --runInBand --forceExit --no-coverage `
  2>&1 | Tee-Object -FilePath ..\G6-f6-output.txt
```

---

## Step 6 — Collect Evidence

```powershell
# Show all results
Get-Content ..\G6-unit-output.txt | Select-String "PASS|FAIL|Tests:"
Get-Content ..\G6-g1-output.txt  | Select-String "PASS|FAIL|Tests:"
Get-Content ..\G6-g2-output.txt  | Select-String "PASS|FAIL|Tests:"
Get-Content ..\G6-f6-output.txt  | Select-String "PASS|FAIL|Tests:"

# Final summary
echo "=== G6 EVIDENCE SUMMARY ===" 
git -C .. log --oneline -5
```

---

## Verdict Matrix (fill in after running)

| Suite | File | Expected | Actual | Pass? |
|-------|------|----------|--------|-------|
| Unit | f6-unit.test.ts | 13 passed | __ | __ |
| Unit | g4-multiroom-fields.unit.test.ts | 13 passed | __ | __ |
| Emulator | g1-creator-wallet-separation | 5 passed | __ | __ |
| Emulator | g2-call-canonical-lifecycle | 8 passed | __ | __ |
| Emulator | f6-emulator-validation | 14 passed | __ | __ |

**G6 is COMPLETE when all rows show Pass=YES.**
