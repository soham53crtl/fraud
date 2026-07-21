$ErrorActionPreference = "Continue"
Write-Host "== Citizen Fraud Shield AI - setup ==" -ForegroundColor Cyan
if (-not (Test-Path ".\backend") -or -not (Test-Path ".\frontend")) {
    Write-Host "ERROR: run this from the project root." -ForegroundColor Red
    exit 1
}
Write-Host "[1/4] Checking port 5000..." -ForegroundColor Yellow
$conn = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $pidList = $conn | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pidToKill in $pidList) { Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}
Write-Host "[2/4] Installing backend..." -ForegroundColor Yellow
Push-Location backend
npm install
if (-not (Test-Path ".env")) { Copy-Item .env.example .env }
Pop-Location
Write-Host "[3/4] Installing frontend..." -ForegroundColor Yellow
Push-Location frontend
npm install
if (-not (Test-Path ".env")) { Copy-Item .env.example .env }
Pop-Location
Write-Host "[4/4] Seeding database..." -ForegroundColor Yellow
Push-Location backend
npm run seed
Pop-Location
Write-Host "== Done. Now run: cd backend; npm run dev  (and in another terminal) cd frontend; npm run dev ==" -ForegroundColor Cyan
