# === Avalo Auto React Import Fix ===

C:\Users\Drink\avaloapp\app-mobile\src = "C:\Users\Drink\avaloapp\app-mobile\src"

Write-Host "
=== SCANNING FILES ===
"

Get-ChildItem -Path C:\Users\Drink\avaloapp\app-mobile\src -Recurse -Include *.tsx,*.ts | ForEach-Object {

    C:\Users\Drink\avaloapp\app-mobile\src\types\navigation.ts = .FullName
     = Get-Content C:\Users\Drink\avaloapp\app-mobile\src\types\navigation.ts -Raw

    # 1. Usuń wszystkie importy React
     =  -replace "import React[^;]*;", ""
     =  -replace "import\s+React\s*,\s*{[^}]+}\s*from\s+'react';", ""
     =  -replace "import\s*{\s*React\s*}\s*from\s+'react';", ""

    # 2. Dodaj główny import jeśli go nie ma
    if ( -notmatch "import React from 'react';") {
         = "import React from 'react';
" + 
    }

    # 3. Zapisz zmiany
    Set-Content -Path C:\Users\Drink\avaloapp\app-mobile\src\types\navigation.ts -Value  -Encoding UTF8

    Write-Host "[FIXED] C:\Users\Drink\avaloapp\app-mobile\src\types\navigation.ts"
}

Write-Host "
=== DONE. RUN EXPO ==="
