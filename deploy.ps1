# ================= Build & Deploy Script =================
# Usage: run in project root:  .\deploy.ps1
# Output: beegame.exe (frontend is embedded, copy this single file to deploy)

$ErrorActionPreference = "Stop"

Write-Host "==> [1/3] Building frontend (npm run build)..." -ForegroundColor Cyan
Push-Location frontend
if (-not (Test-Path node_modules)) { npm install }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build FAILED!" -ForegroundColor Red; Pop-Location; exit 1 }
Pop-Location

Write-Host "==> [2/3] Compiling Go backend (frontend embedded into exe)..." -ForegroundColor Cyan
if (-not $env:GOPROXY) { $env:GOPROXY = "https://goproxy.cn,direct" }
go build -o beegame.exe ./backend
if ($LASTEXITCODE -ne 0) { Write-Host "Go build FAILED!" -ForegroundColor Red; exit 1 }

Write-Host "==> [3/3] Done!" -ForegroundColor Green
Write-Host ""
Write-Host "Run:" -ForegroundColor Yellow
Write-Host "  .\beegame.exe"
Write-Host "Then open http://localhost:8080"
Write-Host ""
Write-Host "Deploy: just copy beegame.exe to any machine. No Node.js needed."
