param(
    [string]$Branch = "dev"
)

Write-Host "=== Vibe Browser Auto-Build & Install ===" -ForegroundColor Cyan
Write-Host "Branch: $Branch" -ForegroundColor Gray

# 1. Pull latest code (with upstream sync from GitHub Actions)
Write-Host "[1/5] Pulling latest code..." -ForegroundColor Yellow
git checkout $Branch
git pull origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to pull latest code" -ForegroundColor Red
    exit 1
}

# 2. Check if engine sync needed
Write-Host "[2/5] Checking if upstream sync is needed..." -ForegroundColor Yellow
$surferJson = Get-Content "surfer.json" -Raw | ConvertFrom-Json
$currentVersion = $surferJson.version.version

# Check latest Zen Browser release
try {
    $apiResp = Invoke-RestMethod -Uri "https://api.github.com/repos/zen-browser/desktop/releases/latest" -Headers @{ "User-Agent" = "VibeBrowser" }
    $latestTag = $apiResp.tag_name -replace "^v", ""
    Write-Host "Current: $currentVersion, Latest: $latestTag" -ForegroundColor Gray
    
    if ($latestTag -ne $currentVersion) {
        Write-Host "[3/5] Syncing upstream to $latestTag..." -ForegroundColor Yellow
        npm run sync
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Sync failed. Check for conflicts." -ForegroundColor Red
            exit 1
        }
        npm run import
    } else {
        Write-Host "[3/5] Already up to date." -ForegroundColor Green
    }
} catch {
    Write-Host "Could not check upstream: $_" -ForegroundColor DarkYellow
    Write-Host "Skipping sync..." -ForegroundColor DarkYellow
}

# 4. Build
Write-Host "[4/5] Building browser..." -ForegroundColor Yellow
$buildId = Get-Date -Format "yyyyMMddHHmmss"
npm run build -- --moz-build-date $buildId
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit 1
}

# 5. Create and launch installer
Write-Host "[5/5] Installing..." -ForegroundColor Yellow
$distPath = ".\dist"
if (-not (Test-Path $distPath)) { Write-Host "dist/ directory not found" -ForegroundColor DarkYellow; return }
$installer = Get-ChildItem -Path $distPath -Filter "*.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($installer) {
    Write-Host "Installer: $($installer.FullName)" -ForegroundColor Gray
    Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait
    Write-Host "Update installed! Restarting browser..." -ForegroundColor Green
} else {
    Write-Host "No installer found in dist/ - copy manually" -ForegroundColor DarkYellow
}

Write-Host "=== Done ===" -ForegroundColor Cyan
