param(
  [string]$WebRoot = "C:\a\avalo\app-web",
  [string[]]$ClientFirebaseImportPatterns = @(
    "from\s+['""]@/lib/firebase['""]",
    "from\s+['""]src/lib/firebase['""]",
    "from\s+['""]\.\./lib/firebase['""]",
    "from\s+['""]\./lib/firebase['""]",
    "require\(\s*['""]@/lib/firebase['""]\s*\)",
    "require\(\s*['""]src/lib/firebase['""]\s*\)"
  )
)

function HasUseClientTop([string]$content) {
  $lines = $content -split "`n"
  foreach ($l in $lines) {
    $t = $l.Trim()
    if ($t -eq "") { continue }
    if ($t.StartsWith("//")) { continue }
    if ($t.StartsWith("/*")) { return $false }
    return ($t -eq '"use client";' -or $t -eq "'use client';" -or $t -eq '"use client"' -or $t -eq "'use client'")
  }
  return $false
}

$exts = @("*.ts","*.tsx","*.js","*.jsx","*.mjs","*.cjs")
$files = foreach ($e in $exts) { Get-ChildItem -Path $WebRoot -Recurse -File -Filter $e -ErrorAction SilentlyContinue }

$hits = @()

foreach ($f in $files) {
  $content = Get-Content -Raw -Path $f.FullName -ErrorAction SilentlyContinue
  if (-not $content) { continue }

  $matched = $false
  foreach ($p in $ClientFirebaseImportPatterns) {
    if ($content -match [regex]::Escape($p)) { $matched = $true; break }
  }
  if (-not $matched) { continue }

  $isClient = HasUseClientTop $content
  if (-not $isClient) {
    $hits += [PSCustomObject]@{
      File = $f.FullName
      HasUseClient = $false
      Note = "Imports client firebase but missing use client"
    }
  }
}

if ($hits.Count -eq 0) {
  Write-Host "OK: No server/SSR files import client firebase without use client."
  exit 0
} else {
  Write-Host "FAIL: Found server/SSR candidates importing client firebase:"
  $hits | Sort-Object File | Format-Table -AutoSize
  exit 2
}

