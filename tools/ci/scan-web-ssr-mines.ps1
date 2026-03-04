param(
  [string]$WebRoot = "C:\a\avalo\app-web"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$patterns = @(
  "from\s+['""]firebase/app['""]",
  "from\s+['""]firebase/auth['""]",
  "from\s+['""]firebase/functions['""]",
  "from\s+['""]firebase/firestore['""]",
  "initializeApp\(",
  "getAuth\(",
  "getFunctions\(",
  "httpsCallable\("
)

$exts = @("*.ts","*.tsx","*.js","*.jsx","*.mjs","*.cjs")

$files = foreach ($e in $exts) {
  Get-ChildItem -Path $WebRoot -Recurse -File -Filter $e -ErrorAction SilentlyContinue
}

$results = New-Object System.Collections.Generic.List[object]

foreach ($f in $files) {
  $content = Get-Content -Raw -Path $f.FullName -ErrorAction SilentlyContinue
  if (-not $content) { continue }

  foreach ($p in $patterns) {
    if ($content -match $p) {
      $results.Add([PSCustomObject]@{
        File    = $f.FullName
        Pattern = $p
      })
      break
    }
  }
}

if ($results.Count -eq 0) {
  Write-Host "OK: No SSR mines found."
  exit 0
}

$results |
  Sort-Object File |
  Format-Table -AutoSize

exit 0
