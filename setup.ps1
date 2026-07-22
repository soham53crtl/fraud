# Citizen Fraud Shield AI - one-click local setup (Windows PowerShell)
#
# Run this from INSIDE the extracted project folder (the one that has
# backend and frontend as direct subfolders). It will:
#   1. Free up port 5000 if an old backend process is still holding it
#   2. npm install both apps
#   3. Seed the database with demo accounts, fraud graph, and geo complaints
#   4. Print the exact next commands to start both servers
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Continue"

Write-Host "== Citizen Fraud Shield AI - setup ==" -ForegroundColor Cyan

if (-not (Test-Path ".\backend") -or -not (Test-Path ".\frontend")) {
    Write-Host "ERROR: run this script from the project root (the folder that contains backend and frontend)." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[1/4] Checking port 5000..." -ForegroundColor Yellow
$conn = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $pidList = $conn | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pidToKill in $pidList) {
        Write-Host ("  Port 5000 is in use by PID " + $pidToKill + " - stopping it.") -ForegroundColor Yellow
        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
} else {
    Write-Host "  Port 5000 is free." -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/4] Installing backend dependencies..." -ForegroundColor Yellow
Push-Location backend
npm install
if (-not (Test-Path ".env")) {
    Write-Host "  No backend .env found - copying .env.example. Edit it with your MongoDB URI before continuing." -ForegroundColor Red
    Copy-Item .env.example .env
}
Pop-Location

Write-Host ""
Write-Host "[3/4] Installing frontend dependencies (includes leaflet for the map)..." -ForegroundColor Yellow
Push-Location frontend
npm install
if (-not (Test-Path ".env")) {
    Copy-Item .env.example .env
}
Pop-Location

Write-Host ""
Write-Host "[4/4] Seeding demo data into MongoDB..." -ForegroundColor Yellow
Push-Location backend
npm run seed
Pop-Location

Write-Host ""
Write-Host "== Setup complete ==" -ForegroundColor Cyan
Write-Host "Now open TWO terminals:"
Write-Host "  Terminal 1:  cd backend; npm run dev"
Write-Host "  Terminal 2:  cd frontend; npm run dev   then open http://localhost:5173/"
Write-Host ""
Write-Host "Demo logins: citizen@demo.com / citizen123, officer@demo.com / officer123 (see backend/seed.js for all)"
