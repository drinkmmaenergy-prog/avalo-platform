$root = "C:\a\avalo\app-web\src"

$files = Get-ChildItem $root -Recurse -Include *.ts,*.tsx -File

foreach ($f in $files) {
    $content = Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8

    if ($content -match "'use client';") {

        # usuń wszystkie wystąpienia
        $content = [regex]::Replace(
            $content,
            "^\s*'use client';\s*",
            "",
            [System.Text.RegularExpressions.RegexOptions]::Multiline
        )

        # dodaj na samą górę
        $content = "'use client';`r`n`r`n" + $content.TrimStart()

        Set-Content -LiteralPath $f.FullName -Value $content -Encoding UTF8

        Write-Host "Fixed use client position:" $f.FullName
    }
}

Write-Host "CLIENT DIRECTIVE NORMALIZED"
