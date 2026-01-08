# ============================================================
# Avalo CTO: FORCE MOVE app-mobile → AVALO-MOBILE
# ============================================================

$source = "C:\Users\Drink\avaloapp\app-mobile"
$dest   = "C:\Users\Drink\AVALO-MOBILE"

Write-Host "=== Avalo Force Move ==="

# 1) Sprawdzenie czy dest już istnieje
if(Test-Path $dest){
    Write-Host "[ERR] Folder AVALO-MOBILE already exists. Remove it first."
    exit
}

# 2) Próba odblokowania plików (zamyka handle EXPO i Metro)
Write-Host "Stopping any Metro/Expo processes..."
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process expo -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 1

# 3) Próba standardowego przeniesienia
Write-Host "Attempting normal move..."
try{
    Move-Item -Path $source -Destination $dest -Force -ErrorAction Stop
    Write-Host "✅ Normal move completed."
    exit 0
}
catch{
    Write-Host "[WARN] Normal move failed. Folder is locked."
}

# 4) Użycie mechanizmu Windows API MoveFileEx → usunięcie po restarcie
Write-Host "Using FORCE method (MoveFileEx)..."

$signature = @"
using System;
using System.Runtime.InteropServices;

public class MoveFileExAPI {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
}
"@

Add-Type -TypeDefinition $signature

# 4 = MOVEFILE_DELAY_UNTIL_REBOOT
$ok = [MoveFileExAPI]::MoveFileEx($source, $null, 4)

if(-not $ok){
    Write-Host "[ERR] Scheduling deletion failed."
    exit 1
}

Write-Host "✅ Scheduled deletion of old app-mobile after reboot."

# 5) Kopia folderu
Write-Host "Copying app-mobile to AVALO-MOBILE..."
Copy-Item -Recurse -Force $source $dest

Write-Host "✅ Copy completed."

# 6) Restart
Write-Host "System will reboot in 5 seconds..."
Start-Sleep -Seconds 5
Restart-Computer -Force
