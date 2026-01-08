Write-Host "AVALO TEST - PARSING OK" -ForegroundColor Cyan

function Step {
    param([string]$msg, [string]$color)
    Write-Host $msg -ForegroundColor $color
}

Step "Test 1 OK" "Green"
Step "Test 2 OK" "Yellow"
Step "If you see these lines, parsing works." "Magenta"
