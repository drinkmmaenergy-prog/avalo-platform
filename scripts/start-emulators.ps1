# Avalo Firebase Emulator Startup Script (PowerShell)
# This script starts Firebase emulators with Docker support

param(
    [switch]$Docker,
    [switch]$Detach,
    [switch]$Import,
    [switch]$Export,
    [switch]$Help
)

# Configuration
$ProjectName = "avalo-demo"
$DataDir = ".firebase-data"

# Color output functions
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# Show help
if ($Help) {
    Write-Host "Usage: .\start-emulators.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Docker        Run emulators in Docker container"
    Write-Host "  -Detach        Run in detached mode (background)"
    Write-Host "  -Import        Import data from $DataDir"
    Write-Host "  -Export        Export data to $DataDir on exit"
    Write-Host "  -Help          Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\start-emulators.ps1                 # Start emulators normally"
    Write-Host "  .\start-emulators.ps1 -Docker         # Start in Docker"
    Write-Host "  .\start-emulators.ps1 -Import -Export # Import and export data"
    exit 0
}

Write-ColorOutput "╔════════════════════════════════════════════╗" -Color Cyan
Write-ColorOutput "║   Avalo Firebase Emulator Suite           ║" -Color Cyan
Write-ColorOutput "╚════════════════════════════════════════════╝" -Color Cyan
Write-Host ""

# Docker mode
if ($Docker) {
    Write-ColorOutput "Starting emulators in Docker mode..." -Color Yellow
    
    # Check if Docker is installed
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-ColorOutput "Error: Docker is not installed" -Color Red
        exit 1
    }
    
    # Check if docker-compose is installed
    if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        Write-ColorOutput "Error: docker-compose is not installed" -Color Red
        exit 1
    }
    
    # Start Docker containers
    if ($Detach) {
        docker-compose -f docker-compose.emulators.yml up -d
    } else {
        docker-compose -f docker-compose.emulators.yml up
    }
    
    exit 0
}

# Native mode (without Docker)
Write-ColorOutput "Starting emulators in native mode..." -Color Yellow

# Check if Firebase CLI is installed
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-ColorOutput "Error: Firebase CLI is not installed" -Color Red
    Write-ColorOutput "Install it with: npm install -g firebase-tools" -Color Yellow
    exit 1
}

# Check if firebase.json exists
if (-not (Test-Path "firebase.json")) {
    Write-ColorOutput "Error: firebase.json not found" -Color Red
    Write-ColorOutput "Please run this script from the project root" -Color Yellow
    exit 1
}

# Build Firebase Functions if needed
if (Test-Path "functions") {
    Write-ColorOutput "Building Firebase Functions..." -Color Yellow
    Push-Location functions
    if (Test-Path "package.json") {
        npm run build
    }
    Pop-Location
}

# Prepare emulator command
$EmulatorCmd = "firebase emulators:start --project=$ProjectName"

if ($Import -and (Test-Path $DataDir)) {
    $EmulatorCmd += " --import=$DataDir"
    Write-ColorOutput "Importing data from $DataDir" -Color Green
}

if ($Export) {
    $EmulatorCmd += " --export-on-exit=$DataDir"
    Write-ColorOutput "Data will be exported to $DataDir on exit" -Color Green
}

Write-Host ""
Write-ColorOutput "Starting Firebase Emulators..." -Color Green
Write-Host ""
Write-ColorOutput "Emulator UI:       http://localhost:4000" -Color Cyan
Write-ColorOutput "Auth:              http://localhost:9099" -Color Cyan
Write-ColorOutput "Firestore:         http://localhost:8080" -Color Cyan
Write-ColorOutput "Functions:         http://localhost:5001" -Color Cyan
Write-ColorOutput "Storage:           http://localhost:9199" -Color Cyan
Write-ColorOutput "PubSub:            http://localhost:8085" -Color Cyan
Write-Host ""
Write-ColorOutput "Press Ctrl+C to stop the emulators" -Color Yellow
Write-Host ""

# Run emulators
if ($Detach) {
    $Process = Start-Process -FilePath "firebase" -ArgumentList "emulators:start --project=$ProjectName" -PassThru -WindowStyle Hidden -RedirectStandardOutput "emulators.log" -RedirectStandardError "emulators-error.log"
    $Process.Id | Out-File -FilePath ".emulator.pid"
    Write-ColorOutput "Emulators started in background (PID: $($Process.Id))" -Color Green
    Write-ColorOutput "Logs: Get-Content emulators.log -Wait" -Color Yellow
    Write-ColorOutput "Stop: Stop-Process -Id (Get-Content .emulator.pid)" -Color Yellow
} else {
    Invoke-Expression $EmulatorCmd
}