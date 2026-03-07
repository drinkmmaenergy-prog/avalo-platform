$root = "C:\a\avalo\app-web\src"

$files = Get-ChildItem -Path $root -Recurse -File -Include *.ts,*.tsx

foreach ($file in $files) {

    try {

        $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop

        $reactImports = Select-String -InputObject $content -Pattern "import React"

        if ($reactImports.Count -gt 1) {

            Write-Host "Fixing duplicate React import:" $file.FullName

            $content = [regex]::Replace(
                $content,
                "(import React[^\n]+\n)+",
                "import React, { useEffect, useState } from 'react';`n"
            )

            Set-Content -LiteralPath $file.FullName -Value $content -Encoding UTF8
        }

    }
    catch {
        Write-Host "Skipping unreadable path:" $file.FullName
    }
}

Write-Host "React imports normalized"
