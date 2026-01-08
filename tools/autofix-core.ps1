Write-Host "Core fix start"

$APP = "C:\Users\Drink\avaloapp\app-mobile"

if(Test-Path "$APP\node_modules"){
  Remove-Item -Force -Recurse "$APP\node_modules"
}

if(Test-Path "$APP\pnpm-lock.yaml"){
  Remove-Item -Force "$APP\pnpm-lock.yaml"
}

Write-Host "Reinstall"
pnpm install --dir "$APP"

Write-Host "Core fix done"
