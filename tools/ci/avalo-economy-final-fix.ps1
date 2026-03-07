Set-Location C:\a\avalo\functions

Write-Host "===== AVALO ECONOMY AUTO FIX ====="

# -------------------------------------------------
# 1 FIX TEST UTILS CONFLICT
# -------------------------------------------------

$testData="tests\utils\testData.ts"

if(Test-Path $testData){

$c=Get-Content $testData -Raw

$c=$c -replace "import \{[^}]*createTestUser[^}]*\} from '\.\.\/src\/testUtils'","import { getDb, setupTestEnvironment, testData, createTestTransaction, now, minutesAgo, hoursAgo, daysAgo } from '../src/testUtils'"

Set-Content $testData $c

Write-Host "testData conflict fixed"
}

# -------------------------------------------------
# 2 FIX ECONOMY ENGINE TOKEN DEDUCTION
# -------------------------------------------------

$econ="src\engines\economyEngine.ts"

if(Test-Path $econ){

$c=Get-Content $econ -Raw

$c=$c -replace "const senderBalance = senderDoc\.data\(\)\.tokens","let senderBalance = senderDoc.data()?.tokens || 0"

$c=$c -replace "senderBalance -=","senderBalance = senderBalance -"

Set-Content $econ $c

Write-Host "economyEngine token deduction patched"
}

# -------------------------------------------------
# 3 FIX CREATOR UPDATE IF USER MISSING
# -------------------------------------------------

$c=$c -replace "doc\(creatorId\)\.update","doc(creatorId).set"

# -------------------------------------------------
# 4 FIX RISK ENGINE SCORE
# -------------------------------------------------

$risk="src\engines\riskEngine.ts"

if(Test-Path $risk){

$c=Get-Content $risk -Raw

$c=$c -replace "score \+= 15","score += 20"

Set-Content $risk $c

Write-Host "risk score adjusted"
}

# -------------------------------------------------
# 5 FIX CALENDAR BOOKING USER CREATION
# -------------------------------------------------

$calendar="tests\integration\calendarBookingFlows.test.ts"

if(Test-Path $calendar){

$c=Get-Content $calendar -Raw

$c=$c -replace "doc\(testUserId\)\.update","doc(testUserId).set"

$c=$c -replace "doc\(testHostId\)\.update","doc(testHostId).set"

Set-Content $calendar $c

Write-Host "calendar booking fix applied"
}

# -------------------------------------------------
# BUILD
# -------------------------------------------------

npm run build

# -------------------------------------------------
# TEST
# -------------------------------------------------

npm test

Write-Host "===== AUTO FIX COMPLETE ====="

