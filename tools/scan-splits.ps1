$repo = "C:\a\avalo\functions\src"
$out = "C:\a\avalo\audit-out\SPLITS_FUNCTIONS_REPORT.md"

New-Item -ItemType Directory -Force -Path "C:\a\avalo\audit-out" | Out-Null

$patterns = @(
"split",
"fee",
"platformFee",
"platform_fee",
"creatorShare",
"creator_share",
"revenue",
"commission",
"payout",
"wallet",
"ledger",
"token",
"deduct",
"percent"
)

$results = @()

$files = Get-ChildItem $repo -Recurse -File -Filter *.ts

foreach ($file in $files) {

    $lines = Get-Content $file.FullName

    foreach ($line in $lines) {

        foreach ($pattern in $patterns) {

            if ($line.ToLower().Contains($pattern.ToLower())) {

                $results += "FILE: $($file.FullName)"
                $results += "CODE: $line"
                $results += "------------------------------------------------"
                break

            }

        }

    }

}

if ($results.Count -eq 0) {

    $results += "NO ECONOMY KEYWORDS FOUND IN BACKEND"

}

$results | Out-File $out -Encoding UTF8

Write-Host ""
Write-Host "REPORT CREATED:"
Write-Host $out
