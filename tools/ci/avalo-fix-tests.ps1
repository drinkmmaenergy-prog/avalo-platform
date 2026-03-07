param(
  [switch]$Run
)

function Info($m){Write-Host "[INFO] $m" -ForegroundColor Cyan}
function Ok($m){Write-Host "[OK] $m" -ForegroundColor Green}
function Warn($m){Write-Host "[WARN] $m" -ForegroundColor Yellow}

$root = Get-Location

Info "===== AVALO TEST FIX AGENT START ====="

# -------------------------------------------------------
# 1 TEST HELPERS
# -------------------------------------------------------

$helpers = @'
import admin from "firebase-admin";

export function getDb(){
  if(!admin.apps.length){
    admin.initializeApp();
  }
  return admin.firestore();
}

export async function setupTestEnvironment(){
  process.env.FIRESTORE_EMULATOR_HOST="localhost:8080";
}

export const testData = {
  generateUserId(){
    return "user_" + Math.random().toString(36).substring(2,10);
  }
};

export async function createTestUser(id,data={}){
  const db=getDb();
  await db.collection("users").doc(id).set({
    tokens:0,
    createdAt:new Date(),
    ...data
  });
}

export async function createTestTransaction(userId,amount,type){
  const db=getDb();
  await db.collection("transactions").add({
    userId,
    amount,
    type,
    createdAt:new Date()
  });
}

export function now(){
  return new Date();
}

export function minutesAgo(m){
  return new Date(Date.now()-m*60000);
}

export function hoursAgo(h){
  return new Date(Date.now()-h*3600000);
}

export function daysAgo(d){
  return new Date(Date.now()-d*86400000);
}
'@

$helpersPath="functions/tests/testHelpers.ts"

if(!(Test-Path $helpersPath)){
  $helpers | Set-Content $helpersPath
  Ok "testHelpers.ts created"
}

# -------------------------------------------------------
# 2 PATCH FIRESTORE INIT
# -------------------------------------------------------

$init="functions/src/init.ts"

if(Test-Path $init){

$content=Get-Content $init -Raw

$content=$content -replace "db\.settings\([\s\S]*?\)","if(!global.__firestore_settings){db.settings({ignoreUndefinedProperties:true});global.__firestore_settings=true}"

$content | Set-Content $init

Ok "Firestore init patched"
}

# -------------------------------------------------------
# 3 UUID FIX
# -------------------------------------------------------

$calendar="functions/src/calendarEngine.ts"

if(Test-Path $calendar){

$content=Get-Content $calendar -Raw
$content=$content -replace "import { v4 as uuidv4 } from 'uuid'","const { v4: uuidv4 } = require('uuid')"

$content | Set-Content $calendar

Ok "uuid import patched"
}

# -------------------------------------------------------
# 4 JEST TIMEOUT
# -------------------------------------------------------

$jest="functions/jest.config.js"

if(Test-Path $jest){

$content=Get-Content $jest -Raw

if($content -notmatch "testTimeout"){
$content=$content -replace "module\.exports\s*=\s*{","module.exports={ testTimeout:30000,"
}

$content | Set-Content $jest

Ok "jest timeout patched"
}

# -------------------------------------------------------
# 5 FIRESTORE EMULATOR START
# -------------------------------------------------------

if($Run){

Info "Starting emulator..."

Start-Process powershell -ArgumentList "firebase emulators:start --only firestore"

Start-Sleep 6

Push-Location functions

Info "Running tests..."

npm test

Pop-Location

}

Ok "===== AVALO TEST FIX AGENT END ====="