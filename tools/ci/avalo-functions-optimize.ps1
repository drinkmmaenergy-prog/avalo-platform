$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$functions = "$repo\functions"
$src = "$functions\src"

Write-Host "=== AVALO FUNCTIONS OPTIMIZER ==="

# 1. params.ts (zamiennik functions.config)
$paramsFile = "$src\params.ts"

$paramsContent = @"
import { defineString } from "firebase-functions/params";

export const STRIPE_SECRET = defineString("STRIPE_SECRET");
export const STRIPE_WEBHOOK_SECRET = defineString("STRIPE_WEBHOOK_SECRET");
export const FIREBASE_REGION = defineString("FIREBASE_REGION");
"@

Set-Content $paramsFile $paramsContent
Write-Host "[OK] params.ts created"

# 2. global runtime options
$indexFile = "$src\index.ts"

if(Test-Path $indexFile){

$index = Get-Content $indexFile -Raw

if($index -notmatch "setGlobalOptions"){

$patch = @"
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({
  region: "europe-west1",
  memory: "512MiB",
  timeoutSeconds: 60,
  maxInstances: 10
});
"@

$index = $patch + "`n" + $index
Set-Content $indexFile $index

Write-Host "[OK] global runtime options added"

}

}

# 3. firebaseignore
$ignoreFile = "$repo\.firebaseignore"

$ignore = @"
node_modules
.git
*.log
*.map
test
docs
scripts
"@

Set-Content $ignoreFile $ignore
Write-Host "[OK] firebaseignore optimized"

# 4. Node version
$pkg = "$functions\package.json"
$json = Get-Content $pkg -Raw | ConvertFrom-Json

if(!$json.engines){
$json | Add-Member -Name engines -Value @{node="20"} -MemberType NoteProperty
}

$json.engines.node="20"

$json | ConvertTo-Json -Depth 10 | Set-Content $pkg

Write-Host "[OK] node version set"

# 5. Build
Write-Host "Building functions..."

cd $functions
npm run build

if($LASTEXITCODE -ne 0){
Write-Host "Build failed"
exit
}

Write-Host "[OK] build success"

# 6. Deploy
Write-Host "Deploying functions..."

cd $repo
firebase deploy --only functions

Write-Host "=== OPTIMIZATION COMPLETE ==="